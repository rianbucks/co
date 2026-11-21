# 원산지증명서 (C/O)

목소리를 녹음하면 사투리 권역과 농도를 판정해 감정서를 발급하는 모바일 웹 서비스입니다. 명세는 [docs/SPEC.md](docs/SPEC.md)에 있습니다.

## 지금 구현된 것

- 화면 S1~S7: 첫 화면, 안내와 동의, 녹음, 심사 중, 결과, 감정서, 농도 랭킹
- `POST /api/judge`: 판정 파이프라인(명세 4장, 7장). 첫 시도가 실패하면 대체 모델로 1회 재시도. 첫 시도 25초, 재시도까지 40초 안에 끝내고, 화면(S4)은 45초까지 기다린다(`src/lib/judge/timing.ts`)
- 경상 정밀 감정 탭(명세 12장): 머리글 탭(S1에는 머리글이 없어 S1 버튼), 1순위가 경상인 S5의 권유 버튼으로 들어간다. 신고 원산지(대구, 경북, 부산, 울산, 경남)를 고르고 `set-gs` 문항을 녹음하면 경북권·경남권 성분 비율, 경상 농도와 등급, 원산지 일치 여부를 보여 주고 정밀 감정서(PNG 저장, 공유)를 발급한다
- 정밀 감정 랭킹(명세 12장): 기존 랭킹과 따로 저장하는 정밀 감정 전용 랭킹. 전체, 대구·경북, 부산·울산·경남(신고 원산지 기준)으로 나눠 본다. `POST /api/gyeongsang-ranking`, `GET /api/gyeongsang-ranking`, 운영자용 `DELETE /api/gyeongsang-ranking/{id}`
- 농도 랭킹(명세 확장 1): 음성 없이 닉네임과 농도만 공개. `POST /api/ranking`, `GET /api/ranking`, 운영자용 `DELETE /api/ranking/{id}`
- 호출 제한(감정: IP당 하루 60회와 전체 1,500회, 랭킹 등록: IP당 하루 60회)과 랭킹 저장: Upstash Redis
- 정확도 검증 스크립트(명세 3장)

