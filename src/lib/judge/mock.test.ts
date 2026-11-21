import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AiRequest } from "./ai-client";
import type { JudgeResult } from "./contract";
import { MOCK_MODEL_OUTPUTS, SET_A_MODEL_OUTPUT_EXAMPLE, SPEC_MODEL_OUTPUT_EXAMPLE, mockAiClientFor } from "./mock";
import { parseModelOutput } from "./model-output";
import { buildJudgeResult } from "./postprocess";
import { DEFAULT_QUESTION_SET_ID, GENERAL_QUESTION_SET_IDS, findQuestionSet } from "./questions";

const SET_B = findQuestionSet("set-b")!;
const request = {} as AiRequest;

describe("가짜 응답: 세트별 가짜 출력", () => {
  it("4장 모델 출력 예시는 기본 세트(set-b)의 가짜 출력이고, set-a는 이전 구성의 가짜 출력이다", () => {
    expect(DEFAULT_QUESTION_SET_ID).toBe("set-b");
    expect(MOCK_MODEL_OUTPUTS["set-b"]).toBe(SPEC_MODEL_OUTPUT_EXAMPLE);
    expect(MOCK_MODEL_OUTPUTS["set-a"]).toBe(SET_A_MODEL_OUTPUT_EXAMPLE);
    expect(Object.keys(MOCK_MODEL_OUTPUTS)).toEqual(GENERAL_QUESTION_SET_IDS);
  });

  it.each(GENERAL_QUESTION_SET_IDS)(
    "%s: 문항별 받아쓰기는 문항 수만큼이고, 이어 붙이면 전체 받아쓰기이며, 근거는 모두 자기 문항의 받아쓰기에 있다",
    (setId) => {
      const output = MOCK_MODEL_OUTPUTS[setId];
      expect(output.question_transcripts).toHaveLength(findQuestionSet(setId)!.length);
      expect(output.question_transcripts.join(" ")).toBe(output.transcript);
      for (const item of output.evidence) {
        expect(output.question_transcripts[item.question - 1]).toContain(item.quote);
      }
    },
  );

  it("set-b의 바꿔 말하기 문항마다 주어진 문장과 달라진 부분을 근거로 든다", () => {
    SET_B.forEach((question, index) => {
      if (question.kind !== "convert") return;
      const items = SPEC_MODEL_OUTPUT_EXAMPLE.evidence.filter((item) => item.question === index + 1);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(question.situation).not.toContain(item.quote);
    });
  });

  it("가짜 클라이언트는 요청한 세트의 출력을 돌려주고, 모르는 세트면 기본 세트(set-b)다", async () => {
    for (const setId of GENERAL_QUESTION_SET_IDS) {
      expect(JSON.parse(await mockAiClientFor(setId).generate(request))).toEqual(MOCK_MODEL_OUTPUTS[setId]);
    }
    for (const unknown of ["set-z", null, undefined, 3]) {
      expect(JSON.parse(await mockAiClientFor(unknown).generate(request))).toEqual(SPEC_MODEL_OUTPUT_EXAMPLE);
    }
  });

  it("mock/judge.json은 기본 세트(set-b)의 가짜 응답을 실제 후처리한 결과와 같다(화면 개발용 예시)", () => {
    const file = fileURLToPath(new URL("../../../mock/judge.json", import.meta.url));
    const sample = JSON.parse(readFileSync(file, "utf8")) as JudgeResult;

    const parsed = parseModelOutput(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE), SET_B.length);
    if (!parsed.ok || parsed.value.audio_quality !== "ok") throw new Error("가짜 응답이 검증을 통과하지 못했다");
    const expected = buildJudgeResult(
      parsed.value,
      { id: sample.id, certificateNo: sample.certificateNo, issuedAt: sample.issuedAt },
      SET_B,
    );
    expect(sample).toEqual(expected);
    expect(sample.segments).toHaveLength(6);
  });
});
