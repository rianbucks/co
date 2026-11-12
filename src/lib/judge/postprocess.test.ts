import { describe, expect, it } from "vitest";
import { REGION_KEYS, type Evidence, type RegionProbabilities } from "./contract";
import { SPEC_MODEL_OUTPUT_EXAMPLE } from "./mock";
import { parseModelOutput, type AcceptedModelOutput } from "./model-output";
import { CONCEALMENT_NOTE, OPINION_BY_GRADE } from "./opinions";
import {
  buildJudgeResult,
  computeIntensity,
  decideRegion,
  gradeFor,
  normalizeProbabilities,
  selectOpinion,
  verifyEvidence,
} from "./postprocess";
import { INTENSITY_WEIGHTS, REGION_NAMES } from "./rules";

/** 순서: 서울경기, 강원, 충청, 경상, 전라, 제주 */
function probs(values: [number, number, number, number, number, number]): RegionProbabilities {
  const [seoul_gyeonggi, gangwon, chungcheong, gyeongsang, jeolla, jeju] = values;
  return { seoul_gyeonggi, gangwon, chungcheong, gyeongsang, jeolla, jeju };
}

function sum(p: RegionProbabilities): number {
  return REGION_KEYS.reduce((total, key) => total + p[key], 0);
}

function acceptedSpecExample(): AcceptedModelOutput {
  const parsed = parseModelOutput(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE));
  if (!parsed.ok) throw new Error(`4장 예시가 검증을 통과하지 못했다: ${parsed.problem}`);
  const value = parsed.value;
  if (value.audio_quality !== "ok") throw new Error("4장 예시의 품질은 ok여야 한다");
  return value;
}

