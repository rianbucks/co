/**
 * 호출 제한(명세 9장): 개인(IP 해시 기준) 하루 5회, 전체 하루 1,500회. 넘으면 429 rate_limited.
 * 명세 7장대로 judgments 테이블의 오늘 건수를 세어 판단할 예정이라, DB를 붙일 때 구현한다.
 */

export type RateLimitDecision = { allowed: true } | { allowed: false; scope: "ip" | "global" };

export interface RateLimiter {
  /**
   * 감정 요청을 받기 전에 하루 한도를 확인한다.
   * ip는 원문이다. 구현에서 해시(솔트 포함)로 바꾸고 원문은 저장하지 않는다(명세 9장).
   */
  check(client: { ip: string | null }): Promise<RateLimitDecision>;
}

/** DB를 붙이기 전까지 쓰는 빈 구현. 항상 허용한다. */
export const noopRateLimiter: RateLimiter = {
  async check() {
    return { allowed: true };
  },
};
