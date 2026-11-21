import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_QUESTION_SET_ID,
  GENERAL_QUESTION_SETS,
  GENERAL_QUESTION_SET_ID,
  GENERAL_QUESTION_SET_IDS,
  GENERAL_QUESTIONS,
  SECONDS_PER_QUESTION,
  convertTarget,
  countQuestionKinds,
  findQuestionSet,
  hasConvertQuestions,
  isGeneralQuestionSetId,
  questionKind,
  questionText,
  recordingSeconds,
  resolveGeneralQuestionSetId,
} from "./questions";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("일반 감정 문항 세트", () => {
  it("set-a와 set-b가 있고 기본 세트는 set-b다", () => {
    expect(GENERAL_QUESTION_SET_IDS).toEqual(["set-a", "set-b"]);
    expect(DEFAULT_QUESTION_SET_ID).toBe("set-b");
  });

  it.each(GENERAL_QUESTION_SET_IDS)("%s: 문항 번호는 1부터 차례대로이고 모든 문항에 종류가 있다", (setId) => {
    const questions = GENERAL_QUESTION_SETS[setId];
    expect(questions.map((question) => question.id)).toEqual(questions.map((_, index) => index + 1));
    for (const question of questions) expect(question.kind).toBeDefined();
  });

  it("set-b는 6문항 60초: 바꿔 말하기 4문항(고향 친구) 다음에 상황극 2문항", () => {
    const setB = findQuestionSet("set-b")!;
    expect(setB.map(questionKind)).toEqual(["convert", "convert", "convert", "convert", "question", "question"]);
    expect(countQuestionKinds(setB)).toEqual({ question: 2, convert: 4 });
    expect(convertTarget(setB)).toBe("고향 친구");
    expect(hasConvertQuestions(setB)).toBe(true);
    expect(recordingSeconds(setB)).toBe(60);
    expect(SECONDS_PER_QUESTION).toBe(10);
  });

  it("set-a는 4문항 40초 상황극만 있다", () => {
    const setA = findQuestionSet("set-a")!;
    expect(countQuestionKinds(setA)).toEqual({ question: 4, convert: 0 });
    expect(convertTarget(setA)).toBeNull();
    expect(hasConvertQuestions(setA)).toBe(false);
    expect(recordingSeconds(setA)).toBe(40);
  });

  it("종류가 없는 문항은 상황극(question)이다", () => {
    expect(questionKind({})).toBe("question");
    expect(hasConvertQuestions([{ id: 1, target: "친구", situation: "상황" }])).toBe(false);
  });

  it.each(["set-gs", "set-c", "", "SET-B", "__proto__", "toString", null, undefined, 1])(
    "등록되지 않은 값은 일반 감정 세트가 아니다: %s",
    (value) => {
      expect(isGeneralQuestionSetId(value)).toBe(false);
    },
  );
});

describe("questionText: 지시문과 문항별 받아쓰기에 쓰는 문항 문구", () => {
  it("일반 감정 문항(set-a, set-b)은 상황 문구 그대로다", () => {
    for (const setId of GENERAL_QUESTION_SET_IDS) {
      for (const question of GENERAL_QUESTION_SETS[setId]) expect(questionText(question)).toBe(question.situation);
    }
  });

  it("인용과 요청 문구가 있으면 상황 문구, 따옴표로 감싼 인용, 요청 문구 순서로 잇는다", () => {
    expect(
      questionText({ situation: "친구가 이렇게 말합니다.", quote: { label: "흉내", text: "뭐 하노?" }, followUp: "고쳐 말해 주십시오." }),
    ).toBe('친구가 이렇게 말합니다. "뭐 하노?" 고쳐 말해 주십시오.');
  });
});

describe("NEXT_PUBLIC_QUESTION_SET", () => {
  it.each([
    [undefined, "set-b"],
    ["", "set-b"],
    ["set-b", "set-b"],
    ["set-a", "set-a"],
    [" set-a ", "set-a"],
    ["set-gs", "set-b"],
    ["SET-A", "set-b"],
  ])("값이 %j면 %s", (value, expected) => {
    expect(resolveGeneralQuestionSetId(value)).toBe(expected);
  });

  it("설정하지 않으면 화면은 set-b를 녹음한다", () => {
    expect(GENERAL_QUESTION_SET_ID).toBe("set-b");
    expect(GENERAL_QUESTIONS).toBe(GENERAL_QUESTION_SETS["set-b"]);
  });

  it("set-a로 두면 화면이 set-a(4문항)로 되돌아간다", async () => {
    vi.stubEnv("NEXT_PUBLIC_QUESTION_SET", "set-a");
    vi.resetModules();
    const reloaded = await import("./questions");
    expect(reloaded.GENERAL_QUESTION_SET_ID).toBe("set-a");
    expect(reloaded.GENERAL_QUESTIONS).toHaveLength(4);
  });
});
