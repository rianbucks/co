/**
 * 하루 호출 제한(KST 날짜 기준). Production은 Redis REST의 원자 Lua 스크립트를 사용해
 * 서버리스 인스턴스 사이에서도 한도를 공유한다. 로컬 개발/테스트에서는 메모리 제한기를 사용한다.
 * - 감정(POST /api/judge): IP당 60회, 전체 1,500회
 * - 랭킹 등록(POST /api/ranking): IP당 60회, 전체 한도 없음
 */
import { createHmac } from "node:crypto";
import { upstashConfigFromEnv, upstashPipeline, type Fetcher } from "./upstash";

export type RateLimitDecision = { allowed: true } | { allowed: false; scope: "ip" | "global" };

export interface RateLimiter {
  /** ip 원문은 Redis에 저장하지 않고 HMAC 식별자로만 사용한다. */
  check(client: { ip: string | null }): Promise<RateLimitDecision>;
}

export interface RateLimitPolicy {
  /** Redis 키 이름에 들어간다: co:{name}:{KST 날짜}:... */
  name: "judge" | "ranking";
  ipLimit: number;
  /** null이면 전체 한도를 두지 않는다(횟수는 센다). */
  globalLimit: number | null;
}

/** 교내 와이파이처럼 여러 사람이 IP 하나를 함께 쓰므로 개인 한도를 넉넉하게 둔다(명세 9장). */
export const DAILY_IP_LIMIT = 60;
export const DAILY_GLOBAL_LIMIT = 1_500;

/**
 * 랭킹 등록의 IP당 하루 한도. 등록은 감정 1건당 1회라 감정 한도를 넘을 수 없고,
 * IP를 여러 사람이 함께 쓰는 사정도 같으므로 감정과 같은 값으로 둔다.
 */
export const DAILY_RANKING_IP_LIMIT = 60;

export const JUDGE_RATE_LIMIT: RateLimitPolicy = {
  name: "judge",
  ipLimit: DAILY_IP_LIMIT,
  globalLimit: DAILY_GLOBAL_LIMIT,
};

export const RANKING_RATE_LIMIT: RateLimitPolicy = {
  name: "ranking",
  ipLimit: DAILY_RANKING_IP_LIMIT,
  globalLimit: null,
};

interface UpstashRateLimiterOptions {
  url: string;
  token: string;
  fetcher?: Fetcher;
  now?: () => number;
  policy?: RateLimitPolicy;
}

const CHECK_AND_INCREMENT_SCRIPT = `
local ip_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local global_count = tonumber(redis.call('GET', KEYS[2]) or '0')
local ip_limit = tonumber(ARGV[1])
local global_limit = tonumber(ARGV[2])
local expires_at = tonumber(ARGV[3])

if ip_count >= ip_limit then return {0, 'ip'} end
if global_limit >= 0 and global_count >= global_limit then return {0, 'global'} end

ip_count = redis.call('INCR', KEYS[1])
global_count = redis.call('INCR', KEYS[2])
if ip_count == 1 then redis.call('PEXPIREAT', KEYS[1], expires_at) end
if global_count == 1 then redis.call('PEXPIREAT', KEYS[2], expires_at) end
return {1, 'allowed'}
`;

function kstDay(now: number): { day: string; nextMidnight: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const day = `${values.year}-${values.month}-${values.day}`;
  // Korea has no daylight-saving transitions; fixed UTC+09:00 gives its next midnight.
  const nextMidnight = new Date(`${day}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000;
  return { day, nextMidnight };
}

export function createUpstashRateLimiter({
  url,
  token,
  fetcher,
  now = Date.now,
  policy = JUDGE_RATE_LIMIT,
}: UpstashRateLimiterOptions): RateLimiter {
  const config = { url: url.replace(/\/+$/, ""), token };

  return {
    async check({ ip }): Promise<RateLimitDecision> {
      const { day, nextMidnight } = kstDay(now());
      const ipIdentity = createHmac("sha256", token).update(ip || "unknown").digest("hex");
      const ipKey = `co:${policy.name}:${day}:ip:${ipIdentity}`;
      const globalKey = `co:${policy.name}:${day}:global`;

      const [result] = await upstashPipeline(
        config,
        [
          [
            "EVAL",
            CHECK_AND_INCREMENT_SCRIPT,
            "2",
            ipKey,
            globalKey,
            String(policy.ipLimit),
            // 음수는 전체 한도 없음
            String(policy.globalLimit ?? -1),
            String(nextMidnight),
          ],
        ],
        fetcher,
      );
      if (!Array.isArray(result)) {
        throw new Error("Upstash rate limiter returned an invalid response");
      }

      if (Number(result[0]) === 1) return { allowed: true };
      return { allowed: false, scope: result[1] === "ip" ? "ip" : "global" };
    },
  };
}

/** 정책 이름, 날짜, IP별 횟수. 로컬 개발 서버가 떠 있는 동안만 유지된다. */
const memoryCounts = new Map<string, number>();

/** 로컬 개발 전용. 프로덕션의 분산 한도 구현으로 사용하지 않는다. */
export function createMemoryRateLimiter({
  now = Date.now,
  policy = JUDGE_RATE_LIMIT,
}: { now?: () => number; policy?: RateLimitPolicy } = {}): RateLimiter {
  return {
    async check({ ip }): Promise<RateLimitDecision> {
      const { day } = kstDay(now());
      const ipKey = `${policy.name}:${day}:ip:${ip || "unknown"}`;
      const globalKey = `${policy.name}:${day}:global`;
      const ipCount = memoryCounts.get(ipKey) ?? 0;
      const globalCount = memoryCounts.get(globalKey) ?? 0;
      if (ipCount >= policy.ipLimit) return { allowed: false, scope: "ip" };
      if (policy.globalLimit !== null && globalCount >= policy.globalLimit) {
        return { allowed: false, scope: "global" };
      }
      memoryCounts.set(ipKey, ipCount + 1);
      memoryCounts.set(globalKey, globalCount + 1);
      return { allowed: true };
    },
  };
}

/** 가짜 응답 모드에서 Upstash 없이 쓰는 제한기. Gemini 비용이 없으므로 항상 허용한다. */
export const unlimitedRateLimiter: RateLimiter = {
  async check() {
    return { allowed: true };
  },
};

/**
 * Production은 외부 Redis 설정이 없거나 불완전하면 닫힌 상태로 실패한다.
 * 다만 가짜 응답 모드(mock)는 Upstash가 없어도 제한 없이 받는다. Upstash가 설정돼 있으면 같은 한도를 쓴다.
 * 연결 정보는 UPSTASH_REDIS_REST_* 또는 KV_REST_API_*에서 읽는다(./upstash.ts).
 */
export function rateLimiterFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { mock?: boolean; policy?: RateLimitPolicy } = {},
): RateLimiter {
  const policy = options.policy ?? JUDGE_RATE_LIMIT;
  const upstash = upstashConfigFromEnv(env);
  if (upstash.status === "ok") return createUpstashRateLimiter({ ...upstash.config, policy });
  if (upstash.status === "insecure") throw new Error("Upstash Redis REST URL must use HTTPS");
  if (upstash.status === "partial") {
    throw new Error("Upstash Redis rate limiter is not configured");
  }
  if (env.NODE_ENV === "production") {
    if (options.mock) return unlimitedRateLimiter;
    throw new Error("Upstash Redis rate limiter is not configured");
  }
  return createMemoryRateLimiter({ policy });
}
