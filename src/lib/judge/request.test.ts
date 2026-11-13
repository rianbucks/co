import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./request";

describe("clientIpFrom", () => {
  it("x-forwarded-for의 첫 값을 쓴다", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("없으면 x-real-ip, 그것도 없으면 null", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIpFrom(new Headers())).toBeNull();
  });
});
