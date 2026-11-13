import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSystemInstruction, findQuestionSet } from "./prompt";

const SET_A = [
  "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
  "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
  "동생이 한겨울에 반팔만 입고 나가려 합니다. 말려 보십시오.",
  "할머니가 차려 주신 밥이 정말 맛있습니다. 할머니께 뭐라고 하시겠습니까?",
];

/** docs/SPEC.md 8장 문항 표의 '화면 문구' 열 */
function specScreenTexts(): string[] {
  const spec = readFileSync(fileURLToPath(new URL("../../../docs/SPEC.md", import.meta.url)), "utf8");
  const start = spec.indexOf("## 8. 녹음 문항 설계");
  const end = spec.indexOf("\n## 9.", start);
  return spec
    .slice(start, end)
    .split("\n")
    .filter((line) => /^\| Q\d \|/.test(line))
    .map((line) => line.split("|")[3].trim());
}

describe("findQuestionSet", () => {
  it("set-a는 명세 8장 Q1~Q4 화면 문구다", () => {
    expect(findQuestionSet("set-a")).toEqual(SET_A);
  });

  it("set-a가 docs/SPEC.md 8장 문항 표와 같다(명세가 바뀌면 이 테스트가 실패한다)", () => {
    expect(findQuestionSet("set-a")).toEqual(specScreenTexts());
  });

  it.each(["set-b", "", "SET-A", "__proto__", "constructor"])("등록되지 않은 ID는 null: '%s'", (id) => {
    expect(findQuestionSet(id)).toBeNull();
  });
});

describe("buildSystemInstruction", () => {
  const instruction = buildSystemInstruction(findQuestionSet("set-a")!);

  it("명세 4장 초안의 첫 문장으로 시작하고 문항 4개에 순서대로 번호를 붙인다", () => {
    expect(instruction.startsWith("너는 한국어 방언 감정위원이다.")).toBe(true);
    expect(instruction).toContain(
      [
        "[문항 목록]",
        "1. 오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
        "2. 친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
        "3. 동생이 한겨울에 반팔만 입고 나가려 합니다. 말려 보십시오.",
        "4. 할머니가 차려 주신 밥이 정말 맛있습니다. 할머니께 뭐라고 하시겠습니까?",
        "",
        "규칙",
      ].join("\n"),
    );
  });

  it("규칙 7개를 모두 담는다", () => {
    const rules = instruction.split("\n규칙\n")[1].split("\n");
    expect(rules).toHaveLength(7);
    rules.forEach((line, index) => expect(line.startsWith(`${index + 1}. `)).toBe(true));
    expect(instruction).toContain("evidence의 quote는 transcript에 그대로 있는 구절이어야 한다.");
    expect(instruction).toContain("transcript, regions, scores, evidence는 null로 둔다.");
  });
});
