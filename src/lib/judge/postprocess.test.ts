import { describe, expect, it } from "vitest";
import {
  PART_KEYS,
  REGION_KEYS,
  type Evidence,
  type EvidenceRegion,
  type Grade,
  type PartKey,
  type PartScores,
  type RegionProbabilities,
} from "./contract";
import { SET_A_MODEL_OUTPUT_EXAMPLE, SPEC_MODEL_OUTPUT_EXAMPLE } from "./mock";
import { parseModelOutput, type AcceptedModelOutput } from "./model-output";
import { CONCEALMENT_NOTE, IMITATION_NOTE, OPINIONS } from "./opinions";
import {
  buildJudgeResult,
  buildJudgeSegments,
  buildSegments,
  computeIntensity,
  decideRegion,
  dominantPart,
  gradeFor,
  halveIntensity,
  isRegionUncertain,
  normalizeProbabilities,
  selectOpinion,
  verifyEvidence,
} from "./postprocess";
import { findQuestionSet } from "./prompt";
import { INTENSITY_WEIGHTS, REGION_NAMES } from "./rules";

const SET_A = findQuestionSet("set-a")!;
const SET_B = findQuestionSet("set-b")!;

/** 순서: 서울경기, 강원, 충청, 경상, 전라, 제주 */
function probs(values: [number, number, number, number, number, number]): RegionProbabilities {
  const [seoul_gyeonggi, gangwon, chungcheong, gyeongsang, jeolla, jeju] = values;
  return { seoul_gyeonggi, gangwon, chungcheong, gyeongsang, jeolla, jeju };
}

function sum(p: RegionProbabilities): number {
  return REGION_KEYS.reduce((total, key) => total + p[key], 0);
}

function accepted(example: unknown, questionCount: number): AcceptedModelOutput {
  const parsed = parseModelOutput(JSON.stringify(example), questionCount);
  if (!parsed.ok) throw new Error(`가짜 출력이 검증을 통과하지 못했다: ${parsed.problem}`);
  const value = parsed.value;
  if (value.audio_quality !== "ok") throw new Error("가짜 출력의 품질은 ok여야 한다");
  return value;
}

/** 4장 모델 출력 예시(기본 세트 set-b, 문항 6개) */
const acceptedSpecExample = () => accepted(SPEC_MODEL_OUTPUT_EXAMPLE, SET_B.length);
/** set-a 가짜 출력(문항 4개) */
const acceptedSetAExample = () => accepted(SET_A_MODEL_OUTPUT_EXAMPLE, SET_A.length);

