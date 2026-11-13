import type { AiClient } from "./ai-client";

/** 명세 4장의 모델 출력 예시. */
export const SPEC_MODEL_OUTPUT_EXAMPLE = {
  audio_quality: "ok",
  flags: [],
  transcript: "아 그거 내가 했다 아이가, 니 밥 뭇나",
  regions: {
    seoul_gyeonggi: 4,
    gangwon: 3,
    chungcheong: 3,
    gyeongsang: 84,
    jeolla: 4,
    jeju: 2,
  },
  scores: { vocabulary: 40, endings: 85, phonology: 60, intonation: 75 },
  evidence: [
    { type: "endings", quote: "했다 아이가", note: "경상 방언의 확인 표현" },
    { type: "phonology", quote: "뭇나", note: "'먹었나'의 축약" },
  ],
} as const;

/** MOCK_AI=true일 때 Gemini 대신 쓰는 클라이언트. 이후 검증과 후처리는 실제 코드를 그대로 거친다. */
export const mockAiClient: AiClient = {
  async generate() {
    return JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE);
  },
};
