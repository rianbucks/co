import { describe, expect, it } from "vitest";
import { DEFAULT_AI_TIMING } from "./pipeline";
import {
  AI_FIRST_ATTEMPT_MS,
  AI_TOTAL_MS,
  JUDGING_STEP_STARTS_SEC,
  JUDGING_WAIT_LIMIT_SEC,
  judgingStepIndex,
} from "./timing";

describe("응답 제한 시간", () => {
  it("AI 첫 시도 25초, 전체 40초이고 서버 기본값이 이 값을 쓴다", () => {
    expect(AI_FIRST_ATTEMPT_MS).toBe(25_000);
    expect(AI_TOTAL_MS).toBe(40_000);
    expect(DEFAULT_AI_TIMING).toMatchObject({ firstAttemptMs: 25_000, totalMs: 40_000 });
  });

  it("화면(S4)은 45초를 기다리고, 서버의 AI 전체 제한보다 길다", () => {
    expect(JUDGING_WAIT_LIMIT_SEC).toBe(45);
    expect(JUDGING_WAIT_LIMIT_SEC * 1000).toBeGreaterThan(AI_TOTAL_MS);
    expect(AI_FIRST_ATTEMPT_MS).toBeLessThan(AI_TOTAL_MS);
  });

  it("심사 단계 4개는 0, 3, 9, 18초에 시작하고 모두 대기 한도 전에 시작한다", () => {
    expect(JUDGING_STEP_STARTS_SEC).toEqual([0, 3, 9, 18]);
    expect(Math.max(...JUDGING_STEP_STARTS_SEC)).toBeLessThan(JUDGING_WAIT_LIMIT_SEC);
  });

  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [8, 1],
    [9, 2],
    [17, 2],
    [18, 3],
    [44, 3],
  ])("경과 %i초면 %i단계(0부터)", (elapsed, index) => {
    expect(judgingStepIndex(elapsed)).toBe(index);
  });
});