describe("computeIntensity: 농도 가중 합", () => {
  it("7장 예시의 항목 점수로 68점을 낸다 (40×0.15 + 85×0.2 + 60×0.25 + 75×0.4 = 6 + 17 + 15 + 30)", () => {
    expect(
      computeIntensity({ vocabulary: 40, endings: 85, phonology: 60, intonation: 75 }),
    ).toBe(68);
  });

  it("가중치는 명세 4장 값이고 합이 100이다", () => {
    expect(INTENSITY_WEIGHTS).toEqual({ vocabulary: 15, endings: 20, phonology: 25, intonation: 40 });
  });

  it("소수점은 반올림한다(0.5는 올림)", () => {
    // 어휘 10점 × 0.15 = 1.5 → 2
    expect(computeIntensity({ vocabulary: 10, endings: 0, phonology: 0, intonation: 0 })).toBe(2);
    // 어미 2점 × 0.2 = 0.4 → 0
    expect(computeIntensity({ vocabulary: 0, endings: 2, phonology: 0, intonation: 0 })).toBe(0);
    // 어미 3점 × 0.2 = 0.6 → 1
    expect(computeIntensity({ vocabulary: 0, endings: 3, phonology: 0, intonation: 0 })).toBe(1);
    // 85×0.15 + 85×0.2 + 85×0.25 + 86×0.4 = 85.4 → 85
    expect(computeIntensity({ vocabulary: 85, endings: 85, phonology: 85, intonation: 86 })).toBe(85);
  });

  it("어휘와 어미만 높은 흉내 패턴은 예전 가중치로 57점이었지만 새 가중치로는 47점이다", () => {
    const imitation = { vocabulary: 90, endings: 90, phonology: 30, intonation: 20 };
    const oldWeights = { vocabulary: 20, endings: 30, phonology: 20, intonation: 30 };
    expect(computeIntensity(imitation, oldWeights)).toBe(57);
    // 90×0.15 + 90×0.2 + 30×0.25 + 20×0.4 = 13.5 + 18 + 7.5 + 8 = 47
    expect(computeIntensity(imitation)).toBe(47);
  });

  it("양 끝값은 0과 100이다", () => {
    expect(computeIntensity({ vocabulary: 0, endings: 0, phonology: 0, intonation: 0 })).toBe(0);
    expect(computeIntensity({ vocabulary: 100, endings: 100, phonology: 100, intonation: 100 })).toBe(
      100,
    );
  });

  it("범위 밖 점수와 합이 100이 아닌 가중치는 거부한다", () => {
    expect(() =>
      computeIntensity({ vocabulary: 101, endings: 0, phonology: 0, intonation: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      computeIntensity({ vocabulary: 10.5, endings: 0, phonology: 0, intonation: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      computeIntensity(
        { vocabulary: 10, endings: 10, phonology: 10, intonation: 10 },
        { vocabulary: 20, endings: 30, phonology: 20, intonation: 20 },
      ),
    ).toThrow(RangeError);
  });
});

describe("halveIntensity: 모사 의심 농도", () => {
  it("계산값의 절반이고 0.5는 올린다", () => {
    expect(halveIntensity(57)).toBe(29);
    expect(halveIntensity(47)).toBe(24);
    expect(halveIntensity(68)).toBe(34);
    expect(halveIntensity(100)).toBe(50);
    expect(halveIntensity(1)).toBe(1);
    expect(halveIntensity(0)).toBe(0);
  });
});

describe("gradeFor: 등급 매핑", () => {
  it("68점은 2등급 '자막 필요'다", () => {
    expect(gradeFor(68)).toEqual({ grade: 2, gradeName: "자막 필요" });
  });

  it.each([
    [0, 5, "서울 사람인 척하는 중"],
    [19, 5, "서울 사람인 척하는 중"],
    [20, 4, "고향 친구 전화 받으면 돌아옴"],
    [39, 4, "고향 친구 전화 받으면 돌아옴"],
    [40, 3, "본인만 표준어라고 생각함"],
    [59, 3, "본인만 표준어라고 생각함"],
    [60, 2, "자막 필요"],
    [79, 2, "자막 필요"],
    [80, 1, "무형문화재 지정 검토 대상"],
    [100, 1, "무형문화재 지정 검토 대상"],
  ])("%i점은 %i등급 '%s'", (score, grade, gradeName) => {
    expect(gradeFor(score)).toEqual({ grade, gradeName });
  });

  it("0~100 정수가 아니면 거부한다", () => {
    expect(() => gradeFor(-1)).toThrow(RangeError);
    expect(() => gradeFor(101)).toThrow(RangeError);
    expect(() => gradeFor(59.5)).toThrow(RangeError);
  });
});

describe("normalizeProbabilities: 권역 확률 합을 100으로", () => {
  it("합이 이미 100이면 그대로 둔다", () => {
    const example = probs([4, 3, 3, 84, 4, 2]);
    expect(normalizeProbabilities(example)).toEqual(example);
  });

  it("합이 0이면 맞출 수 없으므로 null", () => {
    expect(normalizeProbabilities(probs([0, 0, 0, 0, 0, 0]))).toBeNull();
  });

  it("비율대로 늘린다", () => {
    expect(normalizeProbabilities(probs([2, 3, 5, 30, 5, 5]))).toEqual(probs([4, 6, 10, 60, 10, 10]));
  });

  it("나머지가 큰 권역부터 1씩 더 주고, 같으면 명세 나열 순서를 따른다", () => {
    expect(normalizeProbabilities(probs([1, 1, 1, 0, 0, 0]))).toEqual(probs([34, 33, 33, 0, 0, 0]));
    // 합 101: 내림 값 합이 95라서 나머지가 큰 다섯 권역에 1씩 더한다
    expect(normalizeProbabilities(probs([5, 3, 3, 84, 4, 2]))).toEqual(probs([5, 3, 3, 83, 4, 2]));
  });

  it("어떤 입력이든 정수 합 100을 만든다", () => {
    const inputs: Array<[number, number, number, number, number, number]> = [
      [1, 2, 3, 4, 5, 6],
      [100, 100, 100, 100, 100, 100],
      [7, 0, 0, 0, 0, 0],
      [33, 33, 33, 33, 0, 1],
      [99, 1, 1, 1, 1, 1],
      [17, 23, 0, 41, 9, 13],
    ];
    for (const input of inputs) {
      const result = normalizeProbabilities(probs(input));
      expect(result).not.toBeNull();
      expect(sum(result!)).toBe(100);
      for (const key of REGION_KEYS) expect(Number.isInteger(result![key])).toBe(true);
    }
  });

  it("음수나 정수가 아닌 값은 거부한다", () => {
    expect(() => normalizeProbabilities(probs([-1, 0, 0, 101, 0, 0]))).toThrow(RangeError);
    expect(() => normalizeProbabilities(probs([0.5, 0, 0, 99.5, 0, 0]))).toThrow(RangeError);
  });
});

describe("decideRegion: 판정 지역", () => {
  it("7장 예시는 경상 방언이고 혼합이 아니다", () => {
    expect(decideRegion(probs([4, 3, 3, 84, 4, 2]))).toEqual({
      top: "gyeongsang",
      label: "경상 방언",
      mixed: false,
    });
  });

  it("1·2순위 차이가 10 미만이면 혼합 방언이고 top은 1순위 그대로다", () => {
    expect(decideRegion(probs([0, 0, 0, 50, 41, 9]))).toEqual({
      top: "gyeongsang",
      label: "혼합 방언",
      mixed: true,
    });
  });

  it("차이가 정확히 10이면 혼합이 아니다", () => {
    expect(decideRegion(probs([0, 0, 0, 50, 40, 10]))).toEqual({
      top: "gyeongsang",
      label: "경상 방언",
      mixed: false,
    });
  });

  it("1순위가 동률이면 명세 나열 순서가 앞선 권역이 top이고 혼합이다", () => {
    expect(decideRegion(probs([0, 0, 40, 0, 40, 20]))).toEqual({
      top: "chungcheong",
      label: "혼합 방언",
      mixed: true,
    });
  });

  it.each(REGION_KEYS)("%s 단독이면 '{권역} 방언'", (key) => {
    const p = probs([0, 0, 0, 0, 0, 0]);
    p[key] = 100;
    expect(decideRegion(p)).toEqual({ top: key, label: `${REGION_NAMES[key]} 방언`, mixed: false });
  });
});

describe("verifyEvidence: 근거 검증", () => {
  // 문항 번호가 걸린 검사는 set-a 가짜 출력(문항 4개)의 받아쓰기로 한다.
  const { transcript, question_transcripts: questionTranscripts } = SET_A_MODEL_OUTPUT_EXAMPLE;
  const evidence = (quote: string, question: number | null = null): Evidence => ({
    question,
    quote,
    type: "endings",
    region: "gyeongsang",
    note: "메모",
  });

  describe("문항별 받아쓰기가 있으면 그 문항에서 찾는다", () => {
    it("가짜 출력의 근거는 모두 자기 문항 받아쓰기에 있으므로 남는다(set-a 5개, set-b 7개)", () => {
      for (const example of [SET_A_MODEL_OUTPUT_EXAMPLE, SPEC_MODEL_OUTPUT_EXAMPLE]) {
        expect(verifyEvidence(example.evidence, example.transcript, example.question_transcripts)).toEqual(
          example.evidence,
        );
      }
    });

    it("다른 문항에만 있는 인용은 버린다", () => {
      expect(
        verifyEvidence([evidence("뭐 했노", 1), evidence("뭐 했노", 2)], transcript, questionTranscripts),
      ).toEqual([evidence("뭐 했노", 2)]);
    });

    it("받아쓰기에 없는 인용은 버린다", () => {
      expect(verifyEvidence([evidence("밥 묵었나", 4)], transcript, questionTranscripts)).toEqual([]);
    });

    it("문항 번호가 없거나 범위를 벗어나면 확인할 수 없으므로 버린다", () => {
      expect(
        verifyEvidence(
          [evidence("억수로", null), evidence("억수로", 0), evidence("억수로", 5), evidence("억수로", 1.5)],
          transcript,
          questionTranscripts,
        ),
      ).toEqual([]);
    });

    it("답하지 않은 문항(빈 문자열)에는 어떤 근거도 남지 않는다", () => {
      expect(verifyEvidence([evidence("억수로", 2)], transcript, ["억수로", "", "", ""])).toEqual([]);
    });
  });

  describe("문항별 받아쓰기가 없으면 전체 받아쓰기에서 찾는다", () => {
    it("전체 받아쓰기에 있으면 남기고 문항은 확인하지 않았으므로 null로 둔다", () => {
      expect(verifyEvidence([evidence("뭐 했노", 1), evidence("밥 묵었나", 2)], transcript)).toEqual([
        evidence("뭐 했노", null),
      ]);
      expect(verifyEvidence([evidence("뭐 했노", 3)], transcript, null)).toEqual([evidence("뭐 했노")]);
    });
  });

  it("앞뒤 공백과 연속 공백 차이는 같은 구절로 본다", () => {
    expect(verifyEvidence([evidence("  뭐   했노 ", 2)], transcript, questionTranscripts)).toEqual([
      evidence("뭐 했노", 2),
    ]);
    expect(verifyEvidence([evidence("뭐 했노")], "퍼뜩 안 오고 뭐\t\n했노")).toEqual([evidence("뭐 했노")]);
    expect(verifyEvidence([evidence("뭐 했노", 1)], "", ["안 오고 뭐  했노 "])).toEqual([
      evidence("뭐 했노", 1),
    ]);
  });

  it("띄어쓰기가 다르면 다른 구절로 본다", () => {
    expect(verifyEvidence([evidence("뭐했노", 2)], transcript, questionTranscripts)).toEqual([]);
  });

  it("빈 인용과 공백뿐인 인용은 버린다", () => {
    expect(verifyEvidence([evidence("", 1), evidence("   ", 1)], transcript, questionTranscripts)).toEqual([]);
    expect(verifyEvidence([evidence(""), evidence("   ")], transcript)).toEqual([]);
  });

  it("한글 자모가 분해된(NFD) 인용도 같은 구절로 보고 NFC로 돌려준다", () => {
    expect(
      verifyEvidence([evidence("억수로".normalize("NFD"), 1)], transcript, questionTranscripts),
    ).toEqual([evidence("억수로", 1)]);
  });
});

describe("buildSegments: 문항별 받아쓰기", () => {
  it("문항 번호, 문항 문구, 공백을 정리한 받아쓰기를 문항 순서대로 낸다", () => {
    expect(buildSegments(["문항 하나", "문항 둘"], ["  어 니가\n웬일이고 ", ""])).toEqual([
      { question: 1, prompt: "문항 하나", transcript: "어 니가 웬일이고" },
      { question: 2, prompt: "문항 둘", transcript: "" },
    ]);
  });

  it("문항별 받아쓰기가 없거나 문항 수와 다르면 빈 배열", () => {
    expect(buildSegments(["문항 하나", "문항 둘"], null)).toEqual([]);
    expect(buildSegments(["문항 하나", "문항 둘"], ["하나만"])).toEqual([]);
  });
});

describe("buildJudgeSegments: 일반 감정의 문항별 받아쓰기", () => {
  it("문항 종류를 함께 싣고, 바꿔 말하기 문항의 문구는 바꿔 말할 문장이다", () => {
    const segments = buildJudgeSegments(SET_B, SPEC_MODEL_OUTPUT_EXAMPLE.question_transcripts);
    expect(segments.map((segment) => segment.kind)).toEqual([
      "convert",
      "convert",
      "convert",
      "convert",
      "question",
      "question",
    ]);
    expect(segments[0]).toEqual({
      question: 1,
      kind: "convert",
      prompt: "너 어디야? 왜 이렇게 안 와? 언제 올 거야?",
      transcript: "니 어디고? 와 이래 안 오노? 언제 올 끼고?",
    });
    expect(Object.keys(segments[0])).toEqual(["question", "kind", "prompt", "transcript"]);
  });

  it("종류가 없는 문항은 question이고, 받아쓰기가 문항 수만큼 없으면 빈 배열이다", () => {
    const items = [{ id: 1, target: "친구", situation: "상황" }];
    expect(buildJudgeSegments(items, ["답"])).toEqual([
      { question: 1, kind: "question", prompt: "상황", transcript: "답" },
    ]);
    expect(buildJudgeSegments(SET_B, SET_A_MODEL_OUTPUT_EXAMPLE.question_transcripts)).toEqual([]);
  });
});

/** dominant 항목만 60점이고 나머지는 30점 */
function partsLedBy(dominant: PartKey): PartScores {
  const parts: PartScores = { vocabulary: 30, endings: 30, phonology: 30, intonation: 30 };
  parts[dominant] = 60;
  return parts;
}

describe("dominantPart: 가장 높은 항목", () => {
  it("7장 예시 점수에서는 어미(85점)다", () => {
    expect(dominantPart({ vocabulary: 40, endings: 85, phonology: 60, intonation: 75 })).toBe(
      "endings",
    );
  });

  it.each(PART_KEYS)("%s만 높으면 그 항목이다", (key) => {
    expect(dominantPart(partsLedBy(key))).toBe(key);
  });

  it("점수가 같으면 어휘, 어미, 음운, 억양 순으로 앞선 항목이다", () => {
    expect(dominantPart({ vocabulary: 0, endings: 0, phonology: 0, intonation: 0 })).toBe(
      "vocabulary",
    );
    expect(dominantPart({ vocabulary: 10, endings: 70, phonology: 20, intonation: 70 })).toBe(
      "endings",
    );
    expect(dominantPart({ vocabulary: 10, endings: 20, phonology: 70, intonation: 70 })).toBe(
      "phonology",
    );
  });
});

describe("selectOpinion: 소견", () => {
  const cases = ([1, 2, 3, 4, 5] as const).flatMap((grade) =>
    PART_KEYS.map((part) => [grade, part] as [Grade, PartKey]),
  );

  it.each(cases)("%i등급이고 %s가 가장 높으면 그 칸의 문구를 쓴다", (grade, part) => {
    expect(selectOpinion({ grade, top: "gyeongsang", score: 50, parts: partsLedBy(part) })).toBe(
      OPINIONS[grade][part],
    );
  });

  it("같은 등급이라도 가장 높은 항목이 다르면 문구가 다르다", () => {
    const texts = PART_KEYS.map((part) =>
      selectOpinion({ grade: 3, top: "jeolla", score: 50, parts: partsLedBy(part) }),
    );
    expect(new Set(texts).size).toBe(4);
  });

  it("서울경기가 1순위이고 농도가 20 미만이면 '출신지 은폐 의심'을 붙인다", () => {
    const parts = partsLedBy("intonation");
    expect(selectOpinion({ grade: 5, top: "seoul_gyeonggi", score: 19, parts })).toBe(
      `${OPINIONS[5].intonation} ${CONCEALMENT_NOTE}`,
    );
  });

  it("농도가 20이면 붙이지 않는다", () => {
    const parts = partsLedBy("vocabulary");
    expect(selectOpinion({ grade: 4, top: "seoul_gyeonggi", score: 20, parts })).toBe(
      OPINIONS[4].vocabulary,
    );
  });

  it("서울경기가 1순위가 아니면 농도가 낮아도 붙이지 않는다", () => {
    const parts = partsLedBy("endings");
    expect(selectOpinion({ grade: 5, top: "jeju", score: 5, parts })).toBe(OPINIONS[5].endings);
  });

  it("모사 의심이면 소견 끝에 '타 지역 방언 모사 의심.'을 붙인다", () => {
    const parts = partsLedBy("endings");
    expect(selectOpinion({ grade: 4, top: "gyeongsang", score: 29, parts, imitationSuspected: true })).toBe(
      `${OPINIONS[4].endings} ${IMITATION_NOTE}`,
    );
    expect(IMITATION_NOTE).toBe("타 지역 방언 모사 의심.");
    expect(selectOpinion({ grade: 4, top: "gyeongsang", score: 29, parts, imitationSuspected: false })).toBe(
      OPINIONS[4].endings,
    );
  });

  it("출신지 은폐 의심과 함께면 모사 의심이 맨 끝에 온다", () => {
    const parts = partsLedBy("vocabulary");
    expect(
      selectOpinion({ grade: 5, top: "seoul_gyeonggi", score: 12, parts, imitationSuspected: true }),
    ).toBe(`${OPINIONS[5].vocabulary} ${CONCEALMENT_NOTE} ${IMITATION_NOTE}`);
  });
});

describe("buildJudgeResult: 4장 모델 출력 예시 → 결과 JSON", () => {
  const issue = {
    id: "j_8f3a2c",
    certificateNo: "제2026-000123호",
    issuedAt: "2026-11-15T14:03:00+09:00",
  };

  it("권역, 농도, 소견은 7장 예시와 같고, 근거 7개와 문항별 받아쓰기(종류 포함), 전체 받아쓰기가 함께 나간다", () => {
    expect(buildJudgeResult(acceptedSpecExample(), issue, SET_B)).toEqual({
      ...issue,
      region: {
        top: "gyeongsang",
        label: "경상 방언",
        mixed: false,
        // 검증을 통과한 근거 7개가 모두 경상을 가리킨다.
        uncertain: false,
        probabilities: {
          seoul_gyeonggi: 4,
          gangwon: 3,
          chungcheong: 3,
          gyeongsang: 84,
          jeolla: 4,
          jeju: 2,
        },
      },
      intensity: {
        score: 68,
        grade: 2,
        gradeName: "자막 필요",
        parts: { vocabulary: 40, endings: 85, phonology: 60, intonation: 75 },
      },
      imitationSuspected: false,
      evidence: SPEC_MODEL_OUTPUT_EXAMPLE.evidence,
      opinion: "어미 사용이 현저하여 표준어 전환이 곤란한 것으로 사료됨.",
      transcript: SPEC_MODEL_OUTPUT_EXAMPLE.transcript,
      segments: SET_B.map((item, index) => ({
        question: index + 1,
        kind: item.kind,
        prompt: item.situation,
        transcript: SPEC_MODEL_OUTPUT_EXAMPLE.question_transcripts[index],
      })),
    });
  });

  it("문항별 받아쓰기가 없으면 segments는 빈 배열이고 근거는 전체 받아쓰기로 검증한다", () => {
    const output = {
      ...acceptedSpecExample(),
      question_transcripts: null,
      evidence: [
        {
          question: 3,
          quote: "뭐 했노",
          type: "endings" as const,
          region: "gyeongsang" as const,
          note: "다른 문항이라도 전체에 있으면 남는다",
        },
        { question: 1, quote: "밥 묵었나", type: "vocabulary" as const, region: "gyeongsang" as const, note: "어디에도 없다" },
      ],
    };
    const result = buildJudgeResult(output, issue, SET_B);
    expect(result.segments).toEqual([]);
    expect(result.evidence).toEqual([
      {
        question: null,
        quote: "뭐 했노",
        type: "endings",
        region: "gyeongsang",
        note: "다른 문항이라도 전체에 있으면 남는다",
      },
    ]);
    expect(result.transcript).toBe(SPEC_MODEL_OUTPUT_EXAMPLE.transcript);
  });

  it("모사 의심이면 농도를 계산값의 절반으로 낮추고 그 점수로 등급과 소견을 정한다", () => {
    const output = {
      ...acceptedSpecExample(),
      scores: { vocabulary: 90, endings: 90, phonology: 30, intonation: 20 },
      imitation_suspected: true,
    };
    const result = buildJudgeResult(output, issue, SET_B);
    // 계산값 47 → 절반 23.5 → 24, 4등급
    expect(result.intensity).toMatchObject({ score: 24, grade: 4, gradeName: "고향 친구 전화 받으면 돌아옴" });
    expect(result.imitationSuspected).toBe(true);
    expect(result.opinion).toBe(`${OPINIONS[4].vocabulary} ${IMITATION_NOTE}`);
    expect(result.intensity.parts).toEqual(output.scores);
  });

  it("모사 의심이 아니면 계산값 그대로다", () => {
    const output = {
      ...acceptedSpecExample(),
      scores: { vocabulary: 90, endings: 90, phonology: 30, intonation: 20 },
      imitation_suspected: false,
    };
    const result = buildJudgeResult(output, issue, SET_B);
    expect(result.intensity).toMatchObject({ score: 47, grade: 3 });
    expect(result.imitationSuspected).toBe(false);
    expect(result.opinion).toBe(OPINIONS[3].vocabulary);
  });

  it("확률 합이 100이 아니면 맞춘 값으로 판정한다", () => {
    const output = { ...acceptedSpecExample(), regions: probs([1, 1, 1, 0, 0, 0]) };
    const result = buildJudgeResult(output, { id: "j_1", certificateNo: "c", issuedAt: "t" }, SET_B);
    expect(result.region).toEqual({
      top: "seoul_gyeonggi",
      label: "혼합 방언",
      mixed: true,
      // 근거 7개가 모두 경상을 가리켜 1순위(서울경기)를 뒷받침하지 못한다.
      uncertain: true,
      probabilities: probs([34, 33, 33, 0, 0, 0]),
    });
  });

  it("전라 근거가 대부분인데 경상 95%로 답하면 판정 유보다. 확률, 농도, 등급, 근거는 그대로 둔다", () => {
    const output: AcceptedModelOutput = {
      ...acceptedSetAExample(),
      evidence: [
        { question: 1, quote: "웬일이고", type: "endings", region: "jeolla", note: "전라를 가리킨다고 본 근거" },
        { question: 2, quote: "뭐 했노", type: "endings", region: "jeolla", note: "전라를 가리킨다고 본 근거" },
        { question: 3, quote: "죽는데이", type: "endings", region: "jeolla", note: "전라를 가리킨다고 본 근거" },
        { question: 4, quote: "묵을게예", type: "phonology", region: "gyeongsang", note: "경상을 가리킨다고 본 근거" },
      ],
      regions: probs([1, 1, 1, 95, 1, 1]),
    };
    const result = buildJudgeResult(output, issue, SET_A);
    expect(result.region).toMatchObject({ top: "gyeongsang", label: "경상 방언", mixed: false, uncertain: true });
    expect(result.region.probabilities.gyeongsang).toBe(95);
    expect(result.intensity.score).toBe(68);
    expect(result.evidence).toHaveLength(4);
  });

  it("판정 유보는 받아쓰기로 검증을 통과한 근거로만 센다", () => {
    const output: AcceptedModelOutput = {
      ...acceptedSetAExample(),
      evidence: [
        { question: 1, quote: "억수로", type: "vocabulary", region: "gyeongsang", note: "있음" },
        { question: 2, quote: "억수로", type: "vocabulary", region: "gyeongsang", note: "다른 문항이라 버린다" },
        { question: 3, quote: "지어낸 말", type: "endings", region: "gyeongsang", note: "없는 인용이라 버린다" },
      ],
    };
    const result = buildJudgeResult(output, issue, SET_A);
    expect(result.evidence).toHaveLength(1);
    expect(result.region.uncertain).toBe(true);
  });
});

describe("isRegionUncertain: 판정 유보", () => {
  const items = (...regions: Array<EvidenceRegion | null>): Evidence[] =>
    regions.map((region, index) => ({
      question: (index % 4) + 1,
      quote: `구절${index}`,
      type: "endings",
      region,
      note: "",
    }));

  it("1순위 권역을 가리키는 근거가 2개 이상이고 다른 권역 근거가 그보다 많지 않으면 유보하지 않는다", () => {
    expect(isRegionUncertain("gyeongsang", items("gyeongsang", "gyeongsang"))).toBe(false);
    expect(isRegionUncertain("gyeongsang", items("gyeongsang", "gyeongsang", "jeolla", "jeju"))).toBe(false);
  });

  it("1순위 권역을 가리키는 근거가 2개 미만이면 유보한다(근거가 없어도 유보)", () => {
    expect(isRegionUncertain("gyeongsang", items("gyeongsang"))).toBe(true);
    expect(isRegionUncertain("gyeongsang", items("jeolla", "jeolla"))).toBe(true);
    expect(isRegionUncertain("seoul_gyeonggi", [])).toBe(true);
  });

  it("다른 권역을 가리키는 근거가 더 많으면 유보한다(다른 권역끼리 합쳐 센다)", () => {
    expect(isRegionUncertain("gyeongsang", items("gyeongsang", "gyeongsang", "jeolla", "jeolla", "jeolla"))).toBe(true);
    expect(isRegionUncertain("gyeongsang", items("gyeongsang", "gyeongsang", "jeolla", "chungcheong", "jeju"))).toBe(true);
  });

  it("여러 권역에 공통인 근거(common)와 권역을 알 수 없는 근거(null)는 어느 쪽에도 세지 않는다", () => {
    expect(isRegionUncertain("gyeongsang", items("gyeongsang", "gyeongsang", "common", "common", "common", null, null))).toBe(false);
    expect(isRegionUncertain("gyeongsang", items("gyeongsang", "common", "common", null))).toBe(true);
  });
});
