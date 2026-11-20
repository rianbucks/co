/**
 * 랭킹 등록, 조회, 삭제(음성 없는 랭킹). 라우트는 요청을 읽어 이 함수들에 넘기기만 한다.
 * 등록할 때 농도, 지역, 등급은 클라이언트가 아니라 감정할 때 서버가 남긴 기록에서 읽는다.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { formatKstIso } from "../judge/issue";
import { GRADE_TABLE } from "../judge/rules";
import type { RateLimiter } from "../rate-limit";
import {
  ENTRY_ID_PATTERN,
  JUDGMENT_ID_PATTERN,
  RANKING_ERROR_STATUS,
  RANKING_LIST_MAX,
  type RankingEntry,
  type RankingEntryView,
  type RankingErrorBody,
  type RankingList,
  type RankingRegistered,
} from "./contract";
import { checkNickname } from "./nickname";
import type { RankedEntry, RankingStore } from "./store";

export type RankingOutcome<T> =
  | { status: 200 | 201; body: T }
  | { status: 204; body: null }
  | { status: number; body: RankingErrorBody };

export function rankingError(body: RankingErrorBody): { status: number; body: RankingErrorBody } {
  return { status: RANKING_ERROR_STATUS[body.error], body };
}

/** 라우트 응답. 순위는 바뀌므로 캐시하지 않는다. */
export function toHttpResponse(outcome: RankingOutcome<unknown>): Response {
  if (outcome.status === 204) return new Response(null, { status: 204 });
  return Response.json(outcome.body, {
    status: outcome.status,
    headers: { "Cache-Control": "no-store" },
  });
}

function gradeName(grade: RankingEntry["grade"]): string {
  return GRADE_TABLE.find((row) => row.grade === grade)?.name ?? "";
}

export function toView({ rank, entry }: RankedEntry): RankingEntryView {
  return {
    rank,
    id: entry.id,
    nickname: entry.nickname,
    intensity: entry.intensity,
    region: entry.region,
    grade: entry.grade,
    gradeName: gradeName(entry.grade),
    registeredAt: entry.registeredAt,
  };
}

export function newEntryId(): string {
  return `r_${randomBytes(6).toString("hex")}`;
}

export interface RegisterDeps {
  store: RankingStore;
  rateLimiter: RateLimiter;
  /** 서버가 가짜 응답 모드로 떠 있으면 등록을 받지 않는다. */
  mock: boolean;
  now?: () => Date;
  newEntryId?: () => string;
}

function parseRegisterBody(body: unknown): { judgmentId: string; nickname: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { judgmentId, nickname } = body as Record<string, unknown>;
  if (typeof judgmentId !== "string" || !JUDGMENT_ID_PATTERN.test(judgmentId)) return null;
  if (typeof nickname !== "string") return null;
  return { judgmentId, nickname };
}

/**
 * POST /api/ranking. 본문에서는 judgmentId와 nickname만 쓰고, 점수 같은 다른 값은 무시한다.
 * 순서: 형식 → 닉네임 → 가짜 응답 모드 → 감정 기록(1시간) → 자격(가짜 응답, flags) → IP당 하루 한도 → 1회 등록
 */
export async function registerRanking(
  input: { body: unknown; clientIp: string | null },
  deps: RegisterDeps,
): Promise<RankingOutcome<RankingRegistered>> {
  const request = parseRegisterBody(input.body);
  if (!request) return rankingError({ error: "invalid_request" });

  const nickname = checkNickname(request.nickname);
  if (!nickname.ok) return rankingError({ error: "invalid_nickname", reason: nickname.problem });

  if (deps.mock) return rankingError({ error: "not_eligible", reason: "mock" });

  const record = await deps.store.getJudgment(request.judgmentId);
  if (!record) return rankingError({ error: "not_found" });
  if (record.mock) return rankingError({ error: "not_eligible", reason: "mock" });
  if (record.flagged) return rankingError({ error: "not_eligible", reason: "flagged" });

  const limit = await deps.rateLimiter.check({ ip: input.clientIp });
  if (!limit.allowed) return rankingError({ error: "rate_limited" });

  const entry: RankingEntry = {
    id: (deps.newEntryId ?? newEntryId)(),
    nickname: nickname.value,
    intensity: record.intensity,
    region: record.region,
    grade: record.grade,
    registeredAt: formatKstIso(deps.now ? deps.now() : new Date()),
  };
  const rank = await deps.store.register(request.judgmentId, entry);
  if (rank === null) return rankingError({ error: "already_registered" });

  return { status: 201, body: { entry: toView({ rank, entry }) } };
}

export interface ListQuery {
  limit: number;
  meId: string | null;
}

/** limit은 없으면 50, 50보다 크면 50으로 줄인다. 1 미만이나 숫자가 아니면 null. id는 랭킹 항목 id 형식만 받는다. */
export function parseListQuery(params: URLSearchParams): ListQuery | null {
  const rawLimit = params.get("limit");
  let limit = RANKING_LIST_MAX;
  if (rawLimit !== null) {
    if (!/^\d{1,6}$/.test(rawLimit)) return null;
    const value = Number(rawLimit);
    if (value < 1) return null;
    limit = Math.min(value, RANKING_LIST_MAX);
  }

  const meId = params.get("id");
  if (meId !== null && !ENTRY_ID_PATTERN.test(meId)) return null;
  return { limit, meId };
}

/** GET /api/ranking */
export async function listRanking(
  query: ListQuery,
  store: RankingStore,
): Promise<RankingOutcome<RankingList>> {
  const page = await store.list(query.limit, query.meId);
  return {
    status: 200,
    body: {
      entries: page.entries.map(toView),
      total: page.total,
      me: page.me ? toView(page.me) : null,
    },
  };
}

/** 운영자 토큰은 이보다 짧으면 설정되지 않은 것으로 본다. */
export const ADMIN_TOKEN_MIN_LENGTH = 16;

export function isAdminTokenConfigured(adminToken: string | undefined): boolean {
  return (adminToken?.trim().length ?? 0) >= ADMIN_TOKEN_MIN_LENGTH;
}

/** Authorization: Bearer <ADMIN_TOKEN>. 길이가 달라도 시간이 같도록 해시끼리 비교한다. */
export function isAdminRequest(authorization: string | null, adminToken: string | undefined): boolean {
  if (!isAdminTokenConfigured(adminToken)) return false;
  const provided = /^Bearer\s+(\S+)$/i.exec(authorization?.trim() ?? "")?.[1];
  if (!provided) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(adminToken!.trim()));
}

/** DELETE /api/ranking/{id}. 운영자 확인은 호출 전에 isAdminRequest로 한다. */
export async function deleteRanking(
  entryId: string,
  store: RankingStore,
): Promise<RankingOutcome<never>> {
  if (!ENTRY_ID_PATTERN.test(entryId)) return rankingError({ error: "not_found" });
  const removed = await store.remove(entryId);
  return removed ? { status: 204, body: null } : rankingError({ error: "not_found" });
}
