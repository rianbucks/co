import type { GeminiAudioMime } from "./audio";

/** AI 호출 1회에 필요한 값. 재시도와 출력 검증은 파이프라인이 맡는다. */
export interface AiRequest {
  systemInstruction: string;
  userText: string;
  audio: Uint8Array;
  mimeType: GeminiAudioMime;
  responseSchema: Record<string, unknown>;
  timeoutMs: number;
}

export interface AiClient {
  /** 모델이 돌려준 JSON 텍스트. 호출이 실패하면 예외를 던진다. */
  generate(request: AiRequest): Promise<string>;
}
