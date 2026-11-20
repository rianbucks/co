import { describe, expect, it } from "vitest";
import { SPEC_MODEL_OUTPUT_EXAMPLE } from "../judge/mock";
import { buildSystemInstruction, findQuestionSet } from "../judge/prompt";
import { GS_MOCK_MODEL_OUTPUT } from "./mock";
import { buildGsSystemInstruction } from "./prompt";
import { GS_QUESTIONS, GS_QUESTION_SET_ID, GS_QUESTION_TEXTS } from "./questions";

const instruction = buildGsSystemInstruction(GS_QUESTION_TEXTS);
const rules = () => instruction.split("\n규칙\n")[1].split("\n");

describe("set-gs 문항", () => {
  it("문항은 4개이고 번호는 1~4다. 지시문에 쓰는 문구는 화면 문구(situation) 그대로다", () => {
    expect(GS_QUESTION_SET_ID).toBe("set-gs");
    expect(GS_QUESTIONS.map((question) => question.id)).toEqual([1, 2, 3, 4]);
    expect(GS_QUESTION_TEXTS).toEqual(GS_QUESTIONS.map((question) => question.situation));
    for (const question of GS_QUESTIONS) {
      expect(question.target.length).toBeGreaterThan(0);
      expect(question.situation.length).toBeGreaterThan(0);
    }
  });

  it("일반 감정의 문항 세트에는 등록하지 않는다(set-a 경로는 그대로다)", () => {
    expect(findQuestionSet(GS_QUESTION_SET_ID)).toBeNull();
  });
});

describe("buildGsSystemInstruction", () => {
  it("경상 방언 정밀 감정위원으로 시작하고 문항에 순서대로 번호를 붙인다", () => {
    expect(instruction.startsWith("너는 경상 방언 정밀 감정위원이다.")).toBe(true);
    expect(instruction).toContain(
      ["[문항 목록]", ...GS_QUESTION_TEXTS.map((text, index) => `${index + 1}. ${text}`), "", "규칙"].join("\n"),
    );
  });

  it("규칙 8개를 번호 순서대로 담는다", () => {
    expect(rules()).toHaveLength(8);
    rules().forEach((line, index) => expect(line.startsWith(`${index + 1}. `)).toBe(true));
  });

  it("들린 것만 근거로 쓰고 미리 아는 표현 목록에 맞추지 않게 한다", () => {
    expect(rules()[0]).toBe(
      "1. 실제로 들린 것만 근거로 쓴다. 들리지 않은 표현을 지어내지 않는다. 미리 아는 표현 목록에 맞추지 말고 이 녹음에서 들린 어휘, 어미, 음운, 억양으로만 판단한다.",
    );
  });

  it("경상 방언으로 보기 어려우면 not_gyeongsang을 true로 하고 성분, 점수, 근거를 비우게 한다", () => {
    expect(rules()[2]).toBe(
      "3. not_gyeongsang은 경상 방언의 특징이 들리지 않거나 다른 지역 방언으로 들려 경상 방언으로 보기 어려우면 true, 경상 방언의 특징이 들리면 false다. true면 subregions, scores, evidence는 null로 둔다.",
    );
  });

  it("성분은 경북권(대구·경북)과 경남권(부산·울산·경남)의 비율이고 합은 100이다", () => {
    expect(rules()[3]).toBe(
      "4. subregions는 들린 경상 방언의 특징이 경북권(대구·경북)과 경남권(부산·울산·경남) 중 어느 쪽에 가까운지의 비율이고 합은 100이다.",
    );
  });

  it("항목 점수는 경상 방언 특징 기준이고, 근거는 문항 번호, 그 문항 받아쓰기의 구절, 설명이다", () => {
    expect(rules()[4]).toContain("경상 방언의 특징이 얼마나 나타나는지로 매긴다");
    expect(rules()[5]).toContain("evidence의 question은 그 구절이 나온 문항 번호(1~4)");
    expect(rules()[5]).toContain("quote는 그 문항의 question_transcripts에 그대로 있는 구절이어야 한다");
  });

  it("특정 방언 표현의 목록이나 예시를 넣지 않는다(인용 부호도 없다)", () => {
    const examples = [
      ...GS_MOCK_MODEL_OUTPUT.evidence.map((item) => item.quote),
      ...SPEC_MODEL_OUTPUT_EXAMPLE.evidence.map((item) => item.quote),
      "억수로",
      "쪼매",
      "머라카노",
      "아이가",
      "-노",
      "-나",
      "-고",
      "-데이",
      "-예",
      "-니더",
      "-니껴",
      "-능교",
      "-심더",
      "-이소",
      "-제",
      "가가",
    ];
    for (const example of examples) {
      expect(instruction).not.toContain(example);
    }
    expect(instruction).not.toMatch(/['"‘’“”]/);
  });

  it("문항 수가 바뀌면 받아쓰기 개수와 문항 번호 범위도 바뀐다", () => {
    const three = buildGsSystemInstruction(GS_QUESTION_TEXTS.slice(0, 3));
    expect(three).toContain("같은 방식으로 적은 3개의 배열이다");
    expect(three).toContain("문항 번호(1~3)");
  });

  it("일반 감정 지시문과 다르다(일반 감정 지시문은 그대로다)", () => {
    expect(instruction).not.toBe(buildSystemInstruction(findQuestionSet("set-a")!));
    expect(buildSystemInstruction(findQuestionSet("set-a")!).startsWith("너는 한국어 방언 감정위원이다.")).toBe(true);
  });
});
