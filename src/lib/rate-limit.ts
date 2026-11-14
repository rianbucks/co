/**
 * 감정 API 호출 제한. Production은 Redis REST의 원자 Lua 스크립트를 사용해
 * 서버리스 인스턴스 사이에서도 IP당 5회, 전체 1,500회(KST 날짜 기준)를 공유한다.
 * 로컬 개발/테스트에서는 메모리 제한기를 사용한다.
 */
import { createHmac } from "node:crypto";

export type RateLimitDecision = { allowed: true } | { allowed: false; scope: "ip" | "global" };

export interface RateLimiter {
  /** ip 원문은 Redis에 저장하지 않고 HMAC 식별자로만 사용한다. */
  check(client: { ip: string | null }): Promise<RateLimitDecision>;
}

export const DAILY_IP_LIMIT = 5;
export const DAILY_GLOBAL_LIMIT = 1_500;

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

interface UpstashRateLimiterOptions {
  url: string;
  token: string;
  fetcher?: Fetcher;
  now?: () => number;
}

const CHECK_AND_INCREMENT_SCRIPT = `
local ip_count = tonumber(redis.call('GET', KEYS[1]) or '0')
local global_count = tonumber(redis.call('GET', KEYS[2]) or '0')
local ip_limit = tonumber(ARGV[1])
local global_limit = tonumber(ARGV[2])
local expires_at = tonumber(ARGV[3])

if ip_count >= ip_limit then return {0, 'ip'} end
if global_count >= global_limit then return {0, 'global'} end

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
  fetcher = fetch,
  now = Date.now,
}: UpstashRateLimiterOptions): RateLimiter {
  const normalizedUrl = url.replace(/\/+$/, "");

  return {
    async check({ ip }): Promise<RateLimitDecision> {
      const { day, nextMidnight } = kstDay(now());
      const ipIdentity = createHmac("sha256", token).update(ip || "unknown").digest("hex");
      const ipKey = `co:judge:${day}:ip:${ipIdentity}`;
      const globalKey = `co:judge:${day}:global`;

      const response = await fetcher(`${normalizedUrl}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          [
            "EVAL",
            CHECK_AND_INCREMENT_SCRIPT,
            "2",
            ipKey,
            globalKey,
            String(DAILY_IP_LIMIT),
            String(DAILY_GLOBAL_LIMIT),
            String(nextMidnight),
          ],
        ]),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Upstash rate limiter returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as Array<{
        result?: [number | string, string?];
        error?: string;
      }>;
      const command = result[0];
      if (!command || command.error || !Array.isArray(command.result)) {
        throw new Error("Upstash rate limiter returned an invalid response");
      }

      if (Number(command.result[0]) === 1) return { allowed: true };
      return { allowed: false, scope: command.result[1] === "ip" ? "ip" : "global" };
    },
  };
}

/** 로컬 개발 전용. 프로덕션의 분산 한도 구현으로 사용하지 않는다. */
export function createMemoryRateLimiter({ now = Date.now }: { now?: () => number } = {}): RateLimiter {
  return {
    async check({ ip }): Promise<RateLimitDecision> {
      const { day } = kstDay(now());
      const globalCount = memoryGlobalCounts.get(day) ?? 0;
      const identity = ip || "unknown";
      const ipCounts = memoryIpCounts.get(day) ?? new Map<string, number>();
      const currentIpCount = ipCounts.get(identity) ?? 0;
      if (currentIpCount >= DAILY_IP_LIMIT) return { allowed: false, scope: "ip" };
      if (globalCount >= DAILY_GLOBAL_LIMIT) return { allowed: false, scope: "global" };
      ipCounts.set(identity, currentIpCount + 1);
      memoryIpCounts.set(day, ipCounts);
      memoryGlobalCounts.set(day, globalCount + 1);
      return { allowed: true };
    },
  };
}

const memoryIpCounts = new Map<string, Map<string, number>>();
const memoryGlobalCounts = new Map<string, number>();

/** Production은 외부 Redis 설정이 없거나 불완전하면 닫힌 상태로 실패한다. */
export function rateLimiterFromEnv(env: Record<string, string | undefined> = process.env): RateLimiter {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    if (!url.startsWith("https://")) throw new Error("UPSTASH_REDIS_REST_URL must use HTTPS");
    return createUpstashRateLimiter({ url, token });
  }
  if (url || token || env.NODE_ENV === "production") {
    throw new Error("Upstash Redis rate limiter is not configured");
  }
  return createMemoryRateLimiter();
}
