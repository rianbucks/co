import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { QuestionItem } from "@/types/screen";
import { SET_A_MODEL_OUTPUT_EXAMPLE, SPEC_MODEL_OUTPUT_EXAMPLE } from "./mock";
import { buildSystemInstruction, findQuestionSet } from "./prompt";

const SET_A = [
  "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
  "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
  "동생이 한겨울에 반팔만 입고 나가려 합니다. 말려 보십시오.",
  "할머니가 차려 주신 밥이 정말 맛있습니다. 할머니께 뭐라고 하시겠습니까?",
];

const SET_B: QuestionItem[] = [
  { id: 1, kind: "convert", target: "고향 친구", situation: "너 어디야? 왜 이렇게 안 와? 언제 올 거야?" },
  { id: 2, kind: "convert", target: "고향 친구", situation: "너 왜 그래? 무슨 일 있어? 괜찮아?" },
  { id: 3, kind: "convert", target: "고향 친구", situation: "뭐라고? 잘 안 들려. 다시 말해 봐." },
  { id: 4, kind: "convert", target: "고향 친구", situation: "아니야, 그게 아니고. 내 말 좀 들어 봐." },
  {
    id: 5,
    kind: "question",
    target: "고향 친구",
    situation: "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
  },
  {
    id: 6,
    kind: "question",
    target: "친구",
    situation: "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
  },
];

/** 문구만으로 상황극 문항을 만든다(종류가 없으면 question). */
const items = (texts: string[]): QuestionItem[] =>
  texts.map((situation, index) => ({ id: index + 1, target: "친구", situation }));

/** docs/SPEC.md 8장에서 heading 바로 아래 문항 표의 행(앞뒤 | 사이의 칸) */
function specTableRows(heading: string): string[][] {
  const spec = readFileSync(fileURLToPath(new URL("../../../docs/SPEC.md", import.meta.url)), "utf8");
  const chapter = spec.slice(spec.indexOf("## 8. 녹음 문항 설계"), spec.indexOf("\n## 9."));
  const start = chapter.indexOf(heading);
  if (start < 0) throw new Error(`명세 8장에 ${heading}이 없다`);
  return chapter
    .slice(start + heading.length)
    .split("\n### ")[0]
    .split("\n")
    .filter((line) => /^\| Q\d \|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

const KIND_NAMES = { convert: "바꿔 말하기", question: "상황 답하기" } as const;

describe("findQuestionSet", () => {
  it("set-a는 이전 구성(상황극 4문항)이다", () => {
    const setA = findQuestionSet("set-a")!;
    expect(setA.map((question) => question.situation)).toEqual(SET_A);
    expect(setA.map((question) => question.kind)).toEqual(["question", "question", "question", "question"]);
  });

  it("set-b는 바꿔 말하기 4문항 다음에 상황극 2문항이다", () => {
    expect(findQuestionSet("set-b")).toEqual(SET_B);
  });

  it("set-b와 set-a가 docs/SPEC.md 8장 문항 표와 같다(명세가 바뀌면 이 테스트가 실패한다)", () => {
    expect(specTableRows("### 기본 구성 (`set-b`)").map((cells) => cells.slice(0, 4))).toEqual(
      SET_B.map((question) => [`Q${question.id}`, KIND_NAMES[question.kind!], question.target, question.situation]),
    );
    expect(specTableRows("### 이전 구성 (`set-a`)").map((cells) => cells.slice(0, 3))).toEqual(
      findQuestionSet("set-a")!.map((question) => [`Q${question.id}`, question.target, question.situation]),
    );
  });

  it.each(["set-c", "", "SET-B", "set-gs", "__proto__", "constructor", "toString"])(
    "등록되지 않은 ID는 null: '%s'",
    (id) => {
      expect(findQuestionSet(id)).toBeNull();
    },
  );
});

describe("buildSystemInstruction: 상황극만 있는 세트(set-a)", () => {
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
    expect(buildSystemInstruction(items(["하나", "둘"]))).toContain("2개의 배열");
  });

  it("규칙 8은 말소리 없음, 3초 미만, 주변 소음(noisy)일 때 audio_quality만 채우고 나머지는 출력 순서대로 null로 두게 한다", () => {
    expect(rules()[7]).toBe(
      "8. 말소리가 없거나 3초 미만이거나 주변 소음으로 판정할 수 없으면 audio_quality만 채운다. 이때 transcript, question_transcripts, evidence, regions, scores, imitation_suspected는 null로 둔다.",
    );
  });

  it("문항 수가 바뀌면 근거의 문항 번호 범위도 바뀐다", () => {
    expect(buildSystemInstruction(items(["하나", "둘", "셋"]))).toContain("문항 번호(1~3)");
  });

  it("문항 목록에 종류를 붙이지 않고 바꿔 말하기 규칙도 넣지 않는다", () => {
    expect(instruction).not.toContain("바꿔 말하기");
    expect(instruction).not.toContain("상황 답하기");
  });
});

