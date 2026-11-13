import { randomBytes, randomInt } from "node:crypto";
import type { IssueInfo } from "./postprocess";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 한국 시간 ISO 8601, 초 단위. 예: 2026-11-15T14:03:00+09:00 */
export function formatKstIso(date: Date): string {
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);
  return `${shifted.toISOString().slice(0, 19)}+09:00`;
}

export interface RandomSource {
  /** bytes 바이트 길이의 16진 문자열 */
  hex(bytes: number): string;
  /** 0 이상 max 미만의 정수 */
  int(max: number): number;
}

const cryptoRandom: RandomSource = {
  hex: (bytes) => randomBytes(bytes).toString("hex"),
  int: (max) => randomInt(max),
};

/**
 * id, 문서번호, 발급 시각을 만든다.
 * - id: j_ + 16진 12자리
 * - 문서번호: 제{발급 연도}-{6자리}호. DB가 없어 지금은 임의 번호이고, DB를 붙이면 일련번호로 바꾼다.
 */
export function createIssueInfo(now: Date, random: RandomSource = cryptoRandom): IssueInfo {
  const issuedAt = formatKstIso(now);
  const serial = String(random.int(1_000_000)).padStart(6, "0");
  return {
    id: `j_${random.hex(6)}`,
    certificateNo: `제${issuedAt.slice(0, 4)}-${serial}호`,
    issuedAt,
  };
}
