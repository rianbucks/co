/**
 * 응답 제한 시간(명세 4장, 6장). 녹음이 60초로 늘어 늘렸다(11/21, 이전: 첫 시도 20초, 전체 25초, 화면 30초).
 * 일반 감정과 경상 정밀 감정이 같은 값을 쓴다.
 *
 * - 서버: AI 첫 시도 25초, 대체 모델 재시도까지 합쳐 40초 안에 끝낸다.
 * - 화면(S4): 45초를 넘기면 요청을 끊고 재시도를 안내한다. 서버가 먼저 끝나도록 40초보다 길게 둔다.
 * - route의 maxDuration(초)은 AI 전체 제한(40초)보다 길어야 한다(업로드, 호출 제한, 후처리 여유).
 *
 * 화면에서도 가져다 쓰므로 서버 전용 모듈을 가져오지 않는다.
 */

/** AI 첫 시도(주 모델)의 제한 시간 */
export const AI_FIRST_ATTEMPT_MS = 25_000;
/** 첫 시도와 재시도(대체 모델)를 합친 제한 시간 */
export const AI_TOTAL_MS = 40_000;

/** 화면(S4)이 응답을 기다리는 한도(초) */
export const JUDGING_WAIT_LIMIT_SEC = 45;

/**
 * 심사 단계 4개가 시작하는 경과 시간(초). 45초 한도에 맞춰 이전 배분(0, 2, 6, 12초)을 1.5배로 늘렸다.
 * 마지막 단계(결과 정리)는 응답이 올 때까지 이어진다.
 */
export const JUDGING_STEP_STARTS_SEC = [0, 3, 9, 18] as const;

/** 경과 시간(초)에 맞는 심사 단계 번호(0부터) */
export function judgingStepIndex(elapsedSec: number): number {
  let index = 0;
  JUDGING_STEP_STARTS_SEC.forEach((start, stepIndex) => {
    if (elapsedSec >= start) index = stepIndex;
  });
  return index;
}
