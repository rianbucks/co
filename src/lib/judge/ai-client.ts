import type { GeminiAudioMime } from "./audio";

/** 호출 1회의 토큰 사용량. 사고 토큰은 출력 요금으로 따로 청구된다(Gemini thinking 문서). */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
}

/** AI 호출 1회에 필요한 값. 재시도와 출력 검증은 파이프라인이 맡는다. */
export interface AiRequest {
  systemInstruction: string;
  userText: string;
  audio: Uint8Array;
  mimeType: GeminiAudioMime;
  responseSchema: Record<string, unknown>;
  timeoutMs: number;
  /** true면 주 모델 대신 대체 모델로 부른다(재시도). */
  useFallbackModel?: boolean;
  /** 응답이 오면 토큰 사용량을 넘긴다(검증 스크립트용). */
  onUsage?: (usage: AiUsage) => void;
}

export interface AiClient {
  /** 모델이 돌려준 JSON 텍스트. 호출이 실패하면 예외를 던진다. */
  generate(request: AiRequest): Promise<string>;
}
