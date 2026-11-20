import { describe, expect, it } from "vitest";
import { splitHighlights } from "./highlight";

const joined = (parts: ReturnType<typeof splitHighlights>) => parts.map((part) => part.text).join("");

describe("splitHighlights", () => {
  it("인용 구절을 강조 구간으로 나누고 나머지는 그대로 둔다", () => {
    expect(splitHighlights("어, 니가 웬일이고? 억수로 오랜만이네", ["억수로"])).toEqual([
      { text: "어, 니가 웬일이고? ", highlighted: false },
      { text: "억수로", highlighted: true },
      { text: " 오랜만이네", highlighted: false },
    ]);
  });

  it("인용이 여러 개면 받아쓰기 순서대로 강조한다(인용 순서와 상관없다)", () => {
    expect(splitHighlights("어, 니가 웬일이고? 억수로 오랜만이네", ["억수로", "웬일이고"])).toEqual([
      { text: "어, 니가 ", highlighted: false },
      { text: "웬일이고", highlighted: true },
      { text: "? ", highlighted: false },
      { text: "억수로", highlighted: true },
      { text: " 오랜만이네", highlighted: false },
    ]);
  });

  it("겹치거나 맞닿은 구간은 하나로 합친다", () => {
    expect(splitHighlights("퍼뜩 안 오고 뭐 했노", ["뭐 했노", "했노"])).toEqual([
      { text: "퍼뜩 안 오고 ", highlighted: false },
      { text: "뭐 했노", highlighted: true },
    ]);
    expect(splitHighlights("가나다라", ["가나", "다라"])).toEqual([{ text: "가나다라", highlighted: true }]);
  });

  it("같은 구절이 여러 번 나오면 모두 강조한다", () => {
    expect(splitHighlights("마 마 마", ["마"]).filter((part) => part.highlighted)).toHaveLength(3);
  });

  it("빈 인용은 무시하고, 없는 인용이면 강조하지 않는다", () => {
    expect(splitHighlights("그래 입고 나가모", ["", "묵을게예"])).toEqual([
      { text: "그래 입고 나가모", highlighted: false },
    ]);
    expect(splitHighlights("", ["억수로"])).toEqual([]);
  });

  it("나눈 조각을 이으면 원래 받아쓰기와 같다", () => {
    const text = "할매 이거 진짜 맛있네예, 한 그릇 더 묵을게예";
    expect(joined(splitHighlights(text, ["묵을게예", "맛있네예", "진짜", "없는 말"]))).toBe(text);
  });
});
