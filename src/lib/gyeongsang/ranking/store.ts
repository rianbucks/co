/**
 * 경상 정밀 감정 랭킹 저장소. 기존 농도 랭킹(../../ranking/store.ts)과 같은 방식이고 키만 다르다.
 * Production은 Upstash Redis, Upstash가 없는 로컬은 메모리를 쓴다.
 *
 * Redis 키
 * - co:gs:judgment:{정밀 감정 id}         정밀 감정할 때 서버가 남기는 등록 자격: 경상 농도, 경북권 비율, 가짜 응답 여부, flags 여부. 1시간 뒤 만료
 * - co:gs:judgment:{정밀 감정 id}:ranked  감정 1건당 1회만 등록하도록 SET NX로 잡는 표시(값은 항목 id). 1시간 뒤 만료
 * - co:gs:ranking:entries                 해시. 항목 id → 항목 JSON(닉네임, 신고 원산지, 경상 농도, 경북권 비율, 등록 시각)
 * - co:gs:ranking                         정렬 집합(전체). 경상 농도 순, 같으면 먼저 등록한 순
 * - co:gs:ranking:gyeongbuk, co:gs:ranking:gyeongnam  정렬 집합(보기). 신고 원산지가 대구·경북이면 앞, 부산·울산·경남이면 뒤
 *
 * 음성, 받아쓰기, IP는 저장하지 않는다.
 */
import { z } from "zod";
import { JUDGMENT_TTL_SECONDS, rankingScore } from "../../ranking/store";
import { upstashConfigFromEnv, upstashPipeline, type Fetcher, type UpstashConfig } from "../../upstash";
import { ORIGIN_KEYS, ORIGIN_SUBREGION } from "../origin";
import type { GsRankingArea, GsRankingEntry } from "./contract";

/** 정밀 감정할 때 서버가 저장하는 등록 자격. 등록할 때 클라이언트가 보낸 값 대신 이 값을 쓴다. */
export interface GsJudgmentRecord {
  intensity: number;
  gyeongbuk: number;
  /** 가짜 응답 모드(MOCK_AI)의 결과. 랭킹에 올릴 수 없다. */
  mock: boolean;
  /** 모델이 flags(욕설, 개인정보)를 붙인 결과. 랭킹에 올릴 수 없다. */
  flagged: boolean;
}

export interface GsRankedEntry {
  rank: number;
  entry: GsRankingEntry;
}

export interface GsRankingPage {
  entries: GsRankedEntry[];
  total: number;
  me: GsRankedEntry | null;
}

export interface GsRankingStore {
  saveJudgment(judgmentId: string, record: GsJudgmentRecord): Promise<void>;
  /** 없거나 1시간이 지났으면 null */
  getJudgment(judgmentId: string): Promise<GsJudgmentRecord | null>;
  /** 감정 1건당 한 번만 등록한다. 등록했으면 전체 순위(1부터), 이미 등록한 감정이면 null */
  register(judgmentId: string, entry: GsRankingEntry): Promise<number | null>;
  /** 그 보기의 상위 limit개와 항목 수. meId를 주면 그 보기 안에서의 그 항목과 순위도 */
  list(area: GsRankingArea, limit: number, meId?: string | null): Promise<GsRankingPage>;
  /** 지웠으면 true, 없던 항목이면 false */
  remove(entryId: string): Promise<boolean>;
}

export const GS_RANKING_KEYS = {
  judgment: (judgmentId: string) => `co:gs:judgment:${judgmentId}`,
  claim: (judgmentId: string) => `co:gs:judgment:${judgmentId}:ranked`,
  entries: "co:gs:ranking:entries",
  order: (area: GsRankingArea) => (area === "all" ? "co:gs:ranking" : `co:gs:ranking:${area}`),
} as const;

/** 신고 원산지로 정한 보기(대구·경북 또는 부산·울산·경남). */
export function areaOf(entry: Pick<GsRankingEntry, "origin">): Exclude<GsRankingArea, "all"> {
  return ORIGIN_SUBREGION[entry.origin];
}

const ratioSchema = z.number().int().min(0).max(100);

const judgmentRecordSchema = z.object({
  intensity: ratioSchema,
  gyeongbuk: ratioSchema,
  mock: z.boolean(),
  flagged: z.boolean(),
});

const entrySchema = z.object({
  id: z.string(),
  nickname: z.string(),
  origin: z.enum(ORIGIN_KEYS),
  intensity: ratioSchema,
  gyeongbuk: ratioSchema,
  registeredAt: z.string(),
});

