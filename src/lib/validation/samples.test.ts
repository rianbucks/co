import { describe, expect, it } from "vitest";
import { parseCsv, parseRegionAnswer, parseSamples } from "./samples";

describe("parseCsv", () => {
  it("쉼표와 줄바꿈(LF, CRLF)으로 나눈다", () => {
    expect(parseCsv("a,b\r\n1,2\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("큰따옴표 안의 쉼표, 줄바꿈, 겹따옴표를 처리하고 BOM을 버린다", () => {
    expect(parseCsv('﻿file,note\n"a, b.webm","say ""hi""\nthere"')).toEqual([
      ["file", "note"],
      ["a, b.webm", 'say "hi"\nthere'],
    ]);
  });
});

describe("parseRegionAnswer", () => {
  it.each([
    ["gyeongsang", "gyeongsang"],
    ["Gyeongsang", "gyeongsang"],
    ["경상", "gyeongsang"],
    ["전라", "jeolla"],
    ["제주", "jeju"],
    ["서울경기", "seoul_gyeonggi"],
    ["서울·경기", "seoul_gyeonggi"],
    ["서울 / 경기", "seoul_gyeonggi"],
    ["표준어", "seoul_gyeonggi"],
  ])("'%s' → %s", (text, key) => {
    expect(parseRegionAnswer(text)).toBe(key);
  });

  it.each(["", "부산", "경북", "seoul"])("모르는 값은 null: '%s'", (text) => {
    expect(parseRegionAnswer(text)).toBeNull();
  });
});

describe("parseSamples", () => {
  it("머리글 순서와 대소문자에 상관없이 읽고 questionSetId는 set-a와 set-b를 받으며, 비우면 set-a로 두고 경고한다", () => {
    const csv = "Region,FILE,questionSetId\n경상,a.webm,\njeolla,b.m4a,set-b\n제주,c.webm,set-a\n\n";
    expect(parseSamples(csv)).toEqual({
      samples: [
        { row: 2, file: "a.webm", expected: "gyeongsang", questionSetId: "set-a" },
        { row: 3, file: "b.m4a", expected: "jeolla", questionSetId: "set-b" },
        { row: 4, file: "c.webm", expected: "jeju", questionSetId: "set-a" },
      ],
      errors: [],
      warnings: [
        "questionSetId가 빈 2행은 set-a(이전 4문항 구성)로 처리한다. 기본 세트(set-b, 6문항)로 녹음한 파일이면 set-b를 적는다.",
      ],
    });
  });

  it("questionSetId를 모두 적으면 경고가 없다", () => {
    expect(parseSamples("file,region,questionSetId\na.webm,경상,set-b\nb.webm,전라,set-a").warnings).toEqual([]);
  });

  it("questionSetId 열이 없어도 된다(모두 set-a로 두고 경고한다)", () => {
    const parsed = parseSamples("file,region\nc.wav,표준어\nd.wav,경상");
    expect(parsed.samples).toEqual([
      { row: 2, file: "c.wav", expected: "seoul_gyeonggi", questionSetId: "set-a" },
      { row: 3, file: "d.wav", expected: "gyeongsang", questionSetId: "set-a" },
    ]);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]).toContain("빈 2, 3행은 set-a");
  });

  it("잘못된 행은 행 번호와 함께 오류로 모은다", () => {
    expect(parseSamples("file,region\na.webm,부산\n,경상\nb.webm,제주").errors).toEqual([
      "2행: 알 수 없는 정답 권역 '부산'",
      "3행: file이 비어 있다",
    ]);
  });

  it("머리글에 file과 region이 없으면 오류", () => {
    expect(parseSamples("name,answer\na.webm,경상").errors).toEqual([
      "머리글에 file과 region이 있어야 한다",
    ]);
    expect(parseSamples("").errors).toEqual(["CSV가 비어 있다"]);
    expect(parseSamples("file,region\n").errors).toEqual(["샘플이 한 줄도 없다"]);
  });
});
