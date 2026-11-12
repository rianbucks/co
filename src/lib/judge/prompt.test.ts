import { describe, expect, it } from "vitest";
import { buildSystemInstruction, findQuestionSet } from "./prompt";

describe("findQuestionSet", () => {
  it("set-a는 명세 8장 Q1~Q4다", () => {
    expect(findQuestionSet("set-a")).toEqual([
      '다음 문장을 친구에게 평소 말투로 말해 주십시오: "너 지금 뭐 하고 있어? 밥은 먹었어?"',
      '다음 문장을 친구에게 평소 말투로 말해 주십시오: "그거 내가 했다고 했잖아. 왜 자꾸 물어봐."',
      "친구가 약속에 한 시간 늦었습니다. 뭐라고 하시겠습니까?",
      "부추, 옥수수, 가위를 고향에서는 뭐라고 부릅니까? 문장으로 답해 주십시오.",
    ]);
  });

  it.each(["set-b", "", "SET-A", "__proto__", "constructor"])("등록되지 않은 ID는 null: '%s'", (id) => {
    expect(findQuestionSet(id)).toBeNull();
  });
});

describe("buildSystemInstruction", () => {
  const instruction = buildSystemInstruction(findQuestionSet("set-a")!);

  it("명세 4장 초안의 첫 문장으로 시작하고 문항에 번호를 붙인다", () => {
    expect(instruction.startsWith("너는 한국어 방언 감정위원이다.")).toBe(true);
    expect(instruction).toContain(
      '[문항 목록]\n1. 다음 문장을 친구에게 평소 말투로 말해 주십시오: "너 지금 뭐 하고 있어? 밥은 먹었어?"',
    );
    expect(instruction).toContain("\n4. 부추, 옥수수, 가위를 고향에서는");
  });

  it("규칙 7개를 모두 담는다", () => {
    const rules = instruction.split("\n규칙\n")[1].split("\n");
    expect(rules).toHaveLength(7);
    rules.forEach((line, index) => expect(line.startsWith(`${index + 1}. `)).toBe(true));
    expect(instruction).toContain("evidence의 quote는 transcript에 그대로 있는 구절이어야 한다.");
    expect(instruction).toContain("transcript, regions, scores, evidence는 null로 둔다.");
  });
});
