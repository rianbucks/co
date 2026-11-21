import type { AiClient } from "../judge/ai-client";

/**
 * 경상 정밀 감정의 가짜 모델 출력. set-gs 6문항(./questions.ts의 확정 문구)에 경상 방언으로 답한 녹음을 가정한다.
 * 바꿔 말하기 문항(1~4)의 근거는 주어진 문장과 달라진 부분이고, 5번은 서울 친구의 흉내 문장이 아니라 화자가 고쳐 말한
 * 문장에서만, 6번은 어른(집주인)께 쓴 높임 어미에서 근거를 든다.
 * transcript는 문항별 받아쓰기를 순서대로 이은 것이고, 근거는 모두 그 문항의 받아쓰기에 있다.
 * 농도는 55×0.15 + 80×0.2 + 65×0.25 + 70×0.4 = 68.5 → 69(2등급)이고, 성분은 경북권 64, 경남권 36이다.
 */
export const GS_MOCK_MODEL_OUTPUT = {
  audio_quality: "ok",
  transcript:
    "니 와 그카는데? 그카면 안 된다 카이 가가 뭐라카더노? 진짜 그캤나? 아, 우짜노? 큰일 났데이. 인자 우야노? 오늘 억수로 힘드네. 니는 안 힘드나? 쫌 쉬었다 하자 니 지금 뭐 하노? 내캉 같이 밥 묵으러 가자 사장님예, 보일러가 고장 나가 방이 얼음장 같심더. 퍼뜩 좀 고쳐 주이소",
  question_transcripts: [
    "니 와 그카는데? 그카면 안 된다 카이",
    "가가 뭐라카더노? 진짜 그캤나?",
    "아, 우짜노? 큰일 났데이. 인자 우야노?",
    "오늘 억수로 힘드네. 니는 안 힘드나? 쫌 쉬었다 하자",
    "니 지금 뭐 하노? 내캉 같이 밥 묵으러 가자",
    "사장님예, 보일러가 고장 나가 방이 얼음장 같심더. 퍼뜩 좀 고쳐 주이소",
  ],
  not_gyeongsang: false,
  subregions: { gyeongbuk: 64, gyeongnam: 36 },
  scores: { vocabulary: 55, endings: 80, phonology: 65, intonation: 70 },
  evidence: [
    { question: 1, quote: "그카는데", note: "'그렇게 하는데'를 '카'로 줄인 말꼴. 대구·경북 쪽에서 흔하다" },
    {
      question: 2,
      quote: "뭐라카더노",
      note: "'뭐라고 하더냐'를 '카'로 줄이고 의문사와 함께 쓰는 어미 '-노'를 붙인 말. 경북권에 가깝다",
    },
    { question: 3, quote: "우짜노", note: "'어떡하지'를 의문사와 함께 쓰는 경상 방언 의문형 '-노'로 바꿔 말함" },
    { question: 4, quote: "억수로", note: "'진짜'를 경상 방언 어휘 '억수로'로 바꿔 말함" },
    { question: 5, quote: "뭐 하노", note: "흉내 문장의 '뭐 하나'를 의문사에 맞는 어미 '-노'로 고쳐 말함" },
    { question: 6, quote: "같심더", note: "어른께 쓰는 경상 방언 높임 어미 '-심더'" },
    { question: 6, quote: "주이소", note: "어른께 부탁하는 경상 방언 높임 명령형 '-이소'" },
  ],
} as const;

/** MOCK_AI=true일 때 경상 정밀 감정에 쓰는 클라이언트. 이후 검증과 후처리는 실제 코드를 그대로 거친다. */
export const gsMockAiClient: AiClient = {
  async generate() {
    return JSON.stringify(GS_MOCK_MODEL_OUTPUT);
  },
};
