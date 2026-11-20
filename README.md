# 원산지증명서 (C/O)

목소리를 녹음하면 사투리 권역과 농도를 판정해 감정서를 발급하는 모바일 웹 서비스입니다. 명세는 [docs/SPEC.md](docs/SPEC.md)에 있습니다.

## 지금 구현된 것

- 화면 S1~S7: 첫 화면, 안내와 동의, 녹음, 심사 중, 결과, 감정서, 농도 랭킹
- `POST /api/judge`: 판정 파이프라인(명세 4장, 7장). 첫 시도가 실패하면 대체 모델로 1회 재시도
- 농도 랭킹(명세 확장 1): 음성 없이 닉네임과 농도만 공개. `POST /api/ranking`, `GET /api/ranking`, 운영자용 `DELETE /api/ranking/{id}`
- 호출 제한(감정: IP당 하루 60회와 전체 1,500회, 랭킹 등록: IP당 하루 60회)과 랭킹 저장: Upstash Redis
- 정확도 검증 스크립트(명세 3장)

음성과 받아쓰기는 어디에도 저장하지 않습니다. 랭킹에 저장하는 값은 닉네임, 농도, 지역, 등급, 등록 시각뿐입니다. 확장 2(표준어 검정)와 확장 3(지역 세분화)은 없습니다.

## 화면 디자인 참고

