import { describe, expect, it } from "vitest";
import { PART_KEYS } from "./contract";
import { CONCEALMENT_NOTE, OPINIONS } from "./opinions";
import { REGION_NAMES } from "./rules";

const GRADES = [1, 2, 3, 4, 5] as const;
const ALL = GRADES.flatMap((grade) => PART_KEYS.map((part) => OPINIONS[grade][part]));

/** 지역 이름과, 지역을 낮춰 보는 데 흔히 쓰이는 말 */
const BANNED_WORDS = [
  ...Object.values(REGION_NAMES),
  "서울",
  "경기",
  "충북",
  "충남",
  "경북",
  "경남",
  "전북",
  "전남",
  "부산",
  "대구",
  "광주",
  "대전",
  "울산",
  "인천",
  "세종",
  "시골",
  "촌스",
  "투박",
  "억세",
  "교정",
  "심각",
];

describe("OPINIONS: 소견 문구", () => {
  it("5등급 × 4항목으로 20개이고 모두 다르다", () => {
    expect(ALL).toHaveLength(20);
    expect(new Set(ALL).size).toBe(20);
  });

  it("모두 공문서체 '…것으로 사료됨.'으로 끝난다", () => {
    for (const text of ALL) expect(text.endsWith("것으로 사료됨.")).toBe(true);
  });

  it("(2등급, 어미)는 명세 7장 예시 문구다", () => {
    expect(OPINIONS[2].endings).toBe("어미 사용이 현저하여 표준어 전환이 곤란한 것으로 사료됨.");
  });

  it("지역 이름이나 지역을 낮춰 보는 말을 쓰지 않는다(명세 11장)", () => {
    const found = [...ALL, CONCEALMENT_NOTE].flatMap((text) =>
      BANNED_WORDS.filter((word) => text.includes(word)).map((word) => `${word}: ${text}`),
    );
    expect(found).toEqual([]);
  });
});
