import type { AiClient } from "./ai-client";
import { DEFAULT_QUESTION_SET_ID, isGeneralQuestionSetId, type GeneralQuestionSetId } from "./questions";

/**
 * set-a(상황극 4문항, 이전 구성)의 가짜 출력. 문항 4개에 경상 방언으로 답한 녹음을 가정한다.
 * NEXT_PUBLIC_QUESTION_SET=set-a로 되돌렸을 때 가짜 응답 모드가 쓴다.
 * 근거 먼저, 판정 나중 순서다(받아쓰기 → 근거 → 권역 확률 → 항목 점수 → 모사 의심).
 * transcript는 문항별 받아쓰기를 순서대로 이은 것이고, 근거는 모두 그 문항의 받아쓰기에 있으며
 * 모두 경상을 가리킨다(1순위 경상을 뒷받침하므로 판정 유보가 아니다).
 */
export const SET_A_MODEL_OUTPUT_EXAMPLE = {
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

/**
 * 명세 4장의 모델 출력 예시. 기본 세트 set-b(바꿔 말하기 4문항, 상황극 2문항)에 경상 방언으로 답한 녹음을 가정한다.
 * 근거 먼저, 판정 나중 순서다(받아쓰기 → 근거 → 권역 확률 → 항목 점수 → 모사 의심).
 * 바꿔 말하기 문항의 근거는 주어진 표준어 문장과 달라진 부분이다.
 * transcript는 문항별 받아쓰기를 순서대로 이은 것이고, 근거는 모두 그 문항의 받아쓰기에 있으며
 * 모두 경상을 가리킨다(1순위 경상을 뒷받침하므로 판정 유보가 아니다). 항목 점수는 set-a 예시와 같다(농도 68).
 */
export const SPEC_MODEL_OUTPUT_EXAMPLE = {
  audio_quality: "ok",
  flags: [],
  transcript:
    "니 어디고? 와 이래 안 오노? 언제 올 끼고? 니 와 그라노? 무슨 일 있나? 괜찮나? 뭐라꼬? 잘 안 들린다. 다시 말해 바라. 아이다, 그기 아이고. 내 말 좀 들어 바라. 어, 니가 웬일이고? 억수로 오랜만이네 니 지금 웃음이 나오나? 퍼뜩 안 오고 뭐 했노",
  question_transcripts: [
    "니 어디고? 와 이래 안 오노? 언제 올 끼고?",
    "니 와 그라노? 무슨 일 있나? 괜찮나?",
    "뭐라꼬? 잘 안 들린다. 다시 말해 바라.",
    "아이다, 그기 아이고. 내 말 좀 들어 바라.",
    "어, 니가 웬일이고? 억수로 오랜만이네",
    "니 지금 웃음이 나오나? 퍼뜩 안 오고 뭐 했노",
  ],
  evidence: [
    {
      question: 1,
      quote: "어디고",
      type: "endings",
      region: "gyeongsang",
      note: "'어디야'를 의문사와 함께 쓰는 경상 방언 의문형 어미 '-고'로 바꿔 말함",
    },
    {
      question: 2,
      quote: "괜찮나",
      type: "endings",
      region: "gyeongsang",
      note: "'괜찮아'를 경상 방언 의문형 어미 '-나'로 바꿔 말함",
    },
    {
      question: 3,
      quote: "뭐라꼬",
      type: "phonology",
      region: "gyeongsang",
      note: "'뭐라고'의 'ㄱ'을 된소리로 발음함",
    },
    {
      question: 4,
      quote: "아이다",
      type: "vocabulary",
      region: "gyeongsang",
      note: "'아니야'를 경상 방언형 '아이다'로 바꿔 말함",
    },
    {
      question: 5,
      quote: "억수로",
      type: "vocabulary",
      region: "gyeongsang",
      note: "'아주'를 뜻하는 경상 방언 어휘",
    },
    {
      question: 5,
      quote: "웬일이고",
      type: "endings",
      region: "gyeongsang",
      note: "의문사와 함께 쓰는 경상 방언 의문형 어미 '-고'",
    },
    {
      question: 6,
      quote: "뭐 했노",
      type: "endings",
      region: "gyeongsang",
      note: "의문사와 함께 쓰는 경상 방언 의문형 어미 '-노'",
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

/** 세트별 가짜 출력. 녹음한 세트의 문항 수에 맞는 출력을 돌려준다. */
export const MOCK_MODEL_OUTPUTS = {
  "set-a": SET_A_MODEL_OUTPUT_EXAMPLE,
  "set-b": SPEC_MODEL_OUTPUT_EXAMPLE,
} as const satisfies Record<GeneralQuestionSetId, unknown>;

/**
 * MOCK_AI=true일 때 Gemini 대신 쓰는 클라이언트. 이후 검증과 후처리는 실제 코드를 그대로 거친다.
 * 요청의 questionSetId로 그 세트의 가짜 출력을 고른다. 모르는 값이면 기본 세트(set-b)다.
 */
export function mockAiClientFor(questionSetId: unknown): AiClient {
  const setId = isGeneralQuestionSetId(questionSetId) ? questionSetId : DEFAULT_QUESTION_SET_ID;
  const text = JSON.stringify(MOCK_MODEL_OUTPUTS[setId]);
  return {
    async generate() {
      return text;
    },
  };
}
