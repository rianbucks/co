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

/** 닉네임 겹침 비교 키: NFC로 맞추고 영문 대소문자를 구분하지 않는다(Admin과 admin은 같은 이름). */
export function nicknameKey(nickname: string): string {
  return nickname.normalize("NFC").toLowerCase();
}

/**
 * 겹치지 않는 최종 닉네임(명세 7장). 입력 닉네임이 쓰이고 있으면 뒤에 1부터 숫자를 붙이고,
 * 붙일 이름도 쓰이고 있으면 다음 번호로 넘어간다. 예: 냥이 → 냥이, 냥이1, 냥이2.
 * 표기는 입력 그대로 두고 비교만 nicknameKey로 한다. 숫자를 붙여 10자를 넘어도 된다(닉네임 검사는 입력 닉네임에만 한다).
 * 메모리 저장소가 쓰고, Upstash 저장소는 같은 규칙을 등록 Lua 스크립트 안에서 한다(동시 등록에도 번호가 겹치지 않게).
 */
export function numberedNickname(
  nickname: string,
  isTaken: (key: string) => boolean,
): { nickname: string; key: string } {
  const baseKey = nicknameKey(nickname);
  let candidate = nickname;
  let key = baseKey;
  for (let n = 1; isTaken(key); n += 1) {
    candidate = `${nickname}${n}`;
    key = `${baseKey}${n}`;
  }
  return { nickname: candidate, key };
}

/**
 * 등록 완료 화면의 안내: 같은 닉네임이 있어 뒤에 숫자가 붙었으면 문구, 아니면 null(일반 랭킹, 정밀 감정 랭킹 공용).
 * requested는 사용자가 입력한 닉네임(검사를 거친 값), registered는 서버가 돌려준 최종 닉네임이다.
 */
export function renamedNotice(requested: string, registered: string): string | null {
  return registered === requested ? null : `같은 닉네임이 있어 '${registered}'(으)로 등록되었습니다.`;
}
