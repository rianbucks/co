/** 서버 환경 변수 읽기. 값은 .env.local(개발)이나 배포 설정에서 온다. */

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/** SDK가 받는 사고 수준. gemini-3.8-flash는 low, medium, high만 지원한다(minimal은 API 오류). */
export const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium";

export interface GeminiSettings {
  apiKey: string;
  model: string;
  thinkingLevel: ThinkingLevel;
}

export type JudgeConfig = { mock: true } | { mock: false; gemini: GeminiSettings };

export type ConfigResult = { ok: true; config: JudgeConfig } | { ok: false; problem: string };

function isThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

export function readConfig(env: Record<string, string | undefined> = process.env): ConfigResult {
  if (env.MOCK_AI?.trim().toLowerCase() === "true") {
    return { ok: true, config: { mock: true } };
  }

  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, problem: "GEMINI_API_KEY가 없다" };
  }

  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const thinkingLevel = env.GEMINI_THINKING_LEVEL?.trim() || DEFAULT_THINKING_LEVEL;
  if (!isThinkingLevel(thinkingLevel)) {
    return { ok: false, problem: `GEMINI_THINKING_LEVEL 값이 잘못됐다: ${thinkingLevel}` };
  }

  return { ok: true, config: { mock: false, gemini: { apiKey, model, thinkingLevel } } };
}
