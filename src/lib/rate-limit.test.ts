import { describe, expect, it, vi } from "vitest";
import {
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  rateLimiterFromEnv,
} from "./rate-limit";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("createUpstashRateLimiter", () => {
  it("IP와 전체 한도를 하나의 Redis Lua 작업으로 검사하고 IP 원문은 보내지 않는다", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      void url;
      void init;
      return jsonResponse([{ result: [1, "allowed"] }]);
    });
    const limiter = createUpstashRateLimiter({
      url: "https://example.upstash.io/",
      token: "test-secret-token",
      fetcher,
      now: () => new Date("2026-11-14T02:00:00+09:00").getTime(),
    });

    await expect(limiter.check({ ip: "203.0.113.55" })).resolves.toEqual({ allowed: true });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://example.upstash.io/pipeline");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-secret-token" });
    const body = JSON.parse(String(init.body));
    expect(body).toHaveLength(1);
    expect(body[0][0]).toBe("EVAL");
    expect(body[0][2]).toBe("2");
    expect(body[0][3]).toMatch(/^co:judge:2026-11-14:ip:[a-f0-9]{64}$/);
    expect(body[0][3]).not.toContain("203.0.113.55");
    expect(body[0][4]).toBe("co:judge:2026-11-14:global");
    expect(body[0][5]).toBe("5");
    expect(body[0][6]).toBe("1500");
    expect(Number(body[0][7])).toBe(new Date("2026-11-15T00:00:00+09:00").getTime());
  });

  it.each([
    [{ result: [0, "ip"] }, { allowed: false, scope: "ip" }],
    [{ result: [0, "global"] }, { allowed: false, scope: "global" }],
  ])("거부 결과를 올바른 한도 사유로 전달한다", async (payload, expected) => {
    const limiter = createUpstashRateLimiter({
      url: "https://example.upstash.io",
      token: "test-token",
      fetcher: async () => jsonResponse([payload]),
    });
    await expect(limiter.check({ ip: "192.0.2.1" })).resolves.toEqual(expected);
  });

  it("Redis 오류에서는 허용하지 않고 예외를 던진다", async () => {
    const limiter = createUpstashRateLimiter({
      url: "https://example.upstash.io",
      token: "test-token",
      fetcher: async () => jsonResponse({}, 503),
    });
    await expect(limiter.check({ ip: "192.0.2.1" })).rejects.toThrow("HTTP 503");
  });
});

describe("rateLimiterFromEnv", () => {
  it("Production에서 Redis가 설정되지 않으면 fail closed", () => {
    expect(() => rateLimiterFromEnv({ NODE_ENV: "production" })).toThrow(
      "Upstash Redis rate limiter is not configured",
    );
  });

  it("Production의 저장소 주소는 HTTPS만 허용한다", () => {
    expect(() =>
      rateLimiterFromEnv({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      }),
    ).toThrow("must use HTTPS");
  });
});

describe("createMemoryRateLimiter", () => {
  it("같은 날 IP당 다섯 번까지만 허용한다", async () => {
    const limiter = createMemoryRateLimiter({
      now: () => new Date("2031-02-03T10:00:00+09:00").getTime(),
    });
    for (let i = 0; i < 5; i += 1) {
      await expect(limiter.check({ ip: "198.51.100.88" })).resolves.toEqual({ allowed: true });
    }
    await expect(limiter.check({ ip: "198.51.100.88" })).resolves.toEqual({
      allowed: false,
      scope: "ip",
    });
  });
});
