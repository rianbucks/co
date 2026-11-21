import type { AiClient } from "../judge/ai-client";

/**
 * 경상 정밀 감정의 가짜 모델 출력. set-gs 문항 4개(./questions.ts의 임시 문구)에 경상 방언으로 답한 녹음을 가정한다.
 * transcript는 문항별 받아쓰기를 순서대로 이은 것이고, 근거는 모두 그 문항의 받아쓰기에 있다.
 * 농도는 55×0.15 + 80×0.2 + 65×0.25 + 70×0.4 = 68.5 → 69(4등급)이고, 성분은 경북권 64, 경남권 36이다.
 */
export const GS_MOCK_MODEL_OUTPUT = {
  audio_quality: "ok",
  transcript:
    "엄마 내 지금 학교 앞이다, 금방 갈 끼라 니 내 과자 다 묵었나? 와 말도 없이 다 무뿟노 야 그거 무겁제? 이리 도, 내가 들어 주께 아지매 이 사과 얼만교? 쪼매만 깎아 주이소",
  question_transcripts: [
    "엄마 내 지금 학교 앞이다, 금방 갈 끼라",
    "니 내 과자 다 묵었나? 와 말도 없이 다 무뿟노",
    "야 그거 무겁제? 이리 도, 내가 들어 주께",
    "아지매 이 사과 얼만교? 쪼매만 깎아 주이소",
  ],
  not_gyeongsang: false,
  subregions: { gyeongbuk: 64, gyeongnam: 36 },
  scores: { vocabulary: 55, endings: 80, phonology: 65, intonation: 70 },
  evidence: [
    { question: 1, quote: "갈 끼라", note: "'갈 거야'를 뜻하는 경상 방언 종결 표현" },
    { question: 2, quote: "묵었나", note: "'먹었니'의 'ㅓ'가 'ㅜ'로 바뀐 발음과 의문형 어미 '-나'" },
    {
      question: 2,
      quote: "무뿟노",
      note: "'먹어 버렸니'를 줄인 말과 의문사와 함께 쓰는 어미 '-노'. 이 녹음에서는 경북권 억양으로 들린다",
    },
    { question: 3, quote: "무겁제", note: "확인하며 묻는 어미 '-제'" },
    {
      question: 4,
      quote: "얼만교",
      note: "어른께 묻는 의문형 '-ㄴ교'. 이 녹음에서는 경북권 억양으로 들린다",
    },
    { question: 4, quote: "주이소", note: "높여 부탁하는 명령형 어미 '-이소'" },
  ],
} as const;

/** MOCK_AI=true일 때 경상 정밀 감정에 쓰는 클라이언트. 이후 검증과 후처리는 실제 코드를 그대로 거친다. */
export const gsMockAiClient: AiClient = {
  async generate() {
    return JSON.stringify(GS_MOCK_MODEL_OUTPUT);
  },
};
