import { describe, expect, it } from "vitest";
import { createIssueInfo, formatKstIso } from "./issue";

describe("formatKstIso", () => {
  it("한국 시간 +09:00, 초 단위로 적는다", () => {
    expect(formatKstIso(new Date("2026-11-15T05:03:00Z"))).toBe("2026-11-15T14:03:00+09:00");
    expect(formatKstIso(new Date("2026-11-15T05:03:00.999Z"))).toBe("2026-11-15T14:03:00+09:00");
  });

  it("UTC 기준 전날이어도 한국 날짜로 넘긴다", () => {
    expect(formatKstIso(new Date("2026-12-31T15:30:00Z"))).toBe("2027-01-01T00:30:00+09:00");
  });
});

describe("createIssueInfo", () => {
  const fixedRandom = { hex: () => "0123456789ab", int: () => 123 };

  it("id는 j_ + 16진 12자리, 문서번호는 제{연도}-{6자리}호", () => {
    expect(createIssueInfo(new Date("2026-11-15T05:03:00Z"), fixedRandom)).toEqual({
      id: "j_0123456789ab",
      certificateNo: "제2026-000123호",
      issuedAt: "2026-11-15T14:03:00+09:00",
    });
  });

  it("문서번호의 연도는 한국 날짜 기준이다", () => {
    expect(createIssueInfo(new Date("2026-12-31T15:30:00Z"), fixedRandom).certificateNo).toBe(
      "제2027-000123호",
    );
  });

  it("기본 난수로 만든 값도 같은 형식이다", () => {
    const info = createIssueInfo(new Date());
    expect(info.id).toMatch(/^j_[0-9a-f]{12}$/);
    expect(info.certificateNo).toMatch(/^제\d{4}-\d{6}호$/);
    expect(info.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  });
});
