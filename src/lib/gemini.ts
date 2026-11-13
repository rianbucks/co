/**
 * Gemini 호출부. @google/genai SDK는 이 파일에서만 쓴다.
 *
 * 공식 문서(aistudio.google.com/docs, 2026-11-12 확인)와 SDK 3.2.0 타입 정의를 따랐다.
 * - Interactions API(client.interactions.create)를 쓴다. 문서 예제가 모두 이 방식이다.
 * - 오디오는 base64로 요청에 넣는다(요청 전체 20MB 미만).
 * - 구조화 출력: response_format { type: "text", mime_type: "application/json", schema }
 * - temperature는 보내지 않는다. 3.6 이후 모델에서 deprecated이고 무시된다.
 * - store: false. Interactions API는 기본으로 요청과 응답을 저장한다.
 * - SDK 자체 재시도(기본 최대 4회)와 자동 이어 받기를 끈다. 시도 1번 = HTTP 요청 1번.
 *   재시도는 파이프라인에서 명세대로 1회만 한다.
 */
import { GoogleGenAI } from "@google/genai";
import type { GeminiSettings } from "./config";
import type { AiClient, AiRequest } from "./judge/ai-client";

/** 응답은 왔지만 쓸 수 없는 경우(완료되지 않았거나 본문이 비어 있음). */
export class GeminiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiOutputError";
  }
}

export function createGeminiClient(settings: GeminiSettings): AiClient {
  const ai = new GoogleGenAI({ apiKey: settings.apiKey });

  return {
    async generate(request: AiRequest): Promise<string> {
      const interaction = await ai.interactions.create(
        {
          model: settings.model,
          system_instruction: request.systemInstruction,
          input: [
            { type: "text", text: request.userText },
            {
              type: "audio",
              data: Buffer.from(request.audio).toString("base64"),
              mime_type: request.mimeType,
            },
          ],
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: request.responseSchema,
          },
          generation_config: { thinking_level: settings.thinkingLevel },
          store: false,
          automatic_continuation: false,
        },
        { timeout_ms: request.timeoutMs, retries: { strategy: "none" } },
      );

      if (interaction.status !== "completed") {
        throw new GeminiOutputError(`interaction status: ${interaction.status}`);
      }
      if (!interaction.output_text) {
        throw new GeminiOutputError("empty output_text");
      }
      return interaction.output_text;
    },
  };
}
