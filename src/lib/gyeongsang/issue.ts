import { cryptoRandom, formatKstIso, type RandomSource } from "../judge/issue";
import type { IssueInfo } from "../judge/postprocess";

/**
 * 정밀 감정의 id, 문서번호, 발급 시각을 만든다(일반 감정의 createIssueInfo와 같은 방식).
 * - id: g_ + 16진 12자리. 일반 감정의 id(j_)와 접두어가 달라 일반 랭킹에 등록할 수 없다.
 * - 문서번호: 제{발급 연도}-경상-{6자리}호. DB가 없어 지금은 임의 번호다.
 */
export function createGsIssueInfo(now: Date, random: RandomSource = cryptoRandom): IssueInfo {
  const issuedAt = formatKstIso(now);
  const serial = String(random.int(1_000_000)).padStart(6, "0");
  return {
    id: `g_${random.hex(6)}`,
    certificateNo: `제${issuedAt.slice(0, 4)}-경상-${serial}호`,
    issuedAt,
  };
}
