import { describe, expect, it } from "vitest";
import {
  decisionFor,
  estimateCostUsd,
  mostCommon,
  percentile,
  summarize,
  toDetailsMarkdown,
  toRunsCsv,
  toSummaryMarkdown,
  type RunRecord,
} from "./report";

const usage = { inputTokens: 1_000, outputTokens: 200, thoughtTokens: 800 };

/** 모델 A: 파일 a(경상) 3회 중 2회 경상, 파일 b(제주)는 1회만 판정 */
const RECORDS: RunRecord[] = [
  {
    file: "a.webm",
    expected: "gyeongsang",
    model: "gemini-3.8-flash",
    run: 1,
    status: "ok",
    latencyMs: 4_000,
    usage,
    top: "gyeongsang",
    mixed: false,
    score: 68,
    grade: 4,
    transcript: "했다 아이가",
    evidence: [
      { type: "endings", quote: "했다 아이가", note: "확인 표현", kept: true },
      { type: "phonology", quote: "뭇나", note: "축약", kept: false },
    ],
  },
  {
    file: "a.webm",
    expected: "gyeongsang",
    model: "gemini-3.8-flash",
    run: 2,
    status: "ok",
    latencyMs: 6_000,
    usage,
    top: "gyeongsang",
    mixed: false,
    score: 70,
    grade: 4,
    evidence: [{ type: "endings", quote: "했다 아이가", note: "확인 표현", kept: true }],
  },
  {
    file: "a.webm",
    expected: "gyeongsang",
    model: "gemini-3.8-flash",
    run: 3,
    status: "ok",
    latencyMs: 21_000,
    usage,
    top: "jeolla",
    mixed: true,
    score: 60,
    grade: 4,
    evidence: [],
  },
  {
    file: "b.m4a",
    expected: "jeju",
    model: "gemini-3.8-flash",
    run: 1,
    status: "ok",
    latencyMs: 5_000,
    top: "jeju",
    mixed: false,
    score: 50,
    grade: 3,
    evidence: [],
  },
  {
    file: "b.m4a",
    expected: "jeju",
    model: "gemini-3.8-flash",
    run: 2,
    status: "rejected",
    latencyMs: 3_000,
    quality: "noisy",
  },
  {
    file: "b.m4a",
    expected: "jeju",
    model: "gemini-3.8-flash",
    run: 3,
    status: "call_error",
    latencyMs: 60_000,
    error: 'timeout, "60s"',
  },
  {
    file: "a.webm",
    expected: "gyeongsang",
    model: "unknown-model",
    run: 1,
    status: "format_error",
    latencyMs: 2_000,
    usage,
    error: "schema_mismatch",
  },
];

describe("mostCommon", () => {
  it("가장 많이 나온 값을 고르고, 1위가 둘 이상이거나 비었으면 null", () => {
    expect(mostCommon(["a", "b", "a"])).toBe("a");
    expect(mostCommon(["a", "b"])).toBeNull();
    expect(mostCommon(["a", "b", "c"])).toBeNull();
    expect(mostCommon([])).toBeNull();
  });
});

describe("percentile", () => {
  it("nearest-rank 방식", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile([7], 95)).toBe(7);
  });
});

describe("decisionFor: 명세 3장 판단 기준", () => {
  it.each([
    [8, "오디오 직접 판정으로 진행"],
    [12, "오디오 직접 판정으로 진행"],
    [7, "유도 질문 비중을 늘림"],
    [5, "유도 질문 비중을 늘림"],
    [4, "받아쓰기의 어휘와 어미 중심으로 전환"],
    [0, "받아쓰기의 어휘와 어미 중심으로 전환"],
  ])("12개 중 %i개 정답 → %s", (correct, decision) => {
    expect(decisionFor(correct, 12)).toContain(decision);
  });

  it("샘플 수가 12개가 아니면 비율로 적용한다", () => {
    expect(decisionFor(2, 3)).toContain("진행");
    expect(decisionFor(1, 2)).toContain("유도 질문");
    expect(decisionFor(0, 0)).toBe("판단할 샘플이 없음");
  });
});

describe("estimateCostUsd", () => {
  it("사고 토큰을 출력 단가로 더한다", () => {
    // 3.8 Flash: 1,000 × 0.75 + (200 + 800) × 3.75 = 4,500 (100만 토큰당 달러 단위)
    expect(estimateCostUsd("gemini-3.8-flash", usage)).toBeCloseTo(0.0045, 10);
  });

  it("가격을 모르는 모델이나 사용량이 없으면 null", () => {
    expect(estimateCostUsd("unknown-model", usage)).toBeNull();
    expect(estimateCostUsd("gemini-3.8-flash", undefined)).toBeNull();
  });
});

