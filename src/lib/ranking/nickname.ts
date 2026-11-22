/**
 * 랭킹 닉네임 규칙. 서버(일반 랭킹, 정밀 감정 랭킹)와 화면(S1, S7, 정밀 랭킹)이 같이 쓰므로 서버 전용 코드를 넣지 않는다.
 * 2~10자, 한글(완성형과 자모), 영문, 숫자만. 앞뒤 공백은 떼고 유니코드 NFC로 맞춘다.
 * 욕설과 비속어, 성적 표현, 혐오 표현은 금칙어 목록(./banned-words.ts)으로 막는다(problem: "banned"). 실명은 막지 않는다.
 */
import { findBannedWord } from "./nickname-filter";

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 10;

const NICKNAME_PATTERN = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+$/u;

export type NicknameCheck =
  | { ok: true; value: string }
  | { ok: false; problem: "length" | "characters" | "banned" };

export function checkNickname(input: unknown): NicknameCheck {
  if (typeof input !== "string") return { ok: false, problem: "characters" };
  const value = input.normalize("NFC").trim();
  const length = [...value].length;
  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) {
    return { ok: false, problem: "length" };
  }
  if (!NICKNAME_PATTERN.test(value)) return { ok: false, problem: "characters" };
  if (findBannedWord(value) !== null) return { ok: false, problem: "banned" };
  return { ok: true, value };
}
