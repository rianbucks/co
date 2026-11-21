/**
 * 랭킹 저장소(음성 없는 랭킹). Production은 Upstash Redis, Upstash가 없는 로컬은 메모리를 쓴다.
 *
 * Redis 키
 * - co:judgment:{감정 id}         감정할 때 서버가 남기는 등록 자격: 농도, 지역, 등급, 가짜 응답 여부,
 *                                  판정 유보 여부. 1시간 뒤 만료
 * - co:judgment:{감정 id}:ranked  감정 1건당 1회만 등록하도록 SET NX로 잡는 표시(값은 항목 id). 1시간 뒤 만료
 * - co:ranking:entries            해시. 항목 id → 항목 JSON(닉네임, 농도, 지역, 등급, 등록 시각)
 * - co:ranking                    정렬 집합. 항목 id를 농도 순(같으면 먼저 등록한 순)으로 정렬
 *
 * 음성, 받아쓰기, IP는 저장하지 않는다.
 */
import { z } from "zod";
import { REGION_KEYS, type Grade, type RegionKey } from "../judge/contract";
import { upstashConfigFromEnv, upstashPipeline, type Fetcher, type UpstashConfig } from "../upstash";
import type { RankingEntry } from "./contract";

/** 감정 결과를 랭킹에 등록할 수 있는 시간 */
export const JUDGMENT_TTL_SECONDS = 60 * 60;

/** 감정할 때 서버가 저장하는 등록 자격. 등록할 때 클라이언트가 보낸 값 대신 이 값을 쓴다. */
export interface JudgmentRecord {
  intensity: number;
  region: RegionKey;
  grade: Grade;
  /** 가짜 응답 모드(MOCK_AI)의 결과. 랭킹에 올릴 수 없다. */
  mock: boolean;
  /** 판정 유보 결과(근거가 1순위 권역을 뒷받침하지 못함). 지역을 확정하지 못했으므로 랭킹에 올릴 수 없다(명세 4장). */
  uncertain: boolean;
}

export interface RankedEntry {
  rank: number;
  entry: RankingEntry;
}

export interface RankingPage {
  entries: RankedEntry[];
  total: number;
  me: RankedEntry | null;
}

export interface RankingStore {
  saveJudgment(judgmentId: string, record: JudgmentRecord): Promise<void>;
  /** 없거나 1시간이 지났으면 null */
  getJudgment(judgmentId: string): Promise<JudgmentRecord | null>;
  /** 감정 1건당 한 번만 등록한다. 등록했으면 순위(1부터), 이미 등록한 감정이면 null */
  register(judgmentId: string, entry: RankingEntry): Promise<number | null>;
  /** 상위 limit개와 전체 수. meId를 주면 그 항목과 순위도 */
  list(limit: number, meId?: string | null): Promise<RankingPage>;
  /** 지웠으면 true, 없던 항목이면 false */
  remove(entryId: string): Promise<boolean>;
}

export const RANKING_KEYS = {
  judgment: (judgmentId: string) => `co:judgment:${judgmentId}`,
  claim: (judgmentId: string) => `co:judgment:${judgmentId}:ranked`,
  entries: "co:ranking:entries",
  order: "co:ranking",
} as const;

/** 2286년까지의 밀리초 시각이 들어가는 폭. 최대 점수 1.01e15는 2^53보다 작아 정확히 표현된다. */
const SCORE_TIME_SPAN_MS = 10_000_000_000_000;

/** 정렬 점수: 농도가 높을수록, 농도가 같으면 먼저 등록할수록 크다. */
export function rankingScore(entry: Pick<RankingEntry, "intensity" | "registeredAt">): number {
  const registeredAtMs = Date.parse(entry.registeredAt);
  if (!Number.isFinite(registeredAtMs)) throw new RangeError("registeredAt이 올바른 시각이 아니다");
  return entry.intensity * SCORE_TIME_SPAN_MS + (SCORE_TIME_SPAN_MS - registeredAtMs);
}

const gradeSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const intensitySchema = z.number().int().min(0).max(100);

const judgmentRecordSchema = z.object({
  intensity: intensitySchema,
  region: z.enum(REGION_KEYS),
  grade: gradeSchema,
  mock: z.boolean(),
  // 이 필드가 생기기 전에 남긴 기록(배포 뒤 최대 1시간)은 유보가 아닌 것으로 읽는다.
  uncertain: z.boolean().default(false),
});

const rankingEntrySchema = z.object({
  id: z.string(),
  nickname: z.string(),
  intensity: intensitySchema,
  region: z.enum(REGION_KEYS),
  grade: gradeSchema,
  registeredAt: z.string(),
});

/** 정해 둔 필드만 남긴다. 호출부가 다른 값을 실어 보내도 저장되지 않는다. */
function pickJudgment(record: JudgmentRecord): JudgmentRecord {
  const { intensity, region, grade, mock, uncertain } = record;
  return { intensity, region, grade, mock, uncertain };
}

