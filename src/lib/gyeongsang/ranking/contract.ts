/**
 * 경상 정밀 감정 랭킹 API 계약(명세 12장). 기존 농도 랭킹(../../ranking)과 키와 경로가 다른 별도 랭킹이다.
 * 화면(정밀 랭킹)도 이 타입을 쓰므로 서버 전용 코드를 넣지 않는다.
 *
 * POST   /api/gyeongsang-ranking        { judgmentId, nickname, origin } → 201 GsRankingRegistered
 * GET    /api/gyeongsang-ranking?area=all&limit=50[&id=gr_...] → 200 GsRankingList
 * DELETE /api/gyeongsang-ranking/{id}   Authorization: Bearer <ADMIN_TOKEN> → 204
 * 오류 형식과 상태 코드는 기존 랭킹과 같다(RankingErrorBody).
 */
import type { Grade } from "../../judge/contract";
import type { OriginKey } from "../origin";

/** 보기: 전체, 대구·경북, 부산·울산·경남. 나누는 기준은 AI 판정이 아니라 신고 원산지다. */
export const GS_RANKING_AREAS = ["all", "gyeongbuk", "gyeongnam"] as const;
export type GsRankingArea = (typeof GS_RANKING_AREAS)[number];

export const GS_RANKING_AREA_NAMES: Record<GsRankingArea, string> = {
  all: "전체",
  gyeongbuk: "대구·경북",
  gyeongnam: "부산·울산·경남",
};

export function isGsRankingArea(value: unknown): value is GsRankingArea {
  return typeof value === "string" && (GS_RANKING_AREAS as readonly string[]).includes(value);
}

/** 정밀 랭킹에 저장하는 값은 이것뿐이다: 항목 id, 닉네임, 신고 원산지, 경상 농도, 경북권 비율, 등록 시각. */
export interface GsRankingEntry {
  id: string;
  nickname: string;
  /** 신고 원산지(사용자가 고른 값) */
  origin: OriginKey;
  /** 경상 농도 0~100 */
  intensity: number;
  /** 경북권 비율 0~100. 경남권은 100에서 뺀 값이다. */
  gyeongbuk: number;
  /** 한국 시간 ISO 8601 */
  registeredAt: string;
}

/** 응답에 싣는 항목. 순위, 등급, 원산지 일치 여부는 저장하지 않고 읽을 때 붙인다. */
export interface GsRankingEntryView extends GsRankingEntry {
  /** 1부터. 조회한 보기 안에서 농도가 높은 순, 같으면 먼저 등록한 순. 등록 응답은 전체 순위 */
  rank: number;
  grade: Grade;
  gradeName: string;
  /** 신고 원산지가 드는 성분이 50 이상이면 true(원산지 일치) */
  matched: boolean;
}

export interface GsRankingRegistered {
  entry: GsRankingEntryView;
}

export interface GsRankingList {
  area: GsRankingArea;
  entries: GsRankingEntryView[];
  /** 그 보기에 등록된 항목 수 */
  total: number;
  /** id를 주면 그 항목과 그 보기 안에서의 순위. 없거나 지워졌거나 다른 보기의 항목이면 null */
  me: GsRankingEntryView | null;
}

/** 정밀 감정 결과 id(g_ + 16진 12자리)와 정밀 랭킹 항목 id(gr_ + 16진 12자리) */
export const GS_JUDGMENT_ID_PATTERN = /^g_[0-9a-f]{12}$/;
export const GS_ENTRY_ID_PATTERN = /^gr_[0-9a-f]{12}$/;
