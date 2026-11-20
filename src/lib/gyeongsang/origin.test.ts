import { describe, expect, it } from "vitest";
import {
  ORIGIN_KEYS,
  ORIGIN_MATCH_LABEL,
  ORIGIN_MISMATCH_LABEL,
  ORIGIN_NAMES,
  ORIGIN_SUBREGION,
  isOriginKey,
  judgeOriginMatch,
  type OriginKey,
} from "./origin";

describe("신고 원산지", () => {
  it("대구, 경북, 부산, 울산, 경남 다섯 곳을 이 순서로 고른다", () => {
    expect(ORIGIN_KEYS.map((key) => ORIGIN_NAMES[key])).toEqual(["대구", "경북", "부산", "울산", "경남"]);
  });

  it("대구와 경북은 경북권, 부산, 울산, 경남은 경남권이다", () => {
    expect(ORIGIN_SUBREGION).toEqual({
      daegu: "gyeongbuk",
      gyeongbuk: "gyeongbuk",
      busan: "gyeongnam",
      ulsan: "gyeongnam",
      gyeongnam: "gyeongnam",
    });
  });

  it.each([...ORIGIN_KEYS])("'%s'는 신고 원산지다", (key) => {
    expect(isOriginKey(key)).toBe(true);
  });

  it.each(["", "seoul", "대구", "DAEGU", "__proto__", "toString", null, undefined, 1])(
    "'%s'는 신고 원산지가 아니다",
    (value) => {
      expect(isOriginKey(value)).toBe(false);
    },
  );
});

describe("judgeOriginMatch", () => {
  it.each<[OriginKey, number, boolean]>([
    ["daegu", 64, true],
    ["daegu", 50, true],
    ["daegu", 49, false],
    ["gyeongbuk", 100, true],
    ["gyeongbuk", 0, false],
  ])("대구나 경북 신고(%s)는 경북권이 50 이상이면 일치: 경북권 %i → %s", (origin, gyeongbuk, matched) => {
    const result = judgeOriginMatch(origin, { gyeongbuk, gyeongnam: 100 - gyeongbuk });
    expect(result).toEqual({
      matched,
      label: matched ? "원산지 일치" : "원산지 불일치, 재심 권고",
      subregion: "gyeongbuk",
      ratio: gyeongbuk,
    });
  });

  it.each<[OriginKey, number, boolean]>([
    ["busan", 64, false],
    ["busan", 36, true],
    ["ulsan", 50, true],
    ["ulsan", 51, false],
    ["gyeongnam", 0, true],
    ["gyeongnam", 100, false],
  ])("부산, 울산, 경남 신고(%s)는 경남권이 50 이상이면 일치: 경북권 %i → %s", (origin, gyeongbuk, matched) => {
    const result = judgeOriginMatch(origin, { gyeongbuk, gyeongnam: 100 - gyeongbuk });
    expect(result).toEqual({
      matched,
      label: matched ? ORIGIN_MATCH_LABEL : ORIGIN_MISMATCH_LABEL,
      subregion: "gyeongnam",
      ratio: 100 - gyeongbuk,
    });
  });

  it("두 성분이 50씩이면 어느 원산지를 신고해도 일치다", () => {
    for (const origin of ORIGIN_KEYS) {
      expect(judgeOriginMatch(origin, { gyeongbuk: 50, gyeongnam: 50 }).matched).toBe(true);
    }
  });

  it("문구는 '원산지 일치'와 '원산지 불일치, 재심 권고'다", () => {
    expect(ORIGIN_MATCH_LABEL).toBe("원산지 일치");
    expect(ORIGIN_MISMATCH_LABEL).toBe("원산지 불일치, 재심 권고");
  });
});
