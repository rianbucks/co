# 원산지증명서 (C/O)

목소리를 녹음하면 사투리 권역과 농도를 판정해 감정서를 발급하는 모바일 웹 서비스입니다. 명세는 [docs/SPEC.md](docs/SPEC.md)에 있습니다.

지금 구현된 것은 판정 파이프라인(명세 4장)과 `POST /api/judge`(명세 7장)입니다. 화면, 랭킹, 음성 저장, DB는 아직 없습니다.

## 실행

Node.js 22 이상이 필요합니다(`@google/genai` 요구 사항).

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 `GEMINI_API_KEY`를 넣습니다. 키 없이 확인하려면 `MOCK_AI=true`로 둡니다.

## 환경 변수

| 이름 | 설명 | 기본값 |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini API 키. `.env.local`이나 배포 설정에만 둔다 | 없음 |
| `MOCK_AI` | `true`면 Gemini를 부르지 않고 명세 4장 모델 출력 예시로 후처리까지 실행한다 | `false` |
| `GEMINI_MODEL` | 판정 모델 | `gemini-3.8-flash` |
| `GEMINI_THINKING_LEVEL` | 사고 수준. `gemini-3.8-flash`는 `low`, `medium`, `high`만 지원한다 | `medium` |

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
- 성공 응답의 `transcript`(받아쓰기)는 서버에 저장하지 않습니다.

## 코드 위치

| 파일 | 내용 |
| --- | --- |
| `src/app/api/judge/route.ts` | `POST /api/judge` |
| `src/lib/judge/pipeline.ts` | 서버 검사 → 호출 제한 → AI 호출(1회 재시도) → 후처리 |
| `src/lib/judge/postprocess.ts` | 후처리 순수 함수: 확률 정규화, 근거 검증, 농도, 등급, 판정 지역, 소견 |
| `src/lib/judge/rules.ts` | 권역 이름, 농도 가중치, 등급표 |
| `src/lib/judge/opinions.ts` | 소견 문구(임시, 등급별 1개) |
| `src/lib/judge/model-output.ts` | Gemini 출력 JSON 스키마와 검증 |
| `src/lib/judge/prompt.ts` | 지시문과 문항 세트 |
| `src/lib/judge/audio.ts` | 파일 크기와 형식 검사 |
| `src/lib/gemini.ts` | Gemini 호출. SDK는 이 파일에서만 쓴다 |
| `src/lib/rate-limit.ts` | 호출 제한 인터페이스. 구현은 DB를 붙일 때 한다 |
