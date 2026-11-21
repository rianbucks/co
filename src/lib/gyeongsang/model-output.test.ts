import { describe, expect, it } from "vitest";
import { PART_KEYS } from "../judge/contract";
import { SUBREGION_KEYS } from "./contract";
import { GS_MOCK_MODEL_OUTPUT } from "./mock";
import { buildGsModelOutputSchema, parseGsModelOutput } from "./model-output";

/** set-gs는 문항 4개 */
const QUESTION_COUNT = 4;
const parse = (value: unknown) => parseGsModelOutput(JSON.stringify(value), QUESTION_COUNT);
const example = () => JSON.parse(JSON.stringify(GS_MOCK_MODEL_OUTPUT));
const SCHEMA = buildGsModelOutputSchema(QUESTION_COUNT);

describe("parseGsModelOutput", () => {
  it("가짜 출력(경상 방언 확인)을 그대로 받아들인다", () => {
    expect(parse(GS_MOCK_MODEL_OUTPUT)).toEqual({ ok: true, value: example() });
  });

  it("품질 불량이면 audio_quality만 남긴다(이전 형식으로 flags가 와도 무시한다)", () => {
    const value = {
      audio_quality: "noisy",
      flags: ["profanity"],
      transcript: null,
      question_transcripts: null,
      not_gyeongsang: null,
      subregions: null,
      scores: null,
      evidence: null,
    };
    expect(parse(value)).toEqual({ ok: true, value: { audio_quality: "noisy" } });
    expect(parse({ audio_quality: "too_short" })).toEqual({
      ok: true,
      value: { audio_quality: "too_short" },
    });
  });

  it("not_gyeongsang이 true면 나머지 필드가 null이거나 없어도 받아들이고 경상 방언 미확인으로 남긴다", () => {
    const nulls = {
      audio_quality: "ok",
      transcript: "그래서 내가 거기 갔거든요",
      question_transcripts: null,
      not_gyeongsang: true,
      subregions: null,
      scores: null,
      evidence: null,
    };
    const expected = { ok: true, value: { audio_quality: "ok", not_gyeongsang: true } };
    expect(parse(nulls)).toEqual(expected);
    expect(parse({ audio_quality: "ok", not_gyeongsang: true })).toEqual(expected);
  });

  it("not_gyeongsang이 true면 다른 필드가 채워져 있어도 정밀 감정하지 않는다", () => {
    expect(parse({ ...example(), not_gyeongsang: true })).toEqual({
      ok: true,
      value: { audio_quality: "ok", not_gyeongsang: true },
    });
  });

  it.each([false, null, undefined, "true", 1])(
    "not_gyeongsang이 true가 아니면(%s) 실패하지 않고 경상 방언으로 읽는다",
    (flag) => {
      const result = parse({ ...example(), not_gyeongsang: flag });
      expect(result).toMatchObject({ ok: true, value: { not_gyeongsang: false, subregions: { gyeongbuk: 64 } } });
    },
  );

  it("JSON이 아니면 invalid_json", () => {
    expect(parseGsModelOutput("{not json", QUESTION_COUNT)).toEqual({ ok: false, problem: "invalid_json" });
  });

  it.each([
    ["알 수 없는 품질 값", { audio_quality: "silent" }],
    ["범위를 벗어난 성분 비율", { subregions: { gyeongbuk: 101, gyeongnam: 0 } }],
    ["정수가 아닌 성분 비율", { subregions: { gyeongbuk: 60.5, gyeongnam: 39.5 } }],
    ["성분 키 누락", { subregions: { gyeongbuk: 100 } }],
    ["범위를 벗어난 항목 점수", { scores: { vocabulary: -1, endings: 0, phonology: 0, intonation: 0 } }],
    ["인용이 문자열이 아닌 근거", { evidence: [{ question: 1, quote: 3, note: "설명" }] }],
  ])("형식이 맞지 않으면 schema_mismatch: %s", (_, patch) => {
    expect(parse({ ...example(), ...patch })).toEqual({ ok: false, problem: "schema_mismatch" });
  });

  it.each(["transcript", "subregions", "scores", "evidence"])(
    "경상 방언인데 %s가 null이면 missing_fields",
    (field) => {
      expect(parse({ ...example(), [field]: null })).toEqual({ ok: false, problem: "missing_fields" });
    },
  );

  it("성분 비율이 모두 0이면 zero_probabilities", () => {
    expect(parse({ ...example(), subregions: { gyeongbuk: 0, gyeongnam: 0 } })).toEqual({
      ok: false,
      problem: "zero_probabilities",
    });
  });

  it("문항별 받아쓰기가 문항 수만큼의 문자열 배열이 아니면 null로 두고 실패시키지 않는다", () => {
    for (const value of [null, undefined, ["하나", "둘"], ["가", "나", "다", 4], "문자열"]) {
      const result = parse({ ...example(), question_transcripts: value });
      expect(result).toMatchObject({ ok: true, value: { question_transcripts: null } });
    }
  });

  it("근거의 문항 번호가 1~문항 수의 정수가 아니면 null로 둔다. 근거에 항목(type)이 있어도 버린다", () => {
    const evidence = [
      { question: 0, quote: "갈 끼라", note: "a" },
      { question: 5, quote: "갈 끼라", note: "b" },
      { question: 1.5, quote: "갈 끼라", note: "c" },
      { question: "1", quote: "갈 끼라", note: "d" },
      { quote: "갈 끼라", note: "e" },
      { question: 4, type: "endings", quote: "주이소", note: "f" },
    ];
    const result = parse({ ...example(), evidence });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok || result.value.audio_quality !== "ok" || result.value.not_gyeongsang) throw new Error("unreachable");
    expect(result.value.evidence).toEqual([
      { question: null, quote: "갈 끼라", note: "a" },
      { question: null, quote: "갈 끼라", note: "b" },
      { question: null, quote: "갈 끼라", note: "c" },
      { question: null, quote: "갈 끼라", note: "d" },
      { question: null, quote: "갈 끼라", note: "e" },
      { question: 4, quote: "주이소", note: "f" },
    ]);
  });
});

