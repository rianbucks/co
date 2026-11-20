import { describe, expect, it } from "vitest";
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, checkNickname } from "./nickname";

describe("checkNickname", () => {
  it("2~10자", () => {
    expect(NICKNAME_MIN_LENGTH).toBe(2);
    expect(NICKNAME_MAX_LENGTH).toBe(10);
  });

  it.each(["경상도", "ab", "Dialect99", "부산갈매기2026", "가나다라마바사아자차", "ㅋㅋ", "ㅏㅑ"])(
    "한글, 영문, 숫자만 있으면 받는다: %s",
    (nickname) => {
      expect(checkNickname(nickname)).toEqual({ ok: true, value: nickname });
    },
  );

  it("앞뒤 공백은 떼고 받는다", () => {
    expect(checkNickname("  경상도  ")).toEqual({ ok: true, value: "경상도" });
  });

  it("자모가 분리된 입력(NFD)은 완성형으로 맞춰 받는다", () => {
    const decomposed = "한글".normalize("NFD");
    expect(decomposed).not.toBe("한글");
    expect(checkNickname(decomposed)).toEqual({ ok: true, value: "한글" });
  });

  it.each(["가", "a", "", "   ", "가나다라마바사아자차카", "12345678901"])(
    "2자 미만이나 10자 초과는 length: %j",
    (nickname) => {
      expect(checkNickname(nickname)).toEqual({ ok: false, problem: "length" });
    },
  );

  it.each(["홍 길동", "nick_name", "닉네임!", "😀😀", "ニック", "a.b", "<b>xx</b>", "가\n나"])(
    "띄어쓰기, 기호, 이모지, 다른 문자는 characters: %j",
    (nickname) => {
      expect(checkNickname(nickname)).toEqual({ ok: false, problem: "characters" });
    },
  );

  it("문자열이 아니면 받지 않는다", () => {
    expect(checkNickname(123)).toEqual({ ok: false, problem: "characters" });
    expect(checkNickname(null)).toEqual({ ok: false, problem: "characters" });
  });
});
