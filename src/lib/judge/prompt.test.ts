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

  const rules = () => instruction.split("\n규칙\n")[1].split("\n");
  /** 규칙 줄에서 출력 필드 이름이 처음 나오는 규칙 번호 */
  const ruleOf = (field: string) => rules().findIndex((line) => line.includes(`. ${field}`)) + 1;

  it("규칙 9개를 번호 순서대로 담는다", () => {
    expect(rules()).toHaveLength(9);
    rules().forEach((line, index) => expect(line.startsWith(`${index + 1}. `)).toBe(true));
  });

  it("근거 먼저, 판정 나중: 규칙도 받아쓰기 → 근거 → 권역 확률 → 항목 점수 → 모사 의심 순서다", () => {
    const order = ["transcript", "evidence", "regions", "scores", "imitation_suspected"].map(ruleOf);
    expect(order).toEqual([2, 3, 5, 6, 7]);
  });

  it("들린 방언 특징을 근거로 모두 적고 각 특징의 권역(여러 권역 공통이면 common)을 표시하게 한다", () => {
    expect(rules()[2]).toBe(
      "3. evidence를 regions보다 먼저 정한다. 들린 방언 특징을 evidence에 모두 적고, 각 특징의 region에 그 특징이 가리키는 권역을 표시한다. 여러 권역에 공통인 특징이면 region은 common이다. 표준어에 가까운 서울경기 말씨의 특징도 들리면 seoul_gyeonggi로 적는다.",
    );
    expect(rules()[3]).toBe(
      "4. evidence의 question은 그 구절이 나온 문항 번호(1~4)이고, quote는 그 문항의 question_transcripts에 그대로 있는 구절이어야 한다.",
    );
  });

  it("regions는 근거를 종합해 정하고, 근거가 적거나 엇갈리면 한 권역에 몰지 않으며, 1순위가 근거와 어긋나지 않게 한다", () => {
    expect(rules()[4]).toBe(
      "5. regions는 evidence를 모두 적은 다음 그 근거를 종합해 정하는 여섯 권역의 확률이고 합은 100이다. 근거가 적거나 근거가 가리키는 권역이 엇갈리면 확률을 한 권역에 몰지 않는다. regions의 1순위는 common을 뺀 evidence가 가장 많이 가리키는 권역과 어긋나지 않아야 한다.",
    );
  });

  it("scores는 1순위 권역의 특징만으로 매기고, 다른 권역 흉내는 imitation_suspected로 표시하게 한다", () => {
    expect(instruction).toContain(
      "6. scores는 어휘, 어미, 음운, 억양 각각 0~100이고, regions 1순위 권역의 특징이 얼마나 나타나는지로 매긴다. 다른 권역의 특징은 점수에 넣지 않는다.",
    );
    expect(instruction).toContain(
      "7. imitation_suspected는 어휘와 어미가 가리키는 권역과 음운과 억양이 가리키는 권역이 다르면 true, 같으면 false다.",
    );
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

  it("규칙 8은 말소리 없음, 3초 미만, 주변 소음(noisy)일 때 audio_quality만 채우고 나머지는 출력 순서대로 null로 두게 한다", () => {
    expect(rules()[7]).toBe(
      "8. 말소리가 없거나 3초 미만이거나 주변 소음으로 판정할 수 없으면 audio_quality만 채운다. 이때 transcript, question_transcripts, evidence, regions, scores, imitation_suspected는 null로 둔다.",
    );
  });

  it("문항 수가 바뀌면 근거의 문항 번호 범위도 바뀐다", () => {
    expect(buildSystemInstruction(["하나", "둘", "셋"])).toContain("문항 번호(1~3)");
  });
});