describe("buildSystemInstruction: 바꿔 말하기 문항이 섞인 세트(set-b)", () => {
  const instruction = buildSystemInstruction(findQuestionSet("set-b")!);
  const setAInstruction = buildSystemInstruction(findQuestionSet("set-a")!);
  const rulesOf = (text: string) => text.split("\n규칙\n")[1].split("\n");
  const rules = () => rulesOf(instruction);
  const ruleOf = (field: string) => rules().findIndex((line) => line.includes(`. ${field}`)) + 1;

  it("set-a와 같은 첫 두 줄로 시작하고, 문항 목록에 문항 종류를 붙여 6개를 순서대로 담는다", () => {
    expect(instruction.split("\n").slice(0, 2)).toEqual(setAInstruction.split("\n").slice(0, 2));
    expect(instruction).toContain(
      [
        "[문항 목록]",
        "1. (바꿔 말하기) 너 어디야? 왜 이렇게 안 와? 언제 올 거야?",
        "2. (바꿔 말하기) 너 왜 그래? 무슨 일 있어? 괜찮아?",
        "3. (바꿔 말하기) 뭐라고? 잘 안 들려. 다시 말해 봐.",
        "4. (바꿔 말하기) 아니야, 그게 아니고. 내 말 좀 들어 봐.",
        "5. (상황 답하기) 오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
        "6. (상황 답하기) 친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
        "",
        "규칙",
      ].join("\n"),
    );
  });

  it("규칙 3은 바꿔 말하기 규칙이다: 달라진 부분이 근거이고, 그대로 읽었으면 억양과 음운만 근거로 쓴다", () => {
    expect(rules()[2]).toBe(
      "3. 문항 목록의 바꿔 말하기 문항은 화자가 주어진 표준어 문장을 자기 말투로 바꿔 말한 것이다. 주어진 문장과 달라진 부분(어미, 어휘, 발음)이 방언 근거다. 주어진 문장을 그대로 읽었으면 그 문항에서는 억양과 음운만 근거로 쓴다. 상황 답하기 문항은 주어진 상황에 맞게 자유롭게 답한 것이다.",
    );
  });

  it("나머지 규칙은 set-a와 같고(문항 수만 6) 번호만 하나씩 밀린다", () => {
    expect(rules()).toHaveLength(10);
    rules().forEach((line, index) => expect(line.startsWith(`${index + 1}. `)).toBe(true));
    const body = (line: string) => line.replace(/^\d+\. /, "");
    const others = rules().filter((_, index) => index !== 2).map(body);
    expect(others).toEqual(
      rulesOf(setAInstruction)
        .map(body)
        .map((line) => line.replace("4개의 배열", "6개의 배열").replace("문항 번호(1~4)", "문항 번호(1~6)")),
    );
    const order = ["transcript", "evidence", "regions", "scores", "imitation_suspected"].map(ruleOf);
    expect(order).toEqual([2, 4, 6, 7, 8]);
  });

  it("문항 수 6: 문항별 받아쓰기 6개, 근거의 문항 번호 1~6", () => {
    expect(instruction).toContain("같은 방식으로 적은 6개의 배열이다");
    expect(instruction).toContain("문항 번호(1~6)");
  });
});

describe("buildSystemInstruction: 지역별 표현 예시를 넣지 않는다", () => {
  it.each(["set-a", "set-b"])("%s 지시문에는 가짜 출력의 근거 구절도, 인용 부호도 없다", (setId) => {
    const instruction = buildSystemInstruction(findQuestionSet(setId)!);
    for (const item of [...SET_A_MODEL_OUTPUT_EXAMPLE.evidence, ...SPEC_MODEL_OUTPUT_EXAMPLE.evidence]) {
      expect(instruction).not.toContain(item.quote);
    }
    expect(instruction).not.toMatch(/['"‘’“”]/);
  });
});
