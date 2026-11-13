/**
 * POST /api/judge 응답 계약(명세 7장).
 * 결과의 transcript는 저장하지 않고 응답으로 한 번만 내려보낸다(명세 9장).
 */

/** 권역 키. 이 순서는 확률이 같을 때의 우선순위이기도 하다(명세 1장 나열 순서). */
export const REGION_KEYS = [
  "seoul_gyeonggi",
  "gangwon",
  "chungcheong",
  "gyeongsang",
  "jeolla",
  "jeju",
] as const;
export type RegionKey = (typeof REGION_KEYS)[number];
export type RegionProbabilities = Record<RegionKey, number>;

/** 농도 항목: 어휘, 어미, 음운, 억양. */
export const PART_KEYS = ["vocabulary", "endings", "phonology", "intonation"] as const;
export type PartKey = (typeof PART_KEYS)[number];
export type PartScores = Record<PartKey, number>;

export type Grade = 1 | 2 | 3 | 4 | 5;

export interface Evidence {
  type: PartKey;
  quote: string;
  note: string;
}

export interface JudgeResult {
  id: string;
  certificateNo: string;
  issuedAt: string;
  region: {
    top: RegionKey;
    label: string;
    mixed: boolean;
    probabilities: RegionProbabilities;
  };
  intensity: {
    score: number;
    grade: Grade;
    gradeName: string;
    parts: PartScores;
  };
  evidence: Evidence[];
  opinion: string;
  transcript: string;
}

/** 422 rejected의 reason. 모델 출력의 audio_quality 값(ok 제외)을 그대로 쓴다. */
export const REJECT_REASONS = ["too_short", "no_speech", "noisy"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export type JudgeErrorBody =
  | { error: "invalid_audio" }
  | { error: "invalid_request" }
  | { error: "too_large" }
  | { error: "rejected"; reason: RejectReason }
  | { error: "rate_limited" }
  | { error: "ai_error" }
  | { error: "server_error" };

export type JudgeErrorCode = JudgeErrorBody["error"];

export const ERROR_STATUS: Record<JudgeErrorCode, number> = {
  invalid_audio: 400,
  invalid_request: 400,
  too_large: 413,
  rejected: 422,
  rate_limited: 429,
  ai_error: 502,
  server_error: 500,
};

export type JudgeResponse =
  | { status: 200; body: JudgeResult }
  | { status: number; body: JudgeErrorBody };

export function errorResponse(error: Exclude<JudgeErrorCode, "rejected">): JudgeResponse {
  return { status: ERROR_STATUS[error], body: { error } };
}

export function rejectedResponse(reason: RejectReason): JudgeResponse {
  return { status: ERROR_STATUS.rejected, body: { error: "rejected", reason } };
}
