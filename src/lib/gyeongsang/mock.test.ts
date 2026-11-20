import { describe, expect, it } from "vitest";
import { GS_MOCK_MODEL_OUTPUT, gsMockAiClient } from "./mock";
import { parseGsModelOutput } from "./model-output";
import { GS_QUESTIONS } from "./questions";

describe("경상 정밀 감정 가짜 출력", () => {
  it("문항별 받아쓰기는 set-gs 문항 수만큼이고, 이어 붙이면 전체 받아쓰기다", () => {
    expect(GS_MOCK_MODEL_OUTPUT.question_transcripts).toHaveLength(GS_QUESTIONS.length);
    expect(GS_MOCK_MODEL_OUTPUT.question_transcripts.join(" ")).toBe(GS_MOCK_MODEL_OUTPUT.transcript);
  });

  it("근거는 모두 자기 문항의 받아쓰기에 있다", () => {
    for (const item of GS_MOCK_MODEL_OUTPUT.evidence) {
      expect(GS_MOCK_MODEL_OUTPUT.question_transcripts[item.question - 1]).toContain(item.quote);
    }
  });

  it("가짜 클라이언트의 응답은 검증을 통과하는 경상 방언 출력이다", async () => {
    const text = await gsMockAiClient.generate({
      systemInstruction: "",
      userText: "",
      audio: new Uint8Array(),
      mimeType: "audio/wav",
      responseSchema: {},
      timeoutMs: 1_000,
    });
    expect(parseGsModelOutput(text, GS_QUESTIONS.length)).toMatchObject({
      ok: true,
      value: { audio_quality: "ok", not_gyeongsang: false },
    });
  });
});