음성과 받아쓰기는 어디에도 저장하지 않습니다. 랭킹에 저장하는 값은 닉네임, 농도, 지역, 등급, 등록 시각뿐입니다. 정밀 감정 랭킹에 저장하는 값은 닉네임, 신고 원산지, 경상 농도, 경북권 비율, 등록 시각뿐입니다. 신고 원산지는 정밀 감정 랭킹에 등록할 때만 서버로 보냅니다. 확장 2(표준어 검정)는 없고, 확장 3(지역 세분화)은 경상만 경상 정밀 감정 탭으로 만들었습니다.

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
| `MOCK_AI` | `true`면 Gemini를 부르지 않고 명세 4장 모델 출력 예시로 후처리까지 실행한다. 녹음한 세트의 문항 수에 맞춰 `set-b`(6문항)나 `set-a`(4문항) 가짜 출력을 쓰고, 경상 정밀 감정(`set-gs`)은 경상 전용 가짜 출력(명세 12장)을 쓴다. 이 모드의 결과는 랭킹에 등록할 수 없다 | `false` |
| `NEXT_PUBLIC_QUESTION_SET` | 일반 감정 문항 세트. 비우면 `set-b`(바꿔 말하기 4문항과 상황극 2문항, 60초), `set-a`면 이전 구성(상황극 4문항, 40초)으로 되돌린다. 빌드할 때 화면 코드에 들어가므로 바꾼 뒤 다시 빌드(배포)한다(명세 8장) | `set-b` |
| `GEMINI_MODEL` | 판정 모델 | `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODEL` | 첫 시도가 실패하면 재시도 1회에 쓰는 모델 | `gemini-3.5-flash-lite` |
| `GEMINI_THINKING_LEVEL` | 사고 수준. `gemini-3.8-flash`는 `low`, `medium`, `high`만 지원한다 | `medium` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis REST 주소와 토큰(호출 제한과 랭킹 저장). Vercel Marketplace로 연결하면 자동으로 들어간다. 읽기 전용 토큰은 쓰지 않는다 | 없음 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash를 직접 넣을 때 쓰는 이름. 둘 중 하나라도 있으면 `KV_REST_API_*`보다 먼저 쓴다 | 없음 |
| `ADMIN_TOKEN` | 운영자 토큰. 랭킹 항목 삭제(`DELETE /api/ranking/{id}`, `DELETE /api/gyeongsang-ranking/{id}`)에 쓴다. 공백 없는 16자 이상이어야 하며, 없거나 짧으면 삭제 요청을 모두 거절한다 | 없음 |

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
curl -F "audio=@recording.webm" -F "questionSetId=set-b" http://localhost:3000/api/judge
```

경상 정밀 감정은 `questionSetId`만 바꿉니다.

```bash
curl -F "audio=@recording.webm" -F "questionSetId=set-gs" http://localhost:3000/api/judge
```

## API

`POST /api/judge`는 명세 7장의 요청, 응답, 오류 형식을 따릅니다.

- 요청은 multipart로 `audio`(녹음 파일)와 `questionSetId`를 보냅니다. `set-b`는 일반 감정 기본 세트(바꿔 말하기 4문항, 상황극 2문항), `set-a`는 일반 감정 이전 구성(상황극 4문항), `set-gs`는 경상 정밀 감정(명세 12장)입니다. 화면은 `NEXT_PUBLIC_QUESTION_SET`으로 정한 일반 감정 세트를 보냅니다.
- 녹음 길이(문항당 10초, `set-b` 합계 60초, `set-a` 합계 40초)는 화면에서 지킵니다. 서버는 파일 크기(2MB)와 형식만 검사합니다.
- `segments`에는 문항 종류 `kind`가 붙습니다. `convert`(바꿔 말하기)면 `prompt`는 바꿔 말할 표준어 문장이고, `question`(상황 답하기)이면 상황 문구입니다(명세 7장).
- 성공 응답에는 전체 받아쓰기 `transcript`와 문항별 받아쓰기 `segments`가 들어가며, 둘 다 서버에 저장하지 않습니다. 근거(`evidence`)는 문항 번호 `question`을 달고 그 문항의 받아쓰기로 검증합니다. 모델이 문항별 받아쓰기를 문항 수만큼 주지 않으면 `segments`는 빈 배열이고 근거는 전체 받아쓰기로 검증합니다(명세 4장, 7장).
- 모델은 근거를 먼저 적고 권역 확률을 나중에 정합니다. 근거마다 그 특징이 가리키는 권역(`evidence[].region`, 여러 권역에 공통이면 `common`)이 붙습니다. 검증을 통과한 근거 중 1순위 권역을 가리키는 것이 2개 미만이거나 다른 권역을 가리키는 것이 더 많으면 `region.uncertain`이 true이고, 화면과 감정서는 "판정 유보 (추정: ○○ 방언)"으로 표시합니다(명세 4장). 유보 결과는 랭킹에 등록할 수 없습니다(403 `not_eligible`, `reason: "uncertain"`).
- 감정에 성공하면 랭킹 등록 자격(농도, 1순위 권역, 등급, 가짜 응답 여부, 판정 유보 여부)을 감정 `id`로 1시간 저장합니다.
- 음성과 받아쓰기는 저장하거나 공개하지 않으므로 녹음 내용(욕설, 개인정보)으로는 랭킹 등록을 막지 않습니다. 등록을 거절하는 결과는 가짜 응답 결과와 판정 유보 결과뿐입니다(일반 랭킹, 정밀 감정 랭킹 모두).
- `set-gs`는 6문항(바꿔 말하기 4, 상황 질문 2, 합계 60초)이고, 성공 응답은 정밀 감정 결과(`subregions`, `intensity`, `evidence`, `transcript`, 문항 종류가 붙은 `segments`, `g_`로 시작하는 `id`)입니다. 정밀 감정 지시문에는 경북권과 경남권을 가르는 말꼴 몇 가지가 참고 기준으로 들어갑니다(명세 12장). 경상 방언으로 보기 어려우면 422 `rejected`, `reason: "not_gyeongsang"`입니다. 호출 제한은 일반 감정과 합쳐 세고, 정밀 감정 랭킹 등록 자격(경상 농도, 경북권 비율, 가짜 응답 여부)을 정밀 감정 `id`로 1시간 저장합니다.

랭킹 API의 형식과 오류는 명세 7장에 있습니다.

```bash
# 등록: 점수는 보내지 않는다. 서버가 감정할 때 남긴 값을 쓴다. 감정 후 1시간 안에, 감정 1건당 1회
curl -X POST -H "Content-Type: application/json" \
  -d '{"judgmentId":"j_0123456789ab","nickname":"부산갈매기"}' \
  http://localhost:3000/api/ranking

# 조회: 상위 50명과 전체 수. id를 주면 그 항목의 순위를 me로 돌려준다
curl "http://localhost:3000/api/ranking?limit=50&id=r_0123456789ab"
```

정밀 감정 랭킹은 같은 규칙으로 따로 등록하고 조회합니다. 등록할 때 신고 원산지(`daegu`, `gyeongbuk`, `busan`, `ulsan`, `gyeongnam`)를 함께 보내고, 조회는 `area`(`all`, `gyeongbuk`, `gyeongnam`)로 신고 원산지별 보기를 고릅니다. 등록 한도(IP당 하루 60회)는 기존 랭킹 등록과 합쳐 셉니다.

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"judgmentId":"g_0123456789ab","nickname":"대구토박이","origin":"daegu"}' \
  http://localhost:3000/api/gyeongsang-ranking

curl "http://localhost:3000/api/gyeongsang-ranking?area=gyeongbuk&limit=50&id=gr_0123456789ab"
```

## 랭킹 운영

