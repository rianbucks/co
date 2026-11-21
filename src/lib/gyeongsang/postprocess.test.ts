import { describe, expect, it } from "vitest";
import type { GyeongsangResult } from "./contract";
import { GS_MOCK_MODEL_OUTPUT } from "./mock";
import { parseGsModelOutput, type GsAcceptedOutput } from "./model-output";
import { buildGyeongsangResult, normalizeSubregions, verifyGsEvidence } from "./postprocess";
import { GS_QUESTIONS, GS_QUESTION_TEXTS } from "./questions";

const ISSUE = { id: "g_000000000001", certificateNo: "제2026-경상-000001호", issuedAt: "2026-11-20T14:03:00+09:00" };

function acceptedMock(): GsAcceptedOutput {
  const parsed = parseGsModelOutput(JSON.stringify(GS_MOCK_MODEL_OUTPUT), GS_QUESTIONS.length);
  if (!parsed.ok || parsed.value.audio_quality !== "ok" || parsed.value.not_gyeongsang) {
    throw new Error("가짜 출력이 검증을 통과하지 못했다");
  }
  return parsed.value;
}

describe("normalizeSubregions", () => {
  it("합이 100이면 그대로 둔다", () => {
    expect(normalizeSubregions({ gyeongbuk: 64, gyeongnam: 36 })).toEqual({ gyeongbuk: 64, gyeongnam: 36 });
    expect(normalizeSubregions({ gyeongbuk: 0, gyeongnam: 100 })).toEqual({ gyeongbuk: 0, gyeongnam: 100 });
  });

  it("합이 100이 아니면 비율대로 나누고 최대 잔여법으로 합 100을 맞춘다", () => {
    expect(normalizeSubregions({ gyeongbuk: 1, gyeongnam: 1 })).toEqual({ gyeongbuk: 50, gyeongnam: 50 });
    expect(normalizeSubregions({ gyeongbuk: 1, gyeongnam: 2 })).toEqual({ gyeongbuk: 33, gyeongnam: 67 });
    expect(normalizeSubregions({ gyeongbuk: 2, gyeongnam: 1 })).toEqual({ gyeongbuk: 67, gyeongnam: 33 });
    expect(normalizeSubregions({ gyeongbuk: 70, gyeongnam: 70 })).toEqual({ gyeongbuk: 50, gyeongnam: 50 });
    expect(normalizeSubregions({ gyeongbuk: 90, gyeongnam: 30 })).toEqual({ gyeongbuk: 75, gyeongnam: 25 });
  });

  it("나머지가 같으면 경북권에 1을 더 준다", () => {
    // 1/40 → 2.5, 39/40 → 97.5: 나머지가 같고 1이 남는다.
    expect(normalizeSubregions({ gyeongbuk: 1, gyeongnam: 39 })).toEqual({ gyeongbuk: 3, gyeongnam: 97 });
  });

  it("합이 0이면 null", () => {
    expect(normalizeSubregions({ gyeongbuk: 0, gyeongnam: 0 })).toBeNull();
  });

  it.each([
    { gyeongbuk: -1, gyeongnam: 50 },
    { gyeongbuk: 50.5, gyeongnam: 49.5 },
  ])("0 이상의 정수가 아니면 RangeError: %o", (raw) => {
    expect(() => normalizeSubregions(raw)).toThrow(RangeError);
  });
});

describe("verifyGsEvidence", () => {
  const questionTranscripts = ["니 어데 가노", "밥 묵었나"];
  const transcript = questionTranscripts.join(" ");

  it("문항별 받아쓰기가 있으면 그 문항의 받아쓰기에 있는 인용만 남긴다", () => {
    const evidence = [
      { question: 1, quote: "어데 가노", note: "그 문항에 있음" },
      { question: 2, quote: "어데 가노", note: "다른 문항에 있음" },
      { question: 2, quote: "묵었나", note: "그 문항에 있음" },
      { question: 1, quote: "억수로", note: "어디에도 없음" },
    ];
    expect(verifyGsEvidence(evidence, transcript, questionTranscripts)).toEqual([
      { question: 1, quote: "어데 가노", note: "그 문항에 있음" },
      { question: 2, quote: "묵었나", note: "그 문항에 있음" },
    ]);
  });

  it("문항별 받아쓰기가 있는데 문항 번호가 없거나 범위를 벗어나면 버린다", () => {
    const evidence = [
      { question: null, quote: "가노", note: "번호 없음" },
      { question: 3, quote: "가노", note: "범위 밖" },
      { question: 0, quote: "가노", note: "범위 밖" },
    ];
    expect(verifyGsEvidence(evidence, transcript, questionTranscripts)).toEqual([]);
  });

  it("문항별 받아쓰기가 없으면 전체 받아쓰기로 검증하고 문항 번호는 null로 둔다", () => {
    const evidence = [
      { question: 2, quote: "어데 가노", note: "있음" },
      { question: null, quote: "없는 말", note: "없음" },
    ];
    expect(verifyGsEvidence(evidence, transcript, null)).toEqual([
      { question: null, quote: "어데 가노", note: "있음" },
    ]);
  });

  it("인용의 공백을 정리해 비교하고, 빈 인용은 버린다", () => {
    const evidence = [
      { question: 1, quote: "  어데   가노 ", note: "공백" },
      { question: 1, quote: "   ", note: "빈 인용" },
    ];
    expect(verifyGsEvidence(evidence, transcript, ["니  어데\n가노", "밥 묵었나"])).toEqual([
      { question: 1, quote: "어데 가노", note: "공백" },
    ]);
  });
});

