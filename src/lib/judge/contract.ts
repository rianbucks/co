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

/** 근거가 가리키는 권역: 여섯 권역 중 하나, 여러 권역에 공통인 특징이면 common. */
export const EVIDENCE_REGIONS = [...REGION_KEYS, "common"] as const;
export type EvidenceRegion = (typeof EVIDENCE_REGIONS)[number];

export interface Evidence {
  /** 근거가 나온 문항 번호(1부터). 문항별 받아쓰기가 없어 문항으로 확인하지 못했으면 null */
  question: number | null;
  /** 받아쓰기에 그대로 있는 구절 */
  quote: string;
  type: PartKey;
  /** 그 특징이 가리키는 권역. 여러 권역에 공통이면 common. 모델이 정해 둔 값으로 주지 않았으면 null */
  region: EvidenceRegion | null;
  note: string;
}

/**
 * 문항 종류(명세 8장).
 * question: 상황을 보고 자유롭게 답한다. convert: 주어진 표준어 문장을 평소 말투로 바꿔 말한다.
 */
export const QUESTION_KINDS = ["question", "convert"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** 문항별 받아쓰기(명세 7장). 문항 문구는 서버의 문항 세트에서 가져온다. */
export interface Segment {
  /** 문항 번호(1부터) */
  question: number;
  /** 문항 문구 */
  prompt: string;
  /** 그 문항의 받아쓰기(공백 정리). 답하지 않은 문항은 빈 문자열 */
  transcript: string;
}

/** 일반 감정의 문항별 받아쓰기. 문항 종류를 함께 싣는다. convert면 prompt는 바꿔 말할 표준어 문장이다. */
export interface JudgeSegment {
  /** 문항 번호(1부터) */
  question: number;
  kind: QuestionKind;
  /** 문항 문구(상황 문구 또는 바꿔 말할 문장) */
  prompt: string;
  /** 그 문항의 받아쓰기(공백 정리). 답하지 않은 문항은 빈 문자열 */
  transcript: string;
}

export interface JudgeResult {
  id: string;
  certificateNo: string;
  issuedAt: string;
  region: {
    top: RegionKey;
    label: string;
    mixed: boolean;
    /**
     * 판정 유보. 검증을 통과한 근거 중 1순위 권역을 가리키는 것이 2개 미만이거나,
     * 다른 권역을 가리키는 것이 더 많으면 true다. 화면은 '판정 유보 (추정: ○○ 방언)'으로 보여 준다.
     */
    uncertain: boolean;
    probabilities: RegionProbabilities;
  };
  intensity: {
    score: number;
    grade: Grade;
    gradeName: string;
    parts: PartScores;
  };
  /**
   * 타 지역 방언 모사 의심(모델 판단). true면 intensity.score는 계산값의 절반이고
   * 소견 끝에 '타 지역 방언 모사 의심.'이 붙는다.
   */
  imitationSuspected: boolean;
  /**
   * 억양 상한에 걸렸는지. 가중 합 농도가 (억양 점수 + 20)을 넘어 그 값으로 낮췄으면 true이고,
   * 소견 끝에 억양 상한 안내가 붙는다(명세 4장).
   */
  intonationCapped: boolean;
  /**
   * 녹음이 감정 결과(점수, 지역, 등급)를 지시하려 했다고 모델이 본 경우. 결과는 그대로 보여 주고,
   * 랭킹에는 등록할 수 없다(명세 7장 403 not_eligible, reason: "instruction").
   */
  instructionAttempt: boolean;
  evidence: Evidence[];
  opinion: string;
  /** 전체 받아쓰기 */
  transcript: string;
  /**
   * 문항별 받아쓰기(문항 순서). 모델이 문항 수만큼 주지 않았으면 빈 배열이고,
   * 이때 근거는 전체 받아쓰기로 검증하며 question은 null이다.
   */
  segments: JudgeSegment[];
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