function pickEntry(entry: RankingEntry): RankingEntry {
  const { id, nickname, intensity, region, grade, registeredAt } = entry;
  return { id, nickname, intensity, region, grade, registeredAt };
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
 * 등록 표시(SET NX)와 항목 저장, 정렬 집합 추가를 한 번에 한다. 표시가 이미 있으면 0, 등록했으면 순위(1부터).
 * KEYS: 등록 표시, 항목 해시, 정렬 집합 / ARGV: 항목 id, 항목 JSON, 정렬 점수, 표시 만료(초)
 */
export const REGISTER_SCRIPT = `
if not redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[4]) then return 0 end
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
return redis.call('ZREVRANK', KEYS[3], ARGV[1]) + 1
`;

export function createUpstashRankingStore({
  url,
  token,
  fetcher,
}: UpstashConfig & { fetcher?: Fetcher }): RankingStore {
  const config: UpstashConfig = { url: url.replace(/\/+$/, ""), token };
  const run = (commands: string[][]) => upstashPipeline(config, commands, fetcher);

  return {
    async saveJudgment(judgmentId, record) {
      await run([
        [
          "SET",
          RANKING_KEYS.judgment(judgmentId),
          JSON.stringify(pickJudgment(record)),
          "EX",
          String(JUDGMENT_TTL_SECONDS),
        ],
      ]);
    },

    async getJudgment(judgmentId) {
      const [raw] = await run([["GET", RANKING_KEYS.judgment(judgmentId)]]);
      return parseStored(judgmentRecordSchema, raw);
    },

    async register(judgmentId, entry) {
      const stored = pickEntry(entry);
      const [result] = await run([
        [
          "EVAL",
          REGISTER_SCRIPT,
          "3",
          RANKING_KEYS.claim(judgmentId),
          RANKING_KEYS.entries,
          RANKING_KEYS.order,
          stored.id,
          JSON.stringify(stored),
          String(rankingScore(stored)),
          String(JUDGMENT_TTL_SECONDS),
        ],
      ]);
      const rank = Number(result);
      if (!Number.isInteger(rank) || rank < 0) {
        throw new Error("Upstash ranking store returned an invalid register response");
      }
      return rank === 0 ? null : rank;
    },

    async list(limit, meId) {
      assertListLimit(limit);
      const commands = [
        ["ZREVRANGE", RANKING_KEYS.order, "0", String(limit - 1)],
        ["ZCARD", RANKING_KEYS.order],
      ];
      if (meId) {
        commands.push(["ZREVRANK", RANKING_KEYS.order, meId], ["HGET", RANKING_KEYS.entries, meId]);
      }
      const [ids, total, meRank, meRaw] = await run(commands);

      const topIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
      const [raws] = topIds.length > 0 ? await run([["HMGET", RANKING_KEYS.entries, ...topIds]]) : [[]];
      const entries = (Array.isArray(raws) ? raws : [])
        .map((raw) => parseStored(rankingEntrySchema, raw))
        .filter((entry): entry is RankingEntry => entry !== null)
        .map((entry, index) => ({ rank: index + 1, entry }));

      const meEntry = meId && typeof meRank === "number" ? parseStored(rankingEntrySchema, meRaw) : null;
      return {
        entries,
        total: Number(total) || 0,
        me: meEntry ? { rank: Number(meRank) + 1, entry: meEntry } : null,
      };
    },

    async remove(entryId) {
      const [removedFromOrder, removedEntry] = await run([
        ["ZREM", RANKING_KEYS.order, entryId],
        ["HDEL", RANKING_KEYS.entries, entryId],
      ]);
      return Number(removedFromOrder) > 0 || Number(removedEntry) > 0;
    },
  };
}

export interface MemoryRankingState {
  judgments: Map<string, { record: JudgmentRecord; expiresAt: number }>;
  /** 감정 id → 등록 표시 만료 시각 */
  claims: Map<string, number>;
  entries: Map<string, { entry: RankingEntry; score: number }>;
}

export function createMemoryRankingState(): MemoryRankingState {
  return { judgments: new Map(), claims: new Map(), entries: new Map() };
}

/** 개발 서버가 파일을 다시 읽어도 기록이 남도록 전역에 둔다. */
const globalForRanking = globalThis as typeof globalThis & {
  __coRankingMemoryState?: MemoryRankingState;
};

function sharedMemoryState(): MemoryRankingState {
  globalForRanking.__coRankingMemoryState ??= createMemoryRankingState();
  return globalForRanking.__coRankingMemoryState;
}

/** 로컬 개발 전용. 프로세스 메모리에만 있어 서버리스 인스턴스끼리 공유되지 않는다. */
export function createMemoryRankingStore({
  now = Date.now,
  state = sharedMemoryState(),
}: { now?: () => number; state?: MemoryRankingState } = {}): RankingStore {
  // Redis 정렬 집합과 같은 순서: 점수 내림차순, 점수가 같으면 id 내림차순
  const sorted = () =>
    [...state.entries.values()].sort(
      (a, b) => b.score - a.score || (a.entry.id < b.entry.id ? 1 : a.entry.id > b.entry.id ? -1 : 0),
    );
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
      return sorted().findIndex((item) => item.entry.id === stored.id) + 1;
    },

    async list(limit, meId) {
      assertListLimit(limit);
      const all = sorted();
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
 * Upstash 연결 값(UPSTASH_REDIS_REST_* 또는 KV_REST_API_*)이 있으면 Redis를 쓴다.
 * Production에서 없으면 닫힌 상태로 실패한다. 가짜 응답 모드는 결과를 등록할 수 없으므로 메모리로 대신한다.
 * 로컬 개발에서는 메모리를 쓴다.
 */
export function rankingStoreFromEnv(
  env: Record<string, string | undefined> = process.env,
  options: { mock?: boolean } = {},
): RankingStore {
  const upstash = upstashConfigFromEnv(env);
  if (upstash.status === "ok") return createUpstashRankingStore(upstash.config);
  if (upstash.status === "insecure") throw new Error("Upstash Redis REST URL must use HTTPS");
  if (upstash.status === "partial" || (env.NODE_ENV === "production" && !options.mock)) {
    throw new Error("Upstash Redis ranking store is not configured");
  }
  return createMemoryRankingStore();
}