/** 정해 둔 필드만 남긴다. 호출부가 다른 값을 실어 보내도 저장되지 않는다. */
function pickJudgment(record: GsJudgmentRecord): GsJudgmentRecord {
  const { intensity, gyeongbuk, mock, flagged } = record;
  return { intensity, gyeongbuk, mock, flagged };
}

function pickEntry(entry: GsRankingEntry): GsRankingEntry {
  const { id, nickname, origin, intensity, gyeongbuk, registeredAt } = entry;
  return { id, nickname, origin, intensity, gyeongbuk, registeredAt };
}

/** ZREVRANGE 0 -1은 전체를 돌려주므로 1 미만은 받지 않는다. */
function assertListLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit은 1 이상의 정수여야 한다");
}

function parseStored<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * 등록 표시(SET NX), 항목 저장, 전체와 보기 정렬 집합 추가를 한 번에 한다. 표시가 이미 있으면 0, 등록했으면 전체 순위(1부터).
 * KEYS: 등록 표시, 항목 해시, 전체 정렬 집합, 보기 정렬 집합 / ARGV: 항목 id, 항목 JSON, 정렬 점수, 표시 만료(초)
 */
export const GS_REGISTER_SCRIPT = `
if not redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[4]) then return 0 end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
redis.call('ZADD', KEYS[4], ARGV[3], ARGV[1])
return redis.call('ZREVRANK', KEYS[3], ARGV[1]) + 1
`;

export function createUpstashGsRankingStore({
  url,
  token,
  fetcher,
}: UpstashConfig & { fetcher?: Fetcher }): GsRankingStore {
  const config: UpstashConfig = { url: url.replace(/\/+$/, ""), token };
  const run = (commands: string[][]) => upstashPipeline(config, commands, fetcher);

  return {
    async saveJudgment(judgmentId, record) {
      await run([
        [
          "SET",
          GS_RANKING_KEYS.judgment(judgmentId),
          JSON.stringify(pickJudgment(record)),
          "EX",
          String(JUDGMENT_TTL_SECONDS),
        ],
      ]);
    },

    async getJudgment(judgmentId) {
      const [raw] = await run([["GET", GS_RANKING_KEYS.judgment(judgmentId)]]);
      return parseStored(judgmentRecordSchema, raw);
    },

    async register(judgmentId, entry) {
      const stored = pickEntry(entry);
      const [result] = await run([
        [
          "EVAL",
          GS_REGISTER_SCRIPT,
          "4",
          GS_RANKING_KEYS.claim(judgmentId),
          GS_RANKING_KEYS.entries,
          GS_RANKING_KEYS.order("all"),
          GS_RANKING_KEYS.order(areaOf(stored)),
          stored.id,
          JSON.stringify(stored),
          String(rankingScore(stored)),
          String(JUDGMENT_TTL_SECONDS),
        ],
      ]);
      const rank = Number(result);
      if (!Number.isInteger(rank) || rank < 0) {
        throw new Error("Upstash gyeongsang ranking store returned an invalid register response");
      }
      return rank === 0 ? null : rank;
    },

    async list(area, limit, meId) {
      assertListLimit(limit);
      const order = GS_RANKING_KEYS.order(area);
      const commands = [
        ["ZREVRANGE", order, "0", String(limit - 1)],
        ["ZCARD", order],
      ];
      if (meId) {
        commands.push(["ZREVRANK", order, meId], ["HGET", GS_RANKING_KEYS.entries, meId]);
      }
      const [ids, total, meRank, meRaw] = await run(commands);

      const topIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
      const [raws] = topIds.length > 0 ? await run([["HMGET", GS_RANKING_KEYS.entries, ...topIds]]) : [[]];
      const entries = (Array.isArray(raws) ? raws : [])
        .map((raw) => parseStored(entrySchema, raw))
        .filter((entry): entry is GsRankingEntry => entry !== null)
        .map((entry, index) => ({ rank: index + 1, entry }));

      const meEntry = meId && typeof meRank === "number" ? parseStored(entrySchema, meRaw) : null;
      return {
        entries,
        total: Number(total) || 0,
        me: meEntry ? { rank: Number(meRank) + 1, entry: meEntry } : null,
      };
    },

    async remove(entryId) {
      const results = await run([
        ["ZREM", GS_RANKING_KEYS.order("all"), entryId],
        ["ZREM", GS_RANKING_KEYS.order("gyeongbuk"), entryId],
        ["ZREM", GS_RANKING_KEYS.order("gyeongnam"), entryId],
        ["HDEL", GS_RANKING_KEYS.entries, entryId],
      ]);
      return results.some((count) => Number(count) > 0);
    },
  };
}

