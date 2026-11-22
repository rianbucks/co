/**
 * 랭킹 API 계약(음성 없는 랭킹). 화면(S7)도 이 타입을 쓰므로 서버 전용 코드를 넣지 않는다.
 *
 * POST   /api/ranking        { judgmentId, nickname } → 201 RankingRegistered
 * GET    /api/ranking?limit=50[&id=r_...] → 200 RankingList
 * DELETE /api/ranking/{id}   Authorization: Bearer <ADMIN_TOKEN> → 204
 */
import type { Grade, RegionKey } from "../judge/contract";

/** 랭킹에 저장하는 값은 이것뿐이다: 항목 id, 닉네임, 농도, 지역(1순위 권역), 등급, 등록 시각. */
export interface RankingEntry {
  id: string;
  nickname: string;
  intensity: number;
  region: RegionKey;
  grade: Grade;
  /** 한국 시간 ISO 8601 */
  registeredAt: string;
}

/** 응답에 싣는 항목. 순위와 등급명은 저장하지 않고 읽을 때 붙인다. */
export interface RankingEntryView extends RankingEntry {
  /** 1부터. 농도가 높은 순, 같으면 먼저 등록한 순 */
  rank: number;
  gradeName: string;
}

export interface RankingRegistered {
  entry: RankingEntryView;
}

export interface RankingList {
  entries: RankingEntryView[];
  /** 등록된 전체 항목 수 */
  total: number;
  /** id를 주면 그 항목과 현재 순위. 없거나 지워졌으면 null */
  me: RankingEntryView | null;
}

export type RankingErrorBody =
  | { error: "invalid_request" }
  | { error: "invalid_nickname"; reason: "length" | "characters" | "banned" }
  | { error: "not_found" }
  | { error: "not_eligible"; reason: "mock" | "uncertain" | "instruction" }
  | { error: "already_registered" }
  | { error: "rate_limited" }
  | { error: "unauthorized" }
  | { error: "server_error" };

export type RankingErrorCode = RankingErrorBody["error"];

export const RANKING_ERROR_STATUS: Record<RankingErrorCode, number> = {
  invalid_request: 400,
  invalid_nickname: 400,
  unauthorized: 401,
  not_eligible: 403,
  not_found: 404,
  already_registered: 409,
  rate_limited: 429,
  server_error: 500,
};

/** 한 번에 내려주는 최대 항목 수(상위 50명) */
export const RANKING_LIST_MAX = 50;

/** 감정 결과 id(j_ + 16진 12자리)와 랭킹 항목 id(r_ + 16진 12자리) */
export const JUDGMENT_ID_PATTERN = /^j_[0-9a-f]{12}$/;
export const ENTRY_ID_PATTERN = /^r_[0-9a-f]{12}$/;
