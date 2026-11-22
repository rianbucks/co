import { describe, expect, it } from "vitest";
import { EVIDENCE_REGIONS, PART_KEYS, REGION_KEYS } from "./contract";
import { SET_A_MODEL_OUTPUT_EXAMPLE, SPEC_MODEL_OUTPUT_EXAMPLE } from "./mock";
import { buildModelOutputSchema, parseModelOutput as parseWithCount } from "./model-output";

/** 검사는 set-a(문항 4개)의 가짜 출력으로 한다. 문항 수에 따른 동작은 따로 확인한다. */
const QUESTION_COUNT = 4;
const parseModelOutput = (text: string) => parseWithCount(text, QUESTION_COUNT);
const MODEL_OUTPUT_JSON_SCHEMA = buildModelOutputSchema(QUESTION_COUNT);

const example = () => JSON.parse(JSON.stringify(SET_A_MODEL_OUTPUT_EXAMPLE));

describe("parseModelOutput", () => {
  it("set-a 가짜 출력(문항 4개)을 그대로 받아들인다", () => {
    expect(parseModelOutput(JSON.stringify(SET_A_MODEL_OUTPUT_EXAMPLE))).toEqual({
      ok: true,
      value: example(),
    });
  });

  it("4장 모델 출력 예시(set-b, 문항 6개)는 문항 수 6으로 그대로 받아들인다", () => {
    expect(parseWithCount(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE), 6)).toEqual({
      ok: true,
      value: JSON.parse(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE)),
    });
    // 문항 수가 다르면 문항별 받아쓰기만 null로 두고 실패시키지 않는다.
    const four = parseWithCount(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE), 4);
    expect(four.ok && four.value.audio_quality === "ok" && four.value.question_transcripts).toBeNull();
  });

  it("품질 불량이면 나머지가 null이어도 받아들이고 audio_quality만 남긴다", () => {
    const text = JSON.stringify({
      audio_quality: "no_speech",
      transcript: null,
      regions: null,
      scores: null,
      evidence: null,
    });
    expect(parseModelOutput(text)).toEqual({
      ok: true,
      value: { audio_quality: "no_speech" },
    });
  });

  it("품질 불량이면 나머지 필드가 빠져 있어도 받아들인다", () => {
    expect(parseModelOutput(JSON.stringify({ audio_quality: "too_short" }))).toEqual({
      ok: true,
      value: { audio_quality: "too_short" },
    });
  });

  it("녹음 내용 표시(flags)는 받지 않는다: 이전 형식으로 flags가 와도 무시하고 실패시키지 않는다", () => {
    const parsed = parseModelOutput(JSON.stringify({ ...example(), flags: ["profanity", "personal_info"] }));
    expect(parsed).toEqual({ ok: true, value: example() });
    expect(parseModelOutput(JSON.stringify({ audio_quality: "noisy", flags: ["hate"] }))).toEqual({
      ok: true,
      value: { audio_quality: "noisy" },
    });
  });

  it("JSON이 아니면 invalid_json", () => {
    expect(parseModelOutput("")).toEqual({ ok: false, problem: "invalid_json" });
    expect(parseModelOutput("```json\n{}\n```")).toEqual({ ok: false, problem: "invalid_json" });
  });

  it.each([
    ["점수가 100을 넘음", { scores: { vocabulary: 101, endings: 85, phonology: 60, intonation: 75 } }],
    ["점수가 정수가 아님", { scores: { vocabulary: 40.5, endings: 85, phonology: 60, intonation: 75 } }],
    [
      "권역이 빠짐",
      { regions: { seoul_gyeonggi: 4, gangwon: 3, chungcheong: 3, gyeongsang: 84, jeolla: 6 } },
    ],
    ["알 수 없는 근거 종류", { evidence: [{ type: "grammar", quote: "뭇나", note: "" }] }],
    ["알 수 없는 품질 값", { audio_quality: "bad" }],
  ])("형식이 다르면 schema_mismatch: %s", (_name, patch) => {
    const output = { ...example(), ...patch };
    expect(parseModelOutput(JSON.stringify(output))).toEqual({
      ok: false,
      problem: "schema_mismatch",
    });
  });

  it.each(["transcript", "evidence", "regions", "scores"])(
    "품질이 ok인데 %s가 null이면 missing_fields",
    (field) => {
      const output = { ...example(), [field]: null };
      expect(parseModelOutput(JSON.stringify(output))).toEqual({
        ok: false,
        problem: "missing_fields",
      });
    },
  );

  it.each([
    ["없음", undefined],
    ["null", null],
    ["3개", ["하나", "둘", "셋"]],
    ["5개", ["하나", "둘", "셋", "넷", "다섯"]],
    ["문자열이 아닌 값", ["하나", "둘", 3, "넷"]],
    ["배열이 아님", "하나 둘 셋 넷"],
  ])("문항별 받아쓰기가 4개의 문자열 배열이 아니면 실패하지 않고 null로 둔다: %s", (_name, value) => {
    const parsed = parseModelOutput(JSON.stringify({ ...example(), question_transcripts: value }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.value.audio_quality === "ok") {
      expect(parsed.value.question_transcripts).toBeNull();
      expect(parsed.value.transcript).toBe(SET_A_MODEL_OUTPUT_EXAMPLE.transcript);
    }
  });

  it("답하지 않은 문항은 빈 문자열로 받아들인다", () => {
    const parsed = parseModelOutput(
      JSON.stringify({ ...example(), question_transcripts: ["어 니가 웬일이고", "", "", ""] }),
    );
    expect(parsed.ok && parsed.value.audio_quality === "ok" && parsed.value.question_transcripts).toEqual([
      "어 니가 웬일이고",
      "",
      "",
      "",
    ]);
  });

  it.each([
    ["없음", undefined],
    ["0", 0],
    ["5", 5],
    ["소수", 1.5],
    ["문자열", "1"],
  ])("근거의 문항 번호가 1~4 정수가 아니면 실패하지 않고 null로 둔다: %s", (_name, question) => {
    const evidence = [{ question, quote: "뭐 했노", type: "endings", region: "gyeongsang", note: "" }];
    const parsed = parseModelOutput(JSON.stringify({ ...example(), evidence }));
    expect(parsed.ok && parsed.value.audio_quality === "ok" && parsed.value.evidence).toEqual([
      { question: null, quote: "뭐 했노", type: "endings", region: "gyeongsang", note: "" },
    ]);
  });

  it.each([...EVIDENCE_REGIONS])("근거의 권역 '%s'를 그대로 읽는다", (region) => {
    const evidence = [{ question: 2, quote: "뭐 했노", type: "endings", region, note: "" }];
    const parsed = parseModelOutput(JSON.stringify({ ...example(), evidence }));
    expect(parsed.ok && parsed.value.audio_quality === "ok" && parsed.value.evidence[0].region).toBe(region);
  });

  it.each([
    ["없음", undefined],
    ["null", null],
    ["모르는 권역", "busan"],
    ["대문자", "GYEONGSANG"],
    ["한글 이름", "경상"],
    ["숫자", 3],
  ])("근거의 권역이 여섯 권역이나 common이 아니면 실패하지 않고 null로 둔다: %s", (_name, region) => {
    const evidence = [{ question: 2, quote: "뭐 했노", type: "endings", region, note: "" }];
    const parsed = parseModelOutput(JSON.stringify({ ...example(), evidence }));
    expect(parsed.ok && parsed.value.audio_quality === "ok" && parsed.value.evidence).toEqual([
      { question: 2, quote: "뭐 했노", type: "endings", region: null, note: "" },
    ]);
  });

  it("모사 의심은 true일 때만 true로 읽고, 없거나 boolean이 아니면 실패하지 않고 false로 둔다", () => {
    const read = (value: unknown) => {
      const parsed = parseModelOutput(JSON.stringify({ ...example(), imitation_suspected: value }));
      return parsed.ok && parsed.value.audio_quality === "ok" ? parsed.value.imitation_suspected : "실패";
    };
    expect(read(true)).toBe(true);
    expect(read(false)).toBe(false);
    expect(read(undefined)).toBe(false);
    expect(read(null)).toBe(false);
    expect(read("true")).toBe(false);
    expect(read(1)).toBe(false);
  });

  it("지시 발화 여부(instruction_attempt)도 true일 때만 true로 읽고, 없거나 boolean이 아니면 실패하지 않고 false로 둔다", () => {
    const read = (value: unknown) => {
      const parsed = parseModelOutput(JSON.stringify({ ...example(), instruction_attempt: value }));
      return parsed.ok && parsed.value.audio_quality === "ok" ? parsed.value.instruction_attempt : "실패";
    };
    expect(read(true)).toBe(true);
    expect(read(false)).toBe(false);
    expect(read(undefined)).toBe(false);
    expect(read(null)).toBe(false);
    expect(read("true")).toBe(false);
    expect(read(1)).toBe(false);
  });

  it("권역 확률이 모두 0이면 zero_probabilities", () => {
    const regions = Object.fromEntries(REGION_KEYS.map((key) => [key, 0]));
    expect(parseModelOutput(JSON.stringify({ ...example(), regions }))).toEqual({
      ok: false,
      problem: "zero_probabilities",
    });
  });
});

