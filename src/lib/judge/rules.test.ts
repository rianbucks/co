import { describe, expect, it } from "vitest";
import { REGION_KEYS } from "./contract";
import {
  MIXED_LABEL,
  REGION_NAMES,
  UNCERTAIN_PREFIX,
  regionVerdictLabel,
  uncertainDetail,
  uncertainLabel,
} from "./rules";

describe("판정 지역 표시", () => {
  it.each(REGION_KEYS)("판정 유보면 '판정 유보 (추정: {1순위} 방언)'이다: %s", (top) => {
    expect(uncertainLabel(top)).toBe(`판정 유보 (추정: ${REGION_NAMES[top]} 방언)`);
  });

  it("화면이 나눠 쓰는 앞부분과 괄호 부분을 이으면 판정 유보 문구와 같다", () => {
    for (const top of REGION_KEYS) {
      expect(`${UNCERTAIN_PREFIX} ${uncertainDetail(top)}`).toBe(uncertainLabel(top));
    }
  });

  it("판정 유보가 혼합 방언보다 먼저다(혼합이어도 1순위로 추정 권역을 적는다)", () => {
    expect(regionVerdictLabel({ top: "gyeongsang", label: MIXED_LABEL, mixed: true, uncertain: true })).toBe(
      "판정 유보 (추정: 경상 방언)",
    );
  });

  it("유보가 아니면 혼합 방언이나 '{권역} 방언'이고, uncertain이 없는 이전 응답도 같다", () => {
    expect(regionVerdictLabel({ top: "jeolla", label: "전라 방언", mixed: false, uncertain: false })).toBe("전라 방언");
    expect(regionVerdictLabel({ top: "jeolla", label: MIXED_LABEL, mixed: true, uncertain: false })).toBe("혼합 방언");
    expect(regionVerdictLabel({ top: "jeju", label: "제주 방언", mixed: false })).toBe("제주 방언");
  });
});
