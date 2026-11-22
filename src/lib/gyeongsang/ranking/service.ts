/**
 * 경상 정밀 감정 랭킹 등록, 조회, 삭제. 라우트는 요청을 읽어 이 함수들에 넘기기만 한다.
 * 규칙은 기존 농도 랭킹(../../ranking/service.ts)과 같다:
 * - 경상 농도와 경북권 비율은 클라이언트가 아니라 정밀 감정할 때 서버가 남긴 기록에서 읽는다(점수 위조 방지).
 * - 감정 1건당 1회, 감정 후 1시간 안에만 등록한다. 닉네임 규칙과 운영자 삭제도 같다.
 * - 가짜 응답 모드의 결과는 등록하지 않는다. 음성과 받아쓰기를 저장하거나 공개하지 않으므로 녹음 내용으로는 막지 않는다.
 * 신고 원산지는 사용자가 고른 값이라 등록 요청으로 받는다. 보기(대구·경북, 부산·울산·경남)는 이 값으로 나눈다.
 */
import { randomBytes } from "node:crypto";
import { formatKstIso } from "../../judge/issue";
import { gradeFor } from "../../judge/postprocess";
import type { RateLimiter } from "../../rate-limit";
import { RANKING_LIST_MAX } from "../../ranking/contract";
import { checkNickname } from "../../ranking/nickname";
import { rankingError, type RankingOutcome } from "../../ranking/service";
import { isOriginKey, judgeOriginMatch, type OriginKey } from "../origin";
import {
  GS_ENTRY_ID_PATTERN,
  GS_JUDGMENT_ID_PATTERN,
  isGsRankingArea,
  type GsRankingArea,
  type GsRankingEntry,
  type GsRankingEntryView,
  type GsRankingList,
  type GsRankingRegistered,
} from "./contract";
import type { GsRankedEntry, GsRankingStore } from "./store";

export function toGsView({ rank, entry }: GsRankedEntry): GsRankingEntryView {
  const { grade, gradeName } = gradeFor(entry.intensity);
  const { matched } = judgeOriginMatch(entry.origin, {
    gyeongbuk: entry.gyeongbuk,
    gyeongnam: 100 - entry.gyeongbuk,
  });
  return {
    rank,
    id: entry.id,
    nickname: entry.nickname,
    origin: entry.origin,
    intensity: entry.intensity,
    gyeongbuk: entry.gyeongbuk,
    grade,
    gradeName,
    matched,
    registeredAt: entry.registeredAt,
  };
}

export function newGsEntryId(): string {
  return `gr_${randomBytes(6).toString("hex")}`;
}

export interface GsRegisterDeps {
  store: GsRankingStore;
  /** 기존 랭킹 등록과 같은 제한기(IP당 하루 60회, 두 랭킹 합산) */
  rateLimiter: RateLimiter;
  /** 서버가 가짜 응답 모드로 떠 있으면 등록을 받지 않는다. */
  mock: boolean;
  now?: () => Date;
  newEntryId?: () => string;
}

function parseRegisterBody(body: unknown): { judgmentId: string; nickname: string; origin: OriginKey } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { judgmentId, nickname, origin } = body as Record<string, unknown>;
  if (typeof judgmentId !== "string" || !GS_JUDGMENT_ID_PATTERN.test(judgmentId)) return null;
  if (typeof nickname !== "string") return null;
  if (!isOriginKey(origin)) return null;
  return { judgmentId, nickname, origin };
}

/**
 * POST /api/gyeongsang-ranking. 본문에서는 judgmentId, nickname, origin만 쓰고, 점수 같은 다른 값은 무시한다.
 * 순서: 형식(신고 원산지 포함) → 닉네임 → 가짜 응답 모드 → 감정 기록(1시간) → 자격(가짜 응답, 지시 발화) → IP당 하루 한도 → 1회 등록
 */
export async function registerGsRanking(
  input: { body: unknown; clientIp: string | null },
  deps: GsRegisterDeps,
): Promise<RankingOutcome<GsRankingRegistered>> {
  const request = parseRegisterBody(input.body);
  if (!request) return rankingError({ error: "invalid_request" });

  const nickname = checkNickname(request.nickname);
  if (!nickname.ok) return rankingError({ error: "invalid_nickname", reason: nickname.problem });

  if (deps.mock) return rankingError({ error: "not_eligible", reason: "mock" });

  const record = await deps.store.getJudgment(request.judgmentId);
  if (!record) return rankingError({ error: "not_found" });
  if (record.mock) return rankingError({ error: "not_eligible", reason: "mock" });
  if (record.instructionAttempt) return rankingError({ error: "not_eligible", reason: "instruction" });

  const limit = await deps.rateLimiter.check({ ip: input.clientIp });
  if (!limit.allowed) return rankingError({ error: "rate_limited" });

  const entry: GsRankingEntry = {
    id: (deps.newEntryId ?? newGsEntryId)(),
    nickname: nickname.value,
    origin: request.origin,
    intensity: record.intensity,
    gyeongbuk: record.gyeongbuk,
    registeredAt: formatKstIso(deps.now ? deps.now() : new Date()),
  };
  const rank = await deps.store.register(request.judgmentId, entry);
  if (rank === null) return rankingError({ error: "already_registered" });

  return { status: 201, body: { entry: toGsView({ rank, entry }) } };
}

export interface GsListQuery {
  area: GsRankingArea;
  limit: number;
  meId: string | null;
}

/**
 * area는 all, gyeongbuk, gyeongnam이고 없으면 all이다. limit은 없으면 50, 50보다 크면 50으로 줄인다.
 * 1 미만이나 숫자가 아니면 null. id는 정밀 랭킹 항목 id 형식만 받는다.
 */
export function parseGsListQuery(params: URLSearchParams): GsListQuery | null {
  const rawArea = params.get("area");
  const area = rawArea ?? "all";
  if (!isGsRankingArea(area)) return null;

  const rawLimit = params.get("limit");
  let limit = RANKING_LIST_MAX;
  if (rawLimit !== null) {
    if (!/^\d{1,6}$/.test(rawLimit)) return null;
    const value = Number(rawLimit);
    if (value < 1) return null;
    limit = Math.min(value, RANKING_LIST_MAX);
  }

  const meId = params.get("id");
  if (meId !== null && !GS_ENTRY_ID_PATTERN.test(meId)) return null;
  return { area, limit, meId };
}

/** GET /api/gyeongsang-ranking */
export async function listGsRanking(
  query: GsListQuery,
  store: GsRankingStore,
): Promise<RankingOutcome<GsRankingList>> {
  const page = await store.list(query.area, query.limit, query.meId);
  return {
    status: 200,
    body: {
      area: query.area,
      entries: page.entries.map(toGsView),
      total: page.total,
      me: page.me ? toGsView(page.me) : null,
    },
  };
}

/** DELETE /api/gyeongsang-ranking/{id}. 운영자 확인은 호출 전에 isAdminRequest(기존 랭킹과 같은 함수)로 한다. */
export async function deleteGsRanking(
  entryId: string,
  store: GsRankingStore,
): Promise<RankingOutcome<never>> {
  if (!GS_ENTRY_ID_PATTERN.test(entryId)) return rankingError({ error: "not_found" });
  const removed = await store.remove(entryId);
  return removed ? { status: 204, body: null } : rankingError({ error: "not_found" });
}
