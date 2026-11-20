import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { JudgeResult } from "./contract";
import { SPEC_MODEL_OUTPUT_EXAMPLE } from "./mock";
import { parseModelOutput } from "./model-output";
import { buildJudgeResult } from "./postprocess";
import { findQuestionSet } from "./prompt";

const SET_A = findQuestionSet("set-a")!;

describe("가짜 응답(4장 모델 출력 예시)", () => {
  it("문항별 받아쓰기는 set-a 문항 수만큼이고, 이어 붙이면 전체 받아쓰기다", () => {
    expect(SPEC_MODEL_OUTPUT_EXAMPLE.question_transcripts).toHaveLength(SET_A.length);
    expect(SPEC_MODEL_OUTPUT_EXAMPLE.question_transcripts.join(" ")).toBe(SPEC_MODEL_OUTPUT_EXAMPLE.transcript);
  });

  it("근거는 모두 자기 문항의 받아쓰기에 있다", () => {
    for (const item of SPEC_MODEL_OUTPUT_EXAMPLE.evidence) {
      expect(SPEC_MODEL_OUTPUT_EXAMPLE.question_transcripts[item.question - 1]).toContain(item.quote);
    }
  });

  it("mock/judge.json은 가짜 응답을 실제 후처리한 결과와 같다(화면 개발용 예시)", () => {
    const file = fileURLToPath(new URL("../../../mock/judge.json", import.meta.url));
    const sample = JSON.parse(readFileSync(file, "utf8")) as JudgeResult;

    const parsed = parseModelOutput(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE), SET_A.length);
    if (!parsed.ok || parsed.value.audio_quality !== "ok") throw new Error("가짜 응답이 검증을 통과하지 못했다");
    const expected = buildJudgeResult(
      parsed.value,
      { id: sample.id, certificateNo: sample.certificateNo, issuedAt: sample.issuedAt },
      SET_A,
    );
    expect(sample).toEqual(expected);
  });
});
