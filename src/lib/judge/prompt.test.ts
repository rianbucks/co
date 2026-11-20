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
    expect(instruction).toContain(
      "5. evidence의 question은 그 구절이 나온 문항 번호(1~4)이고, quote는 그 문항의 question_transcripts에 그대로 있는 구절이어야 한다.",
    );
    expect(instruction).toContain("transcript, question_transcripts, regions, scores, evidence는 null로 둔다.");
  });

  it("문항별 받아쓰기를 문항 수만큼 요구하고, 문항 사이에 쉬는 구간이 없을 수 있다고 알린다", () => {
    expect(instruction).toContain(
      "question_transcripts는 문항 순서대로 각 문항의 답을 같은 방식으로 적은 4개의 배열이다. 답하지 않은 문항은 빈 문자열로 둔다.",
    );
    expect(instruction).toContain(
      "녹음은 문항 순서대로 이어 붙인 것이고 문항 사이에 쉬는 구간이 없을 수 있다. 문항 경계가 불확실하면 내용으로 판단한다.",
    );
    expect(buildSystemInstruction(["하나", "둘"])).toContain("2개의 배열");
  });

  it("규칙 6은 말소리 없음, 3초 미만, 주변 소음(noisy)일 때 audio_quality만 채우게 한다", () => {
    expect(instruction).toContain(
      "6. 말소리가 없거나 3초 미만이거나 주변 소음으로 판정할 수 없으면 audio_quality만 채운다.",
    );
  });
});