export interface MemoryGsRankingState {
  judgments: Map<string, { record: GsJudgmentRecord; expiresAt: number }>;
  /** 정밀 감정 id → 등록 표시 만료 시각 */
  claims: Map<string, number>;
  entries: Map<string, { entry: GsRankingEntry; score: number }>;
}

export function createMemoryGsRankingState(): MemoryGsRankingState {
  return { judgments: new Map(), claims: new Map(), entries: new Map() };
}

/** 개발 서버가 파일을 다시 읽어도 기록이 남도록 전역에 둔다(기존 랭킹과 다른 자리). */
const globalForGsRanking = globalThis as typeof globalThis & {
  __coGsRankingMemoryState?: MemoryGsRankingState;
};

function sharedMemoryState(): MemoryGsRankingState {
  globalForGsRanking.__coGsRankingMemoryState ??= createMemoryGsRankingState();
  return globalForGsRanking.__coGsRankingMemoryState;
}

/** 로컬 개발 전용. 프로세스 메모리에만 있어 서버리스 인스턴스끼리 공유되지 않는다. */
export function createMemoryGsRankingStore({
  now = Date.now,
  state = sharedMemoryState(),
}: { now?: () => number; state?: MemoryGsRankingState } = {}): GsRankingStore {
  // Redis 정렬 집합과 같은 순서: 점수 내림차순, 점수가 같으면 id 내림차순
  const sorted = (area: GsRankingArea) =>
    [...state.entries.values()]
      .filter((item) => area === "all" || areaOf(item.entry) === area)
      .sort((a, b) => b.score - a.score || (a.entry.id < b.entry.id ? 1 : a.entry.id > b.entry.id ? -1 : 0));
  const ttlMs = JUDGMENT_TTL_SECONDS * 1000;

  return {
    async saveJudgment(judgmentId, record) {
      state.judgments.set(judgmentId, { record: pickJudgment(record), expiresAt: now() + ttlMs });
    },

    async getJudgment(judgmentId) {
      const item = state.judgments.get(judgmentId);
      if (!item) return null;
      if (item.expiresAt <= now()) {
        state.judgments.delete(judgmentId);
        return null;
      }
      return { ...item.record };
    },

    async register(judgmentId, entry) {
      const claimedUntil = state.claims.get(judgmentId);
      if (claimedUntil !== undefined && claimedUntil > now()) return null;
      state.claims.set(judgmentId, now() + ttlMs);
      const stored = pickEntry(entry);
      state.entries.set(stored.id, { entry: stored, score: rankingScore(stored) });
      return sorted("all").findIndex((item) => item.entry.id === stored.id) + 1;
    },

    async list(area, limit, meId) {
      assertListLimit(limit);
      const all = sorted(area);
      const meIndex = meId ? all.findIndex((item) => item.entry.id === meId) : -1;
      return {
        entries: all.slice(0, limit).map((item, index) => ({ rank: index + 1, entry: { ...item.entry } })),
        total: all.length,
        me: meIndex >= 0 ? { rank: meIndex + 1, entry: { ...all[meIndex].entry } } : null,
      };
    },

    async remove(entryId) {
      return state.entries.delete(entryId);
    },
  };
}

/**
 * 기존 랭킹 저장소와 같은 규칙: Upstash 연결 값이 있으면 Redis를 쓴다. Production에서 없으면 닫힌 상태로 실패하고,
 * 가짜 응답 모드는 결과를 등록할 수 없으므로 메모리로 대신한다. 로컬 개발에서는 메모리를 쓴다.
 */
export function gsRankingStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { mock?: boolean } = {},
): GsRankingStore {
  const upstash = upstashConfigFromEnv(env);
  if (upstash.status === "ok") return createUpstashGsRankingStore(upstash.config);
  if (upstash.status === "insecure") throw new Error("Upstash Redis REST URL must use HTTPS");
  if (upstash.status === "partial" || (env.NODE_ENV === "production" && !options.mock)) {
    throw new Error("Upstash Redis gyeongsang ranking store is not configured");
  }
  return createMemoryGsRankingStore();
}
