import type { AiClient } from "./ai-client";

/**
 * 명세 4장의 모델 출력 예시. set-a 문항 4개에 경상 방언으로 답한 녹음을 가정한다.
 * 근거 먼저, 판정 나중 순서다(받아쓰기 → 근거 → 권역 확률 → 항목 점수 → 모사 의심).
 * transcript는 문항별 받아쓰기를 순서대로 이은 것이고, 근거는 모두 그 문항의 받아쓰기에 있으며
 * 모두 경상을 가리킨다(1순위 경상을 뒷받침하므로 판정 유보가 아니다).
 */
export const SPEC_MODEL_OUTPUT_EXAMPLE = {
  audio_quality: "ok",
  flags: [],
  transcript:
    "어, 니가 웬일이고? 억수로 오랜만이네 니 지금 웃음이 나오나? 퍼뜩 안 오고 뭐 했노 그래 입고 나가모 얼어 죽는데이 할매 이거 진짜 맛있네예, 한 그릇 더 묵을게예",
  question_transcripts: [
    "어, 니가 웬일이고? 억수로 오랜만이네",
    "니 지금 웃음이 나오나? 퍼뜩 안 오고 뭐 했노",
    "그래 입고 나가모 얼어 죽는데이",
    "할매 이거 진짜 맛있네예, 한 그릇 더 묵을게예",
  ],
  evidence: [
    {
      question: 1,
      quote: "억수로",
      type: "vocabulary",
      region: "gyeongsang",
      note: "'아주'를 뜻하는 경상 방언 어휘",
    },
    {
      question: 1,
      quote: "웬일이고",
      type: "endings",
      region: "gyeongsang",
      note: "의문사와 함께 쓰는 경상 방언 의문형 어미 '-고'",
    },
    {
      question: 2,
      quote: "뭐 했노",
      type: "endings",
      region: "gyeongsang",
      note: "의문사와 함께 쓰는 경상 방언 의문형 어미 '-노'",
    },
    { question: 3, quote: "죽는데이", type: "endings", region: "gyeongsang", note: "경상 방언의 종결 어미 '-데이'" },
    {
      question: 4,
      quote: "묵을게예",
      type: "phonology",
      region: "gyeongsang",
      note: "'먹을게요'의 'ㅓ'가 'ㅜ'로 바뀐 발음",
    },
  ],
  regions: {
    seoul_gyeonggi: 4,
    gangwon: 3,
    chungcheong: 3,
    gyeongsang: 84,
    jeolla: 4,
    jeju: 2,
  },
  scores: { vocabulary: 40, endings: 85, phonology: 60, intonation: 75 },
  imitation_suspected: false,
} as const;

/** MOCK_AI=true일 때 Gemini 대신 쓰는 클라이언트. 이후 검증과 후처리는 실제 코드를 그대로 거친다. */
export const mockAiClient: AiClient = {
  async generate() {
    return JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE);
  },
};
