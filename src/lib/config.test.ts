import { describe, expect, it } from "vitest";
import { readConfig } from "./config";

describe("readConfig", () => {
  it.each(["true", "TRUE", " true "])("MOCK_AI=%s면 키 없이도 MOCK 모드", (value) => {
    expect(readConfig({ MOCK_AI: value })).toEqual({ ok: true, config: { mock: true } });
  });

  it("MOCK이 아니면 키가 있어야 한다", () => {
    expect(readConfig({ MOCK_AI: "false" })).toEqual({ ok: false, problem: "GEMINI_API_KEY가 없다" });
    expect(readConfig({ GEMINI_API_KEY: "  " }).ok).toBe(false);
  });

  it("모델과 사고 수준의 기본값은 gemini-3.8-flash, medium", () => {
    const expected = {
      ok: true,
      config: {
        mock: false,
        gemini: { apiKey: "key", model: "gemini-3.8-flash", thinkingLevel: "medium" },
      },
    };
    expect(readConfig({ GEMINI_API_KEY: "key" })).toEqual(expected);
    expect(readConfig({ GEMINI_API_KEY: "key", GEMINI_MODEL: "", GEMINI_THINKING_LEVEL: "" })).toEqual(
      expected,
    );
  });

  it("환경 변수로 모델과 사고 수준을 바꾼다", () => {
    expect(
      readConfig({
        GEMINI_API_KEY: "key",
        GEMINI_MODEL: "gemini-3.5-flash-lite",
        GEMINI_THINKING_LEVEL: "low",
      }),
    ).toEqual({
      ok: true,
      config: {
        mock: false,
        gemini: { apiKey: "key", model: "gemini-3.5-flash-lite", thinkingLevel: "low" },
      },
    });
  });

  it("사고 수준 값이 잘못되면 설정 오류", () => {
    expect(readConfig({ GEMINI_API_KEY: "key", GEMINI_THINKING_LEVEL: "max" })).toEqual({
      ok: false,
      problem: "GEMINI_THINKING_LEVEL 값이 잘못됐다: max",
    });
  });
});
