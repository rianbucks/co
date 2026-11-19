import { describe, expect, it, vi } from "vitest";
import {
  DAILY_GLOBAL_LIMIT,
  DAILY_IP_LIMIT,
  DAILY_RANKING_IP_LIMIT,
  JUDGE_RATE_LIMIT,
  RANKING_RATE_LIMIT,
  createMemoryRateLimiter,
  createUpstashRateLimiter,
  rateLimiterFromEnv,
  unlimitedRateLimiter,
} from "./rate-limit";

describe("한도 값(명세 9장)", () => {
  it("IP당 하루 60회, 전체 하루 1,500회", () => {
    expect(DAILY_IP_LIMIT).toBe(60);
    expect(DAILY_GLOBAL_LIMIT).toBe(1_500);
    expect(JUDGE_RATE_LIMIT).toEqual({ name: "judge", ipLimit: 60, globalLimit: 1_500 });
  });

  it("랭킹 등록은 IP당 하루 60회, 전체 한도 없음", () => {
    expect(DAILY_RANKING_IP_LIMIT).toBe(60);
    expect(RANKING_RATE_LIMIT).toEqual({ name: "ranking", ipLimit: 60, globalLimit: null });
  });
});

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
    expect(body[0][5]).toBe("60");
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

  it("랭킹 등록 한도는 co:ranking 키를 쓰고 전체 한도는 -1(없음)로 보낸다", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      void url;
      void init;
      return jsonResponse([{ result: [1, "allowed"] }]);
    });
    const limiter = createUpstashRateLimiter({
      url: "https://example.upstash.io",
      token: "test-secret-token",
      fetcher,
      now: () => new Date("2026-11-20T23:59:59+09:00").getTime(),
      policy: RANKING_RATE_LIMIT,
    });

    await expect(limiter.check({ ip: "203.0.113.55" })).resolves.toEqual({ allowed: true });

    const body = JSON.parse(String(fetcher.mock.calls[0]![1].body));
    expect(body[0][3]).toMatch(/^co:ranking:2026-11-20:ip:[a-f0-9]{64}$/);
    expect(body[0][3]).not.toContain("203.0.113.55");
    expect(body[0][4]).toBe("co:ranking:2026-11-20:global");
    expect(body[0][5]).toBe("60");
    expect(body[0][6]).toBe("-1");
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

  it("Production이어도 가짜 응답 모드는 Upstash 없이 제한 없이 받는다", async () => {
    const limiter = rateLimiterFromEnv({ NODE_ENV: "production" }, { mock: true });
    expect(limiter).toBe(unlimitedRateLimiter);
    await expect(limiter.check({ ip: "198.51.100.7" })).resolves.toEqual({ allowed: true });
  });

  it("가짜 응답 모드여도 Upstash 설정이 반만 있으면 설정 오류다", () => {
    expect(() =>
      rateLimiterFromEnv(
        { NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://example.upstash.io" },
        { mock: true },
      ),
    ).toThrow("Upstash Redis rate limiter is not configured");
  });

  it("가짜 응답 모드여도 Upstash가 설정돼 있으면 같은 한도를 쓴다", () => {
    const limiter = rateLimiterFromEnv(
      {
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "test-token",
      },
      { mock: true },
    );
    expect(limiter).not.toBe(unlimitedRateLimiter);
  });

  it("개발 환경은 가짜 응답 모드여도 메모리 제한기를 쓴다", () => {
    expect(rateLimiterFromEnv({ NODE_ENV: "development" }, { mock: true })).not.toBe(
      unlimitedRateLimiter,
    );
  });

  it("Production에서 Vercel Marketplace의 KV_REST_API_*만 있어도 Upstash 제한기를 쓴다", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      void init;
      expect(url).toBe("https://kv-example.upstash.io/pipeline");
      return jsonResponse([{ result: [1, "allowed"] }]);
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const limiter = rateLimiterFromEnv({
        NODE_ENV: "production",
        KV_REST_API_URL: "https://kv-example.upstash.io",
        KV_REST_API_TOKEN: "kv-token",
      });
      await expect(limiter.check({ ip: "198.51.100.9" })).resolves.toEqual({ allowed: true });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]![1].headers).toMatchObject({ Authorization: "Bearer kv-token" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("랭킹 등록 정책을 넘기면 같은 연결 값으로 랭킹 키를 쓴다", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      void url;
      void init;
      return jsonResponse([{ result: [0, "ip"] }]);
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const limiter = rateLimiterFromEnv(
        {
          NODE_ENV: "production",
          KV_REST_API_URL: "https://kv-example.upstash.io",
          KV_REST_API_TOKEN: "kv-token",
        },
        { policy: RANKING_RATE_LIMIT },
      );
      await expect(limiter.check({ ip: "198.51.100.9" })).resolves.toEqual({
        allowed: false,
        scope: "ip",
      });
      const body = JSON.parse(String(fetcher.mock.calls[0]![1].body));
      expect(body[0][3]).toMatch(/^co:ranking:/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("KV_REST_API_* 주소도 HTTPS만 허용한다", () => {
    expect(() =>
      rateLimiterFromEnv({
        NODE_ENV: "production",
        KV_REST_API_URL: "http://kv-example.upstash.io",
        KV_REST_API_TOKEN: "kv-token",
      }),
    ).toThrow("must use HTTPS");
  });
});

describe("createMemoryRateLimiter", () => {
  it("감정과 랭킹 등록은 따로 센다", async () => {
    const now = () => new Date("2031-02-04T10:00:00+09:00").getTime();
    const judge = createMemoryRateLimiter({ now });
    const ranking = createMemoryRateLimiter({ now, policy: RANKING_RATE_LIMIT });

    for (let i = 0; i < DAILY_IP_LIMIT; i += 1) await judge.check({ ip: "198.51.100.99" });
    await expect(judge.check({ ip: "198.51.100.99" })).resolves.toEqual({
      allowed: false,
      scope: "ip",
    });
    await expect(ranking.check({ ip: "198.51.100.99" })).resolves.toEqual({ allowed: true });
  });

  it("랭킹 등록도 같은 날 IP당 60번까지만 허용한다", async () => {
    const ranking = createMemoryRateLimiter({
      now: () => new Date("2031-02-05T10:00:00+09:00").getTime(),
      policy: RANKING_RATE_LIMIT,
    });
    for (let i = 0; i < DAILY_RANKING_IP_LIMIT; i += 1) {
      await expect(ranking.check({ ip: "198.51.100.77" })).resolves.toEqual({ allowed: true });
    }
    await expect(ranking.check({ ip: "198.51.100.77" })).resolves.toEqual({
      allowed: false,
      scope: "ip",
    });
  });

  it("같은 날 IP당 60번까지만 허용한다", async () => {
    const limiter = createMemoryRateLimiter({
      now: () => new Date("2031-02-03T10:00:00+09:00").getTime(),
    });
    for (let i = 0; i < 60; i += 1) {
      await expect(limiter.check({ ip: "198.51.100.88" })).resolves.toEqual({ allowed: true });
    }
    await expect(limiter.check({ ip: "198.51.100.88" })).resolves.toEqual({
      allowed: false,
      scope: "ip",
    });
  });
});
