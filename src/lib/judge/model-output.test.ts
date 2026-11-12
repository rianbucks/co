import { describe, expect, it } from "vitest";
import { PART_KEYS, REGION_KEYS } from "./contract";
import { SPEC_MODEL_OUTPUT_EXAMPLE } from "./mock";
import { MODEL_OUTPUT_JSON_SCHEMA, parseModelOutput } from "./model-output";

const example = () => JSON.parse(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE));

describe("parseModelOutput", () => {
  it("4장 모델 출력 예시를 그대로 받아들인다", () => {
    expect(parseModelOutput(JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE))).toEqual({
      ok: true,
      value: example(),
    });
  });

  it("품질 불량이면 나머지가 null이어도 받아들이고 audio_quality와 flags만 남긴다", () => {
    const text = JSON.stringify({
      audio_quality: "no_speech",
      flags: [],
      transcript: null,
      regions: null,
      scores: null,
      evidence: null,
    });
    expect(parseModelOutput(text)).toEqual({
      ok: true,
      value: { audio_quality: "no_speech", flags: [] },
    });
  });

  it("품질 불량이면 나머지 필드가 빠져 있어도 받아들인다", () => {
    expect(parseModelOutput(JSON.stringify({ audio_quality: "too_short", flags: [] }))).toEqual({
      ok: true,
      value: { audio_quality: "too_short", flags: [] },
    });
  });

  it("flags를 그대로 넘긴다", () => {
    const output = { ...example(), flags: ["profanity", "personal_info"] };
    const parsed = parseModelOutput(JSON.stringify(output));
    expect(parsed.ok && parsed.value.flags).toEqual(["profanity", "personal_info"]);
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
    ["알 수 없는 flag", { flags: ["hate"] }],
    ["알 수 없는 근거 종류", { evidence: [{ type: "grammar", quote: "뭇나", note: "" }] }],
    ["알 수 없는 품질 값", { audio_quality: "bad" }],
    ["flags 없음", { flags: undefined }],
  ])("형식이 다르면 schema_mismatch: %s", (_name, patch) => {
    const output = { ...example(), ...patch };
    expect(parseModelOutput(JSON.stringify(output))).toEqual({
      ok: false,
      problem: "schema_mismatch",
    });
  });

  it.each(["transcript", "regions", "scores", "evidence"])(
    "품질이 ok인데 %s가 null이면 missing_fields",
    (field) => {
      const output = { ...example(), [field]: null };
      expect(parseModelOutput(JSON.stringify(output))).toEqual({
        ok: false,
        problem: "missing_fields",
      });
    },
  );

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

  it("속성 이름이 4장 모델 출력 형식과 같다", () => {
    const properties = MODEL_OUTPUT_JSON_SCHEMA.properties as Record<string, SchemaNode>;
    expect(Object.keys(properties)).toEqual(Object.keys(SPEC_MODEL_OUTPUT_EXAMPLE));
    expect(Object.keys(properties.regions.properties as object)).toEqual([...REGION_KEYS]);
    expect(Object.keys(properties.scores.properties as object)).toEqual([...PART_KEYS]);
  });

  it("품질 불량일 때 비우는 필드는 null을 허용한다", () => {
    const properties = MODEL_OUTPUT_JSON_SCHEMA.properties as Record<string, SchemaNode>;
    for (const field of ["transcript", "regions", "scores", "evidence"]) {
      expect(properties[field].type).toContain("null");
    }
    expect(properties.audio_quality.type).toBe("string");
    expect(properties.flags.type).toBe("array");
  });
});
