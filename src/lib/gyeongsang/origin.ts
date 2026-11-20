/**
 * 신고 원산지와 정밀 감정 결과의 일치 여부(명세 12장).
 * 신고 원산지는 사용자가 녹음 전에 고르는 출신 지역이다. 서버로 보내거나 저장하지 않고 화면과 감정서에만 쓴다.
 * 화면에서도 가져다 쓰므로 서버 전용 모듈(node:*)을 가져오지 않는다.
 */
import type { SubregionKey, SubregionRatios } from "./contract";

/** 신고할 수 있는 원산지. 화면에 이 순서로 보여 준다. */
export const ORIGIN_KEYS = ["daegu", "gyeongbuk", "busan", "ulsan", "gyeongnam"] as const;
export type OriginKey = (typeof ORIGIN_KEYS)[number];

export const ORIGIN_NAMES: Record<OriginKey, string> = {
  daegu: "대구",
  gyeongbuk: "경북",
  busan: "부산",
  ulsan: "울산",
  gyeongnam: "경남",
};

/** 원산지가 드는 성분: 대구와 경북은 경북권, 부산, 울산, 경남은 경남권이다. */
export const ORIGIN_SUBREGION: Record<OriginKey, SubregionKey> = {
  daegu: "gyeongbuk",
  gyeongbuk: "gyeongbuk",
  busan: "gyeongnam",
  ulsan: "gyeongnam",
  gyeongnam: "gyeongnam",
};

/** 신고 원산지가 드는 성분의 비율이 이 값 이상이면 원산지 일치다. */
export const ORIGIN_MATCH_THRESHOLD = 50;

export const ORIGIN_MATCH_LABEL = "원산지 일치";
export const ORIGIN_MISMATCH_LABEL = "원산지 불일치, 재심 권고";

export function isOriginKey(value: unknown): value is OriginKey {
  return typeof value === "string" && (ORIGIN_KEYS as readonly string[]).includes(value);
}

export interface OriginMatch {
  matched: boolean;
  /** '원산지 일치' 또는 '원산지 불일치, 재심 권고' */
  label: string;
  /** 신고 원산지가 드는 성분 */
  subregion: SubregionKey;
  /** 그 성분의 비율 */
  ratio: number;
}

/**
 * 신고가 대구나 경북이면 경북권 비율이, 부산, 울산, 경남이면 경남권 비율이 50 이상일 때 원산지 일치다.
 * 두 성분이 50씩이면 어느 원산지를 신고해도 일치다.
 */
export function judgeOriginMatch(origin: OriginKey, subregions: SubregionRatios): OriginMatch {
  const subregion = ORIGIN_SUBREGION[origin];
  const ratio = subregions[subregion];
  const matched = ratio >= ORIGIN_MATCH_THRESHOLD;
  return { matched, label: matched ? ORIGIN_MATCH_LABEL : ORIGIN_MISMATCH_LABEL, subregion, ratio };
}