describe("computeIntensity: 농도 가중 합", () => {
  it("7장 예시의 항목 점수로 68점을 낸다 (40×0.2 + 85×0.3 + 60×0.2 + 75×0.3)", () => {
    expect(
      computeIntensity({ vocabulary: 40, endings: 85, phonology: 60, intonation: 75 }),
    ).toBe(68);
  });

  it("가중치는 명세 4장 값이고 합이 100이다", () => {
    expect(INTENSITY_WEIGHTS).toEqual({ vocabulary: 20, endings: 30, phonology: 20, intonation: 30 });
  });

  it("소수점은 반올림한다(0.5는 올림)", () => {
    // 어미 5점 × 0.3 = 1.5 → 2
    expect(computeIntensity({ vocabulary: 0, endings: 5, phonology: 0, intonation: 0 })).toBe(2);
    // 어휘 2점 × 0.2 = 0.4 → 0
    expect(computeIntensity({ vocabulary: 2, endings: 0, phonology: 0, intonation: 0 })).toBe(0);
    // 어휘 3점 × 0.2 = 0.6 → 1
    expect(computeIntensity({ vocabulary: 3, endings: 0, phonology: 0, intonation: 0 })).toBe(1);
    // 85×0.2 + 85×0.3 + 85×0.2 + 86×0.3 = 85.3 → 85
    expect(computeIntensity({ vocabulary: 85, endings: 85, phonology: 85, intonation: 86 })).toBe(85);
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

describe("gradeFor: 등급 매핑", () => {
  it("68점은 4등급 '자막 필요'다", () => {
    expect(gradeFor(68)).toEqual({ grade: 4, gradeName: "자막 필요" });
  });

  it.each([
    [0, 1, "서울 사람인 척하는 중"],
    [19, 1, "서울 사람인 척하는 중"],
    [20, 2, "고향 친구 전화 받으면 돌아옴"],
    [39, 2, "고향 친구 전화 받으면 돌아옴"],
    [40, 3, "본인만 표준어라고 생각함"],
    [59, 3, "본인만 표준어라고 생각함"],
    [60, 4, "자막 필요"],
    [79, 4, "자막 필요"],
    [80, 5, "무형문화재 지정 검토 대상"],
    [100, 5, "무형문화재 지정 검토 대상"],
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
  const transcript = SPEC_MODEL_OUTPUT_EXAMPLE.transcript;
  const evidence = (quote: string): Evidence => ({ type: "endings", quote, note: "메모" });

  it("4장 예시의 근거 2개는 모두 받아쓰기에 있으므로 남는다", () => {
    expect(verifyEvidence(SPEC_MODEL_OUTPUT_EXAMPLE.evidence, transcript)).toEqual(
      SPEC_MODEL_OUTPUT_EXAMPLE.evidence,
    );
  });

  it("받아쓰기에 없는 인용은 버린다", () => {
    expect(verifyEvidence([evidence("밥 묵었나"), evidence("뭇나")], transcript)).toEqual([
      evidence("뭇나"),
    ]);
  });

  it("앞뒤 공백과 연속 공백 차이는 같은 구절로 본다", () => {
    expect(verifyEvidence([evidence("  했다   아이가 ")], transcript)).toEqual([
      evidence("했다 아이가"),
    ]);
    expect(verifyEvidence([evidence("했다 아이가")], "아 그거 내가 했다\t\n아이가")).toEqual([
      evidence("했다 아이가"),
    ]);
  });

  it("띄어쓰기가 다르면 다른 구절로 본다", () => {
    expect(verifyEvidence([evidence("했다아이가")], transcript)).toEqual([]);
  });

  it("빈 인용과 공백뿐인 인용은 버린다", () => {
    expect(verifyEvidence([evidence(""), evidence("   ")], transcript)).toEqual([]);
  });

  it("한글 자모가 분해된(NFD) 인용도 같은 구절로 보고 NFC로 돌려준다", () => {
    expect(verifyEvidence([evidence("뭇나".normalize("NFD"))], transcript)).toEqual([
      evidence("뭇나"),
    ]);
  });
});

describe("selectOpinion: 소견", () => {
  it.each([1, 2, 3, 4, 5] as const)("%i등급은 등급별 문구를 쓴다", (grade) => {
    expect(selectOpinion({ grade, top: "gyeongsang", score: 50 })).toBe(OPINION_BY_GRADE[grade]);
  });

  it("서울경기가 1순위이고 농도가 20 미만이면 '출신지 은폐 의심'을 붙인다", () => {
    expect(selectOpinion({ grade: 1, top: "seoul_gyeonggi", score: 19 })).toBe(
      `${OPINION_BY_GRADE[1]} ${CONCEALMENT_NOTE}`,
    );
  });

  it("농도가 20이면 붙이지 않는다", () => {
    expect(selectOpinion({ grade: 2, top: "seoul_gyeonggi", score: 20 })).toBe(OPINION_BY_GRADE[2]);
  });

  it("서울경기가 1순위가 아니면 농도가 낮아도 붙이지 않는다", () => {
    expect(selectOpinion({ grade: 1, top: "jeju", score: 5 })).toBe(OPINION_BY_GRADE[1]);
  });
});

describe("buildJudgeResult: 4장 모델 출력 예시 → 결과 JSON", () => {
  it("권역과 농도는 7장 예시와 같고, 근거는 2개, 받아쓰기가 함께 나간다", () => {
    const issue = {
      id: "j_8f3a2c",
      certificateNo: "제2026-000123호",
      issuedAt: "2026-11-15T14:03:00+09:00",
    };

    expect(buildJudgeResult(acceptedSpecExample(), issue)).toEqual({
      ...issue,
      region: {
        top: "gyeongsang",
        label: "경상 방언",
        mixed: false,
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
        grade: 4,
        gradeName: "자막 필요",
        parts: { vocabulary: 40, endings: 85, phonology: 60, intonation: 75 },
      },
      evidence: [
        { type: "endings", quote: "했다 아이가", note: "경상 방언의 확인 표현" },
        { type: "phonology", quote: "뭇나", note: "'먹었나'의 축약" },
      ],
      opinion: OPINION_BY_GRADE[4],
      transcript: "아 그거 내가 했다 아이가, 니 밥 뭇나",
    });
  });

  it("확률 합이 100이 아니면 맞춘 값으로 판정한다", () => {
    const output = { ...acceptedSpecExample(), regions: probs([1, 1, 1, 0, 0, 0]) };
    const result = buildJudgeResult(output, { id: "j_1", certificateNo: "c", issuedAt: "t" });
    expect(result.region).toEqual({
      top: "seoul_gyeonggi",
      label: "혼합 방언",
      mixed: true,
      probabilities: probs([34, 33, 33, 0, 0, 0]),
    });
  });
});
