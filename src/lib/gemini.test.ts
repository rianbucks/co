import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiRequest } from "./judge/ai-client";

// 실제 Gemini를 부르지 않도록 SDK를 가짜로 바꾸고, 넘긴 요청 모양을 확인한다.
const sdk = vi.hoisted(() => ({ create: vi.fn(), constructorArgs: [] as unknown[] }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create: sdk.create };
    constructor(options: unknown) {
      sdk.constructorArgs.push(options);
    }
  },
}));

import { GeminiOutputError, createGeminiClient } from "./gemini";

const settings = { apiKey: "test-key", model: "gemini-3.8-flash", thinkingLevel: "medium" } as const;

const request: AiRequest = {
  systemInstruction: "지시문",
  userText: "감정하라",
  audio: new Uint8Array([1, 2, 3]),
  mimeType: "audio/m4a",
  responseSchema: { type: "object" },
  timeoutMs: 20_000,
};

beforeEach(() => {
  sdk.create.mockReset();
  sdk.constructorArgs.length = 0;
});

describe("createGeminiClient", () => {
  it("문서대로 Interactions API 요청을 만들고 output_text를 돌려준다", async () => {
    sdk.create.mockResolvedValue({ status: "completed", output_text: '{"audio_quality":"ok"}' });

    const text = await createGeminiClient(settings).generate(request);

    expect(text).toBe('{"audio_quality":"ok"}');
    expect(sdk.constructorArgs).toEqual([{ apiKey: "test-key", apiVersion: "v1" }]);
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledWith(
      {
        model: "gemini-3.8-flash",
        system_instruction: "지시문",
        input: [
          { type: "text", text: "감정하라" },
          { type: "audio", data: "AQID", mime_type: "audio/m4a" },
        ],
        response_format: { type: "text", mime_type: "application/json", schema: { type: "object" } },
        generation_config: { thinking_level: "medium" },
        store: false,
        automatic_continuation: false,
      },
      { timeout_ms: 20_000, retries: { strategy: "none" } },
    );
  });

  it("temperature, top_p, top_k는 보내지 않는다", async () => {
    sdk.create.mockResolvedValue({ status: "completed", output_text: "{}" });
    await createGeminiClient(settings).generate(request);
    expect(JSON.stringify(sdk.create.mock.calls[0])).not.toMatch(/temperature|top_p|top_k/);
  });

  it("환경 변수로 바꾼 모델과 사고 수준을 쓴다", async () => {
    sdk.create.mockResolvedValue({ status: "completed", output_text: "{}" });
    await createGeminiClient({ ...settings, model: "gemini-3.5-flash-lite", thinkingLevel: "low" }).generate(
      request,
    );
    expect(sdk.create.mock.calls[0][0]).toMatchObject({
      model: "gemini-3.5-flash-lite",
      generation_config: { thinking_level: "low" },
    });
  });

  it.each(["failed", "incomplete", "requires_continuation", "budget_exceeded", undefined])(
    "status가 %s면 GeminiOutputError",
    async (status) => {
      sdk.create.mockResolvedValue({ status, output_text: "{}" });
      await expect(createGeminiClient(settings).generate(request)).rejects.toBeInstanceOf(
        GeminiOutputError,
      );
    },
  );

  it("output_text가 비어 있으면 GeminiOutputError", async () => {
    sdk.create.mockResolvedValue({ status: "completed", output_text: "" });
    await expect(createGeminiClient(settings).generate(request)).rejects.toBeInstanceOf(
      GeminiOutputError,
    );
  });

  it("SDK 예외는 그대로 던진다(재시도는 파이프라인이 한다)", async () => {
    const error = Object.assign(new Error("quota"), { status: 429 });
    sdk.create.mockRejectedValue(error);
    await expect(createGeminiClient(settings).generate(request)).rejects.toBe(error);
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
});