/** 공식 문서(Structured outputs > JSON schema support)에 지원한다고 적힌 키워드. 일반 감정의 테스트와 같다. */
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

describe("buildGsModelOutputSchema", () => {
  it("문서에 적힌 지원 키워드만 쓴다", () => {
    const unknown: string[] = [];
    walk(SCHEMA, "$", (node, path) => {
      for (const key of Object.keys(node)) {
        if (!DOCUMENTED_KEYWORDS.has(key)) unknown.push(`${path}.${key}`);
      }
    });
    expect(unknown).toEqual([]);
  });

  it("객체의 모든 속성을 required로 둔다(문서 권고)", () => {
    walk(SCHEMA, "$", (node) => {
      if (node.properties) {
        expect(new Set(node.required as string[])).toEqual(new Set(Object.keys(node.properties as object)));
      }
    });
  });

  it("받아쓰기 다음에 경상 방언 여부와 성분을 쓰고, 속성 이름은 가짜 출력과 같다", () => {
    const properties = SCHEMA.properties as Record<string, SchemaNode>;
    expect(Object.keys(properties)).toEqual([
      "audio_quality",
      "transcript",
      "question_transcripts",
      "not_gyeongsang",
      "subregions",
      "scores",
      "evidence",
    ]);
    expect(Object.keys(properties)).toEqual(Object.keys(GS_MOCK_MODEL_OUTPUT));
    expect(Object.keys(properties.subregions.properties as object)).toEqual([...SUBREGION_KEYS]);
    expect(Object.keys(properties.scores.properties as object)).toEqual([...PART_KEYS]);
  });

  it("성분 설명에 경북권(대구·경북)과 경남권(부산·울산·경남)이 드러난다", () => {
    const subregions = (SCHEMA.properties as Record<string, SchemaNode>).subregions.properties as Record<
      string,
      SchemaNode
    >;
    expect(subregions.gyeongbuk.description).toBe("경북권(대구·경북)");
    expect(subregions.gyeongnam.description).toBe("경남권(부산·울산·경남)");
  });

  it("근거는 문항 번호, 인용, 설명만 받고 문항 번호는 1~문항 수다", () => {
    const properties = SCHEMA.properties as Record<string, SchemaNode>;
    const item = properties.evidence.items as SchemaNode;
    expect(Object.keys(item.properties as object)).toEqual(["question", "quote", "note"]);
    expect((item.properties as Record<string, SchemaNode>).question).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 4,
    });
    expect(properties.question_transcripts).toMatchObject({ items: { type: "string" }, minItems: 4, maxItems: 4 });
  });

  it("품질 불량이나 경상 방언 미확인일 때 비우는 필드는 null을 허용한다", () => {
    const properties = SCHEMA.properties as Record<string, SchemaNode>;
    for (const field of [
      "transcript",
      "question_transcripts",
      "not_gyeongsang",
      "subregions",
      "scores",
      "evidence",
    ]) {
      expect(properties[field].type).toContain("null");
    }
    expect(properties.not_gyeongsang.type).toEqual(["boolean", "null"]);
  });
});