describe("buildGyeongsangResult", () => {
  it("가짜 출력으로 정밀 감정 결과를 만든다: 성분, 농도(가중치와 등급표는 일반 감정과 같다), 근거, 문항별 받아쓰기", () => {
    const expected: GyeongsangResult = {
      ...ISSUE,
      subregions: { gyeongbuk: 64, gyeongnam: 36 },
      // 55×0.15 + 80×0.2 + 65×0.25 + 70×0.4 = 68.5 → 69
      intensity: {
        score: 69,
        grade: 4,
        gradeName: "지역 말투가 뚜렷하게 들려요",
        parts: { vocabulary: 55, endings: 80, phonology: 65, intonation: 70 },
      },
      evidence: GS_MOCK_MODEL_OUTPUT.evidence.map((item) => ({ ...item })),
      transcript: GS_MOCK_MODEL_OUTPUT.transcript,
      segments: GS_QUESTIONS.map((question, index) => ({
        question: index + 1,
        kind: question.kind!,
        prompt: GS_QUESTION_TEXTS[index],
        transcript: GS_MOCK_MODEL_OUTPUT.question_transcripts[index],
      })),
    };
    const result = buildGyeongsangResult(acceptedMock(), ISSUE, GS_QUESTIONS);
    expect(result).toEqual(expected);
    // 6문항: 바꿔 말하기 4개 다음에 상황 질문 2개. 5번 문구에는 흉내 문장이 따옴표로 들어간다.
    expect(result.segments.map((segment) => segment.kind)).toEqual([
      "convert",
      "convert",
      "convert",
      "convert",
      "question",
      "question",
    ]);
    expect(result.segments[4].prompt).toContain('"니 지금 뭐 하나? 내랑 같이 밥 먹으러 가노?"');
  });

  it("성분 비율의 합을 100으로 맞추고, 받아쓰기에 없는 인용은 버린다", () => {
    const output: GsAcceptedOutput = {
      ...acceptedMock(),
      subregions: { gyeongbuk: 30, gyeongnam: 90 },
      evidence: [
        { question: 6, quote: "주이소", note: "있음" },
        { question: 6, quote: "주이소예", note: "없음" },
        { question: 5, quote: "뭐 하나", note: "5번 흉내 문장에만 있고 화자의 말에는 없다" },
      ],
    };
    const result = buildGyeongsangResult(output, ISSUE, GS_QUESTIONS);
    expect(result.subregions).toEqual({ gyeongbuk: 25, gyeongnam: 75 });
    expect(result.evidence).toEqual([{ question: 6, quote: "주이소", note: "있음" }]);
  });

  it("문항별 받아쓰기가 없으면 segments는 빈 배열이고 근거는 전체 받아쓰기로 검증한다", () => {
    const output: GsAcceptedOutput = { ...acceptedMock(), question_transcripts: null };
    const result = buildGyeongsangResult(output, ISSUE, GS_QUESTIONS);
    expect(result.segments).toEqual([]);
    expect(result.evidence).toHaveLength(GS_MOCK_MODEL_OUTPUT.evidence.length);
    expect(result.evidence.every((item) => item.question === null)).toBe(true);
  });

  it("표준어와 차이가 없으면 농도 0, 1등급이다", () => {
    const output: GsAcceptedOutput = {
      ...acceptedMock(),
      scores: { vocabulary: 0, endings: 0, phonology: 0, intonation: 0 },
    };
    expect(buildGyeongsangResult(output, ISSUE, GS_QUESTIONS).intensity).toMatchObject({
      score: 0,
      grade: 1,
      gradeName: "지역 말투가 거의 드러나지 않아요",
    });
  });

  it("성분 비율 합이 0이면 RangeError(검증에서 걸러졌어야 한다)", () => {
    const output: GsAcceptedOutput = { ...acceptedMock(), subregions: { gyeongbuk: 0, gyeongnam: 0 } };
    expect(() => buildGyeongsangResult(output, ISSUE, GS_QUESTIONS)).toThrow(RangeError);
  });
});