/** 공식 문서(Structured outputs > JSON schema support)에 지원한다고 적힌 키워드. */
const DOCUMENTED_KEYWORDS = new Set([
  "type",
  "title",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "format",
  "minimum",
  "maximum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
]);

type SchemaNode = Record<string, unknown>;

function walk(node: SchemaNode, path: string, visit: (node: SchemaNode, path: string) => void) {
  visit(node, path);
  const properties = node.properties as Record<string, SchemaNode> | undefined;
  for (const [name, child] of Object.entries(properties ?? {})) {
    walk(child, `${path}.${name}`, visit);
  }
  if (node.items) walk(node.items as SchemaNode, `${path}[]`, visit);
}

describe("MODEL_OUTPUT_JSON_SCHEMA", () => {
  it("문서에 적힌 지원 키워드만 쓴다", () => {
    const unknown: string[] = [];
    walk(MODEL_OUTPUT_JSON_SCHEMA, "$", (node, path) => {
      for (const key of Object.keys(node)) {
        if (!DOCUMENTED_KEYWORDS.has(key)) unknown.push(`${path}.${key}`);
      }
    });
    expect(unknown).toEqual([]);
  });

  it("객체의 모든 속성을 required로 둔다(문서 권고)", () => {
    walk(MODEL_OUTPUT_JSON_SCHEMA, "$", (node) => {
      if (node.properties) {
        expect(new Set(node.required as string[])).toEqual(
          new Set(Object.keys(node.properties as object)),
        );
      }
    });
  });

  it("근거 먼저, 판정 나중: 받아쓰기 → 지시 발화 여부 → 근거 → 권역 확률 → 항목 점수 → 모사 의심 순서이고, 4장 모델 출력 형식과 같다", () => {
    const properties = MODEL_OUTPUT_JSON_SCHEMA.properties as Record<string, SchemaNode>;
    expect(Object.keys(properties)).toEqual([
      "audio_quality",
      "transcript",
      "question_transcripts",
      "instruction_attempt",
      "evidence",
      "regions",
      "scores",
      "imitation_suspected",
    ]);
    expect(MODEL_OUTPUT_JSON_SCHEMA.required).toEqual(Object.keys(properties));
    expect(Object.keys(properties)).toEqual(Object.keys(SPEC_MODEL_OUTPUT_EXAMPLE));
    expect(Object.keys(properties)).toEqual(Object.keys(SET_A_MODEL_OUTPUT_EXAMPLE));
    expect(Object.keys(properties.regions.properties as object)).toEqual([...REGION_KEYS]);
    expect(Object.keys(properties.scores.properties as object)).toEqual([...PART_KEYS]);
  });

  it("문항별 받아쓰기는 문항 수만큼의 문자열 배열이고, 근거의 문항 번호는 1~문항 수다", () => {
    const properties = MODEL_OUTPUT_JSON_SCHEMA.properties as Record<string, SchemaNode>;
    expect(properties.question_transcripts).toMatchObject({
      items: { type: "string" },
      minItems: 4,
      maxItems: 4,
    });
    const evidenceItem = (properties.evidence.items as SchemaNode).properties as Record<string, SchemaNode>;
    expect(evidenceItem.question).toMatchObject({ type: "integer", minimum: 1, maximum: 4 });
    // 근거 항목도 들린 구절을 먼저 쓰고 그 특징이 가리키는 권역을 정한다.
    expect(Object.keys(evidenceItem)).toEqual(["question", "quote", "type", "region", "note"]);
    expect(evidenceItem.region).toMatchObject({ type: "string", enum: [...REGION_KEYS, "common"] });
    expect(Object.keys(SPEC_MODEL_OUTPUT_EXAMPLE.evidence[0])).toEqual(Object.keys(evidenceItem));

    const three = buildModelOutputSchema(3).properties as Record<string, SchemaNode>;
    expect(three.question_transcripts).toMatchObject({ minItems: 3, maxItems: 3 });
    // 기본 세트 set-b는 문항 6개
    const six = buildModelOutputSchema(6).properties as Record<string, SchemaNode>;
    expect(six.question_transcripts).toMatchObject({ minItems: 6, maxItems: 6 });
    const sixEvidence = (six.evidence.items as SchemaNode).properties as Record<string, SchemaNode>;
    expect(sixEvidence.question).toMatchObject({ minimum: 1, maximum: 6 });
  });

  it("품질 불량일 때 비우는 필드는 null을 허용한다", () => {
    const properties = MODEL_OUTPUT_JSON_SCHEMA.properties as Record<string, SchemaNode>;
    for (const field of ["transcript", "question_transcripts", "instruction_attempt", "evidence", "regions", "scores", "imitation_suspected"]) {
      expect(properties[field].type).toContain("null");
    }
    expect(properties.audio_quality.type).toBe("string");
    expect(properties).not.toHaveProperty("flags");
  });
});