화면의 AI식 장식을 점검하고 제품에 맞는 시각 방향을 정하는 과정은 [unslop](https://github.com/heydamir/unslop)의 접근에서 참고했습니다. 원 저작자 Damir Sokolovsky, CC BY 4.0.

## 실행

Node.js 22 이상이 필요합니다(`@google/genai` 요구 사항).

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 `GEMINI_API_KEY`를 넣습니다. 키 없이 확인하려면 `MOCK_AI=true`로 둡니다. 이때 감정 결과는 랭킹에 등록할 수 없습니다(403 `not_eligible`, `reason: "mock"`).

`npm run dev`와 `npm run build`는 먼저 `scripts/build-css.mjs`로 Tailwind CSS(`src/app/globals.css`)를 다시 만듭니다.

## 환경 변수

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini API 키. `.env.local`이나 배포 설정에만 둔다 | 없음 |
| `MOCK_AI` | `true`면 Gemini를 부르지 않고 명세 4장 모델 출력 예시로 후처리까지 실행한다. 이 모드의 결과는 랭킹에 등록할 수 없다 | `false` |
| `GEMINI_MODEL` | 판정 모델 | `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODEL` | 첫 시도가 실패하면 재시도 1회에 쓰는 모델 | `gemini-3.5-flash-lite` |
| `GEMINI_THINKING_LEVEL` | 사고 수준. `gemini-3.8-flash`는 `low`, `medium`, `high`만 지원한다 | `medium` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis REST 주소와 토큰(호출 제한과 랭킹 저장). Vercel Marketplace로 연결하면 자동으로 들어간다. 읽기 전용 토큰은 쓰지 않는다 | 없음 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash를 직접 넣을 때 쓰는 이름. 둘 중 하나라도 있으면 `KV_REST_API_*`보다 먼저 쓴다 | 없음 |
| `ADMIN_TOKEN` | 운영자 토큰. 랭킹 항목 삭제(`DELETE /api/ranking/{id}`)에 쓴다. 공백 없는 16자 이상이어야 하며, 없거나 짧으면 삭제 요청을 모두 거절한다 | 없음 |

Production에서 Upstash 연결 값이 없으면 감정과 랭킹 API를 거절합니다(500 `server_error`). 가짜 응답 모드는 예외로, 호출 제한 없이 감정하고 랭킹은 인스턴스 메모리를 씁니다(등록은 403). 로컬에서는 Upstash가 없으면 프로세스 메모리로 대신합니다.

## 확인

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

MOCK 모드에서 API 호출 예:

```bash
curl -F "audio=@recording.webm" -F "questionSetId=set-a" http://localhost:3000/api/judge
```

## API

`POST /api/judge`는 명세 7장의 요청, 응답, 오류 형식을 따릅니다.

- 요청은 multipart로 `audio`(녹음 파일)와 `questionSetId`(지금은 `set-a`만 등록)를 보냅니다.
- 녹음 길이(문항당 10초, 합계 40초)는 화면에서 지킵니다. 서버는 파일 크기(2MB)와 형식만 검사합니다.
- 성공 응답에는 전체 받아쓰기 `transcript`와 문항별 받아쓰기 `segments`가 들어가며, 둘 다 서버에 저장하지 않습니다. 근거(`evidence`)는 문항 번호 `question`을 달고 그 문항의 받아쓰기로 검증합니다. 모델이 문항별 받아쓰기를 문항 수만큼 주지 않으면 `segments`는 빈 배열이고 근거는 전체 받아쓰기로 검증합니다(명세 4장, 7장).
- 감정에 성공하면 랭킹 등록 자격(농도, 1순위 권역, 등급, 가짜 응답 여부, flags 여부)을 감정 `id`로 1시간 저장합니다.

랭킹 API의 형식과 오류는 명세 7장에 있습니다.

```bash
# 등록: 점수는 보내지 않는다. 서버가 감정할 때 남긴 값을 쓴다. 감정 후 1시간 안에, 감정 1건당 1회
curl -X POST -H "Content-Type: application/json" \
  -d '{"judgmentId":"j_0123456789ab","nickname":"부산갈매기"}' \
  http://localhost:3000/api/ranking

# 조회: 상위 50명과 전체 수. id를 주면 그 항목의 순위를 me로 돌려준다
curl "http://localhost:3000/api/ranking?limit=50&id=r_0123456789ab"
```

## 랭킹 운영

부적절한 닉네임은 조회 응답에서 항목 `id`를 찾아 지웁니다. 지운 감정 결과는 다시 등록할 수 없습니다.

```bash
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://<배포 주소>/api/ranking/r_0123456789ab
```

대회가 끝나면 Upstash 콘솔에서 랭킹 키(`co:ranking`, `co:ranking:entries`)를 지웁니다. 감정 기록(`co:judgment:*`)은 1시간, 호출 제한 키는 다음 날 0시(KST)에 저절로 만료됩니다. 키 구조는 명세 7장 데이터 모델에 있습니다.

## 정확도 검증

명세 3장의 검증(권역 정답률, 근거의 진위, 같은 파일의 일관성, 응답 시간)을 실제 Gemini로 돌리는 스크립트가 있습니다. 음성 파일과 결과는 커밋되지 않습니다. 사용법은 [validation/README.md](validation/README.md)에 있습니다.

```bash
npm run validate -- --csv validation/answers.csv --runs 3
```

## 코드 위치

| 파일 | 내용 |
| --- | --- |
| `src/app/page.tsx` | 화면 전환(S1~S7)과 상태 |
| `src/components/screens/` | 화면 S1~S7. 랭킹 화면은 `S7Ranking.tsx` |
| `src/app/api/judge/route.ts` | `POST /api/judge` |
| `src/app/api/ranking/route.ts` | `POST /api/ranking`, `GET /api/ranking` |
| `src/app/api/ranking/[id]/route.ts` | `DELETE /api/ranking/{id}` (운영자) |
| `src/lib/judge/pipeline.ts` | 서버 검사 → 호출 제한 → AI 호출(실패하면 대체 모델로 1회 재시도) → 후처리 → 랭킹 등록 자격 기록 |
| `src/lib/judge/postprocess.ts` | 후처리 순수 함수: 확률 정규화, 근거 검증, 농도, 등급, 판정 지역, 소견 |
| `src/lib/judge/rules.ts` | 권역 이름, 농도 가중치, 등급표 |
| `src/lib/judge/opinions.ts` | 소견 문구(등급 × 가장 높은 항목, 20개) |
| `src/lib/judge/model-output.ts` | Gemini 출력 JSON 스키마와 검증 |
| `src/lib/judge/prompt.ts` | 지시문과 문항 세트 |
| `src/lib/judge/audio.ts` | 파일 크기와 형식 검사 |
| `src/lib/gemini.ts` | Gemini 호출. SDK는 이 파일에서만 쓴다 |
| `src/lib/ranking/service.ts` | 랭킹 등록, 조회, 삭제 규칙과 운영자 토큰 확인 |
| `src/lib/ranking/store.ts` | 랭킹 저장소: Upstash Redis와 로컬 메모리 |
| `src/lib/ranking/nickname.ts` | 닉네임 규칙(서버와 화면이 함께 쓴다) |
| `src/lib/ranking/contract.ts` | 랭킹 API 응답 타입과 오류 코드 |
| `src/lib/rate-limit.ts` | 하루 호출 제한(감정, 랭킹 등록). Upstash Redis Lua, 로컬은 메모리 |
| `src/lib/upstash.ts` | Upstash 연결 값 읽기(`UPSTASH_REDIS_REST_*`, `KV_REST_API_*`)와 REST pipeline 호출 |
| `scripts/build-css.mjs` | Tailwind CSS 생성(`npm run dev`, `npm run build` 전에 실행) |
| `scripts/validate.ts` | 정확도 검증 스크립트 |
| `src/lib/validation/` | 정답 CSV 읽기와 검증 결과 집계 |