부적절한 닉네임은 조회 응답에서 항목 `id`를 찾아 지웁니다. 지운 감정 결과는 다시 등록할 수 없습니다.

```bash
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://<배포 주소>/api/ranking/r_0123456789ab
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://<배포 주소>/api/gyeongsang-ranking/gr_0123456789ab
```

대회가 끝나면 Upstash 콘솔에서 랭킹 키(`co:ranking`, `co:ranking:entries`)와 정밀 감정 랭킹 키(`co:gs:ranking`, `co:gs:ranking:gyeongbuk`, `co:gs:ranking:gyeongnam`, `co:gs:ranking:entries`)를 지웁니다. 감정 기록(`co:judgment:*`, `co:gs:judgment:*`)은 1시간, 호출 제한 키는 다음 날 0시(KST)에 저절로 만료됩니다. 키 구조는 명세 7장 데이터 모델에 있습니다.

## 정확도 검증

명세 3장의 검증(권역 정답률, 근거의 진위, 같은 파일의 일관성, 응답 시간)을 실제 Gemini로 돌리는 스크립트가 있습니다. 음성 파일과 결과는 커밋되지 않습니다. 사용법은 [validation/README.md](validation/README.md)에 있습니다.

```bash
npm run validate -- --csv validation/answers.csv --runs 3
```

## 코드 위치

| 파일 | 내용 |
| --- | --- |
| `src/app/page.tsx` | 화면 전환(S1~S7), 머리글 탭(일반 감정, 경상 정밀 감정)과 상태 |
| `src/components/screens/` | 화면 S1~S7. 랭킹 화면은 `S7Ranking.tsx` |
| `src/components/gyeongsang/` | 경상 정밀 감정 흐름(`GyeongsangFlow.tsx`), 원산지 신고, 정밀 결과, 정밀 감정서와 PNG 그리기, 정밀 감정 랭킹(`GsRanking.tsx`) |
| `src/app/api/gyeongsang-ranking/route.ts`, `[id]/route.ts` | 정밀 감정 랭킹 등록, 조회, 운영자 삭제 |
| `src/lib/gyeongsang/ranking/` | 정밀 감정 랭킹 규칙(`service.ts`), 저장소(`store.ts`, 키 `co:gs:*`), 응답 타입(`contract.ts`) |
| `src/app/api/judge/route.ts` | `POST /api/judge` |
| `src/app/api/ranking/route.ts` | `POST /api/ranking`, `GET /api/ranking` |
| `src/app/api/ranking/[id]/route.ts` | `DELETE /api/ranking/{id}` (운영자) |
| `src/lib/judge/pipeline.ts` | 서버 검사 → 호출 제한 → AI 호출(실패하면 대체 모델로 1회 재시도) → 후처리 → 랭킹 등록 자격 기록 |
| `src/lib/judge/timing.ts` | 응답 제한 시간: AI 첫 시도 25초, 전체 40초, 심사 화면 대기 45초와 단계 전환 시각. 일반 감정과 경상 정밀 감정이 같이 쓴다 |
| `src/lib/judge/postprocess.ts` | 후처리 순수 함수: 확률 정규화, 근거 검증, 판정 유보, 농도, 등급, 판정 지역, 소견 |
| `src/lib/judge/rules.ts` | 권역 이름, 판정 지역 표기(혼합 방언, 판정 유보), 농도 가중치, 등급표 |
| `src/lib/judge/opinions.ts` | 소견 문구(등급 × 가장 높은 항목, 20개) |
| `src/lib/judge/model-output.ts` | Gemini 출력 JSON 스키마와 검증 |
| `src/lib/judge/prompt.ts` | 지시문(바꿔 말하기 문항이 섞인 세트는 문항 종류와 바꿔 말하기 규칙을 넣는다) |
| `src/lib/judge/questions.ts` | 일반 감정 문항 세트(`set-b` 기본, `set-a` 이전 구성)와 `NEXT_PUBLIC_QUESTION_SET`. 녹음 화면과 지시문이 함께 쓴다 |
| `src/lib/judge/audio.ts` | 파일 크기와 형식 검사 |
| `src/lib/gyeongsang/questions.ts` | 경상 정밀 감정 문항(`set-gs`, 확정 문구). 바꿔 말하기 4문항과 상황 질문 2문항, 60초. 5번의 흉내 문장(인용 상자)도 이 파일에 있다 |
| `src/lib/gyeongsang/pipeline.ts` | 경상 정밀 감정 파이프라인: 서버 검사 → 호출 제한(일반 감정과 합산) → AI 호출과 재시도 → 후처리 |
| `src/lib/gyeongsang/prompt.ts`, `model-output.ts`, `postprocess.ts` | 경상 전용 지시문, 출력 스키마와 검증, 성분 비율과 근거 검증, 농도 |
| `src/lib/gyeongsang/origin.ts` | 신고 원산지와 원산지 일치 판정(화면에서 쓴다) |
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