describe("summarize", () => {
  const [flash, unknown] = summarize(RECORDS);

  it("모델을 기록에 처음 나온 순서대로 묶는다", () => {
    expect(flash.model).toBe("gemini-3.8-flash");
    expect(unknown.model).toBe("unknown-model");
  });

  it("파일별 다수결과 호출 기준 정답을 센다", () => {
    expect(flash.files.map((file) => [file.file, file.majority, file.correct])).toEqual([
      ["a.webm", "gyeongsang", true],
      ["b.m4a", "jeju", true],
    ]);
    expect(flash.correctFiles).toBe(2);
    expect([flash.correctRuns, flash.judged]).toEqual([3, 4]);
  });

  it("판정이 2번 이상인 파일만 일관성을 비교한다", () => {
    expect(flash.files.map((file) => [file.consistent, file.scoreRange])).toEqual([
      [false, 10],
      [null, null],
    ]);
    expect([flash.consistentFiles, flash.comparableFiles, flash.avgScoreRange]).toEqual([0, 1, 10]);
  });

  it("상태별 호출 수, 걸러진 근거, 응답 시간, 토큰, 비용을 낸다", () => {
    expect([flash.calls, flash.judged, flash.rejected, flash.formatErrors, flash.callErrors]).toEqual(
      [6, 4, 1, 0, 1],
    );
    expect([flash.evidenceDropped, flash.evidenceTotal]).toEqual([1, 3]);
    expect(flash.latency).toEqual({ avg: 16_500, p50: 5_000, p95: 60_000, max: 60_000 });
    expect(flash.overFirstAttemptLimit).toBe(2);
    expect(flash.avgUsage).toEqual(usage);
    expect(flash.avgCostUsd).toBeCloseTo(0.0045, 10);
    expect(unknown.avgCostUsd).toBeNull();
    expect(unknown.decision).toContain("전환");
  });
});

describe("출력 파일", () => {
  it("runs.csv는 BOM과 머리글로 시작하고 쉼표나 따옴표가 든 칸을 감싼다", () => {
    const csv = toRunsCsv(RECORDS);
    expect(csv.startsWith("﻿file,expected,model,run,status")).toBe(true);
    expect(csv).toContain(',"timeout, ""60s"""\n');
    expect(csv.trim().split("\n")).toHaveLength(RECORDS.length + 1);
  });

  it("summary.md에 모델별 요약과 파일별 결과가 있다", () => {
    const summary = toSummaryMarkdown(summarize(RECORDS), {
      startedAt: "2026-11-16T10:00:00+09:00",
      csvPath: "validation/answers.csv",
      sampleCount: 2,
      runs: 3,
      thinkingLevel: "medium",
      timeoutMs: 60_000,
      dryRun: true,
    });
    expect(summary).toContain("| 항목 | gemini-3.8-flash | unknown-model |");
    expect(summary).toContain("| 권역 정답 (파일별 다수결) | 2/2 | 0/1 |");
    expect(summary).toContain("| a.webm | 경상 | 경상, 경상, 전라 ✓ | 판정 없음 ✗ |");
    expect(summary).toContain("| b.m4a | 제주 | 제주, 판정 없음, 판정 없음 ✓ | - |");
    expect(summary).toContain("가짜 응답(--dry-run)");
  });

  it("details.md에 받아쓰기, 통과·걸러진 근거, 반려와 오류가 있다", () => {
    const details = toDetailsMarkdown(RECORDS);
    expect(details).toContain('  - ✓ [endings] "했다 아이가" — 확인 표현');
    expect(details).toContain('  - ✗ [phonology] "뭇나" — 축약');
    expect(details).toContain("- 품질 반려: noisy");
    expect(details).toContain('- 호출 실패: timeout, "60s"');
    expect(details).toContain("- 형식 오류: schema_mismatch");
    expect(details).toContain("- 문항별 받아쓰기: 없음 (문항 수만큼 오지 않아 전체 받아쓰기로 근거를 확인)");
  });

  it("문항별 받아쓰기가 있으면 문항마다 적고, 근거에 문항 번호를 붙인다", () => {
    const details = toDetailsMarkdown([
      {
        file: "c.webm",
        expected: "gyeongsang",
        model: "gemini-3.8-flash",
        run: 1,
        status: "ok",
        latencyMs: 5_000,
        top: "gyeongsang",
        mixed: false,
        score: 68,
        grade: 4,
        transcript: "억수로 오랜만이네 뭐 했노",
        questionTranscripts: ["억수로 오랜만이네", "뭐 했노", "", ""],
        evidence: [
          { question: 1, type: "vocabulary", quote: "억수로", note: "아주", kept: true },
          { question: 1, type: "endings", quote: "뭐 했노", note: "다른 문항", kept: false },
        ],
      },
    ]);
    expect(details).toContain(
      ["- 문항별 받아쓰기:", "  - 문항 1: 억수로 오랜만이네", "  - 문항 2: 뭐 했노", "  - 문항 3: (답 없음)", "  - 문항 4: (답 없음)"].join("\n"),
    );
    expect(details).toContain('  - ✓ 문항 1 [vocabulary] "억수로" — 아주');
    expect(details).toContain('  - ✗ 문항 1 [endings] "뭐 했노" — 다른 문항');
  });
});
