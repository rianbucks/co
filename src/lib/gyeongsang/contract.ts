/**
 * 경상 정밀 감정(questionSetId=set-gs)의 응답 계약(명세 12장).
 * 일반 감정(set-a)의 계약(../judge/contract.ts)은 바꾸지 않고, 공통 타입과 상태 코드만 가져다 쓴다.
 * 화면에서도 가져다 쓰므로 서버 전용 모듈(node:*)을 가져오지 않는다.
 */
import {
  ERROR_STATUS,
  type Grade,
  type JudgeErrorBody,
  type JudgeErrorCode,
  type PartScores,
  type JudgeSegment,
  type RejectReason,
} from "../judge/contract";

/** 경상 방언의 두 성분: 경북권(대구·경북)과 경남권(부산·울산·경남). 이 순서는 비율이 같을 때의 우선순위다. */
export const SUBREGION_KEYS = ["gyeongbuk", "gyeongnam"] as const;
export type SubregionKey = (typeof SUBREGION_KEYS)[number];
/** 성분 비율. 0 이상의 정수이고 합은 100이다. */
export type SubregionRatios = Record<SubregionKey, number>;

export const SUBREGION_NAMES: Record<SubregionKey, string> = {
  gyeongbuk: "경북권",
  gyeongnam: "경남권",
};

/** 성분에 드는 지역(신고 원산지와 같은 이름). */
export const SUBREGION_AREAS: Record<SubregionKey, string> = {
  gyeongbuk: "대구·경북",
  gyeongnam: "부산·울산·경남",
};

/** 정밀 감정의 근거. 일반 감정과 달리 항목(어휘, 어미 등) 구분 없이 문항 번호, 인용, 설명만 둔다. */
export interface GsEvidence {
  /** 근거가 나온 문항 번호(1부터). 문항별 받아쓰기가 없어 문항으로 확인하지 못했으면 null */
  question: number | null;
  /** 받아쓰기에 그대로 있는 구절(공백 정리) */
  quote: string;
  note: string;
}

export interface GyeongsangResult {
  /** g_ + 16진 12자리. 일반 감정의 id(j_)와 겹치지 않는다. */
  id: string;
  /** 제{발급 연도}-경상-{6자리}호 */
  certificateNo: string;
  issuedAt: string;
  /** 경북권과 경남권의 성분 비율. 합은 100 */
  subregions: SubregionRatios;
  /** 경상 방언 농도. 항목 점수는 경상 방언 특징 기준이고, 가중치와 등급표는 일반 감정과 같다. */
  intensity: {
    score: number;
    grade: Grade;
    gradeName: string;
    parts: PartScores;
  };
  /**
   * 녹음이 감정 결과(점수, 지역, 등급)를 지시하려 했다고 모델이 본 경우. 결과는 그대로 보여 주고,
   * 정밀 감정 랭킹에는 등록할 수 없다(403 not_eligible, reason: "instruction").
   */
  instructionAttempt: boolean;
  evidence: GsEvidence[];
  /** 전체 받아쓰기 */
  transcript: string;
  /**
   * 문항별 받아쓰기(문항 순서). 일반 감정과 같이 문항 종류(kind)를 싣는다.
   * 모델이 문항 수만큼 주지 않았으면 빈 배열이다.
   */
  segments: JudgeSegment[];
}

/** 경상 방언으로 보기 어려운 녹음이라 정밀 감정을 하지 않았다는 반려 사유. */
export const NOT_GYEONGSANG = "not_gyeongsang";

/** 422 rejected의 reason: 일반 감정의 사유(too_short, no_speech, noisy)에 not_gyeongsang을 더한다. */
export type GsRejectReason = RejectReason | typeof NOT_GYEONGSANG;

export type GsErrorBody =
  | Exclude<JudgeErrorBody, { error: "rejected" }>
  | { error: "rejected"; reason: GsRejectReason };

export type GsJudgeResponse =
  | { status: 200; body: GyeongsangResult }
  | { status: number; body: GsErrorBody };

export function gsErrorResponse(error: Exclude<JudgeErrorCode, "rejected">): GsJudgeResponse {
  return { status: ERROR_STATUS[error], body: { error } };
}

export function gsRejectedResponse(reason: GsRejectReason): GsJudgeResponse {
  return { status: ERROR_STATUS.rejected, body: { error: "rejected", reason } };
}
