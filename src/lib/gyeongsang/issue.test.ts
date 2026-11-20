import { describe, expect, it } from "vitest";
import { JUDGMENT_ID_PATTERN } from "../ranking/contract";
import { createGsIssueInfo } from "./issue";

describe("createGsIssueInfo", () => {
  it("id는 g_ + 16진 12자리, 문서번호는 제{발급 연도}-경상-{6자리}호, 발급 시각은 한국 시간이다", () => {
    const random = { hex: (bytes: number) => "ab".repeat(bytes), int: () => 123 };
    expect(createGsIssueInfo(new Date("2026-11-20T05:03:00Z"), random)).toEqual({
      id: "g_abababababab",
      certificateNo: "제2026-경상-000123호",
      issuedAt: "2026-11-20T14:03:00+09:00",
    });
  });

  it("연도는 한국 시간 기준이다", () => {
    const random = { hex: () => "000000000000", int: () => 999_999 };
    expect(createGsIssueInfo(new Date("2026-12-31T15:00:00Z"), random).certificateNo).toBe("제2027-경상-999999호");
  });

  it("기본 난수로 만든 id와 문서번호도 형식을 지키고, 일반 랭킹의 감정 id 형식(j_)과 겹치지 않는다", () => {
    const issue = createGsIssueInfo(new Date());
    expect(issue.id).toMatch(/^g_[0-9a-f]{12}$/);
    expect(issue.certificateNo).toMatch(/^제\d{4}-경상-\d{6}호$/);
    expect(JUDGMENT_ID_PATTERN.test(issue.id)).toBe(false);
  });
});
