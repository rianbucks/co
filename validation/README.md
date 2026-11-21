# 정확도 검증

명세 3장 검증 계획의 항목(권역 정답률, 근거의 진위, 같은 파일의 결과 일관성, 응답 시간)을 실제 Gemini로 잽니다. 운영과 같은 지시문, 문항, 출력 스키마, 후처리를 쓰고, 모델 자체를 재기 위해 재시도와 대체 모델 없이 모델마다 한 번씩 부릅니다.

## 준비

1. 음성 파일을 `validation/samples/`에 넣습니다. 이 폴더와 결과 폴더(`validation/results/`)는 커밋되지 않습니다.
2. 정답 CSV를 만듭니다. 형식은 `answers.example.csv`를 보세요. UTF-8로 저장합니다(엑셀이라면 "CSV UTF-8" 형식).
   - `file`: `validation/samples/` 안의 파일 이름
   - `region`: 정답 권역. `gyeongsang` 같은 키, 또는 `경상`, `전라`, `서울경기`, `표준어` 같은 한글 이름
   - `questionSetId`: 그 파일을 녹음한 문항 세트. `set-b`(지금 화면의 기본, 6문항 60초) 또는 `set-a`(이전 구성, 4문항 40초). 세트마다 지시문, 문항 수, 문항별 받아쓰기 검증이 달라지므로 녹음한 세트를 적습니다. 비우면 이 열이 생길 때부터 쓰던 `set-a`로 처리하고, 실행할 때 빈 행을 경고합니다
3. `.env.local`에 `GEMINI_API_KEY`를 넣습니다.

명세 3장 계획대로라면 5개 권역에서 2개씩, 표준어 화자 2개로 12개 샘플을 준비합니다.

## 실행

```bash
npm run validate -- --csv validation/answers.csv --models gemini-3.8-flash,gemini-3.5-flash-lite,gemini-4-argon --runs 3
```

| 옵션 | 내용 | 기본값 |
| --- | --- | --- |
| `--csv` | 정답 CSV | `validation/answers.csv` |
| `--samples` | 음성 파일 폴더 | `validation/samples` |
| `--out` | 결과 폴더 | `validation/results` |
| `--models` | 비교할 모델(쉼표로 구분) | `GEMINI_MODEL` 또는 `gemini-3.8-flash` |
| `--runs` | 파일마다 모델별 반복 횟수 | 3 |
| `--thinking` | 사고 수준 | `GEMINI_THINKING_LEVEL` 또는 `medium` |
| `--timeout-ms` | 호출 한 번의 제한 시간 | 60000 |
| `--delay-ms` | 호출 사이 쉬는 시간 | 1000 |
| `--dry-run` | Gemini 대신 가짜 응답으로 흐름만 확인(키 불필요) | |

처음 실행할 때 `npx`가 TypeScript 실행 도구(tsx)를 내려받습니다.

## 결과

`validation/results/<시각>/`에 세 파일이 생깁니다.

- `summary.md`: 모델별 권역 정답(파일별 다수결, 호출 기준), 명세 3장 기준의 판단, 같은 파일 결과 일치, 받아쓰기에 없어 걸러진 근거, 응답 시간, 운영 첫 시도 제한(25초)을 넘긴 호출 수, 평균 토큰과 호출당 예상 비용
- `runs.csv`: 호출 한 번마다 한 줄. `question_set` 열은 문항 세트, `uncertain` 열은 판정 유보 여부입니다
- `details.md`: 호출마다 문항 세트, 전체 받아쓰기, 문항별 받아쓰기, 근거(문항 번호, 항목과 가리키는 권역, 통과 여부). 판정 유보면 판정 줄에 "(판정 유보)"가 붙습니다. 근거는 운영과 같이 그 문항의 받아쓰기에서 찾고, 문항별 받아쓰기가 없는 호출은 전체 받아쓰기에서 찾습니다. 근거가 실제 녹음에 있는지는 이 파일을 보며 녹음을 들어 확인합니다.

## 주의

- 무료 등급 키로 보낸 음성은 Google 제품 개선에 쓰일 수 있습니다(명세 9장). 팀원 본인의 목소리로만 검증합니다.
- `gemini-4-argon`은 무료 등급이 없어 요금이 나갑니다.
- 호출 한도에 걸려 `call_error`가 나면 `--delay-ms`를 늘려 다시 돌립니다.
- 예상 비용은 명세 3장의 가격표로 계산하며, 사고 토큰은 출력 단가로 더합니다.
