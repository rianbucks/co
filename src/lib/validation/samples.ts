/**
 * 정확도 검증용 정답 CSV 읽기.
 * 첫 줄은 머리글이다. file(필수), region(필수), questionSetId(선택, 비우면 set-a).
 * region에는 권역 키(gyeongsang)나 한글 이름(경상, 서울경기)을 쓴다. 표준어 화자는 '표준어'도 된다.
 */
import { REGION_KEYS, type RegionKey } from "../judge/contract";
import { REGION_NAMES } from "../judge/rules";

export const DEFAULT_QUESTION_SET_ID = "set-a";

export interface SampleRow {
  /** CSV에서 몇 번째 행인지(머리글이 1) */
  row: number;
  file: string;
  expected: RegionKey;
  questionSetId: string;
}

/** 큰따옴표로 감싼 칸 안의 쉼표, 줄바꿈, 겹따옴표("")를 처리하는 CSV 파서. 앞의 BOM은 버린다. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const REGION_ALIASES = new Map<string, RegionKey>([
  ...REGION_KEYS.map((key) => [key, key] as const),
  ...REGION_KEYS.map((key) => [REGION_NAMES[key], key] as const),
  ["표준어", "seoul_gyeonggi"],
]);

/** 정답 칸의 값을 권역 키로 바꾼다. 공백, 가운뎃점, 빗금은 무시한다(서울·경기 → 서울경기). */
export function parseRegionAnswer(text: string): RegionKey | null {
  const normalized = text.normalize("NFC").replace(/[\s·/]/gu, "").toLowerCase();
  return REGION_ALIASES.get(normalized) ?? null;
}

export function parseSamples(text: string): { samples: SampleRow[]; errors: string[] } {
  const rows = parseCsv(text)
    .map((cells, index) => ({ cells: cells.map((cell) => cell.trim()), row: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell !== ""));
  if (rows.length === 0) return { samples: [], errors: ["CSV가 비어 있다"] };

  const header = rows[0].cells.map((cell) => cell.toLowerCase());
  const fileIndex = header.indexOf("file");
  const regionIndex = header.indexOf("region");
  const setIndex = header.indexOf("questionsetid");
  if (fileIndex < 0 || regionIndex < 0) {
    return { samples: [], errors: ["머리글에 file과 region이 있어야 한다"] };
  }

  const samples: SampleRow[] = [];
  const errors: string[] = [];
  for (const { cells, row } of rows.slice(1)) {
    const file = cells[fileIndex] ?? "";
    const regionText = cells[regionIndex] ?? "";
    const expected = parseRegionAnswer(regionText);
    if (!file) errors.push(`${row}행: file이 비어 있다`);
    if (!expected) errors.push(`${row}행: 알 수 없는 정답 권역 '${regionText}'`);
    if (file && expected) {
      const questionSetId = (setIndex >= 0 ? cells[setIndex] : "") || DEFAULT_QUESTION_SET_ID;
      samples.push({ row, file, expected, questionSetId });
    }
  }
  if (samples.length === 0 && errors.length === 0) errors.push("샘플이 한 줄도 없다");
  return { samples, errors };
}
