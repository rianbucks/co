/**
 * 정확도 검증 결과 집계(명세 3장 검증 계획).
 * 권역 정답률, 근거 진위(받아쓰기에 없어 걸러진 근거 수), 같은 파일의 일관성, 응답 시간, 토큰과 예상 비용.
 */
import type { AiUsage } from "../judge/ai-client";
import type { Grade, RegionKey } from "../judge/contract";
import { DEFAULT_AI_TIMING } from "../judge/pipeline";
import { REGION_NAMES } from "../judge/rules";

export type RunStatus = "ok" | "rejected" | "format_error" | "call_error";

export interface EvidenceCheck {
  /** 근거가 나온 문항 번호(모델이 준 값). 없거나 범위 밖이면 null */
  question?: number | null;
  type: string;
  /** 그 특징이 가리키는 권역(여섯 권역이나 common). 모델이 정해 둔 값으로 주지 않았으면 null */
  region?: string | null;
  quote: string;
  note: string;
  /** 그 문항의 받아쓰기(문항별 받아쓰기가 없으면 전체 받아쓰기)에 그대로 있어 근거 검증을 통과했는지 */
  kept: boolean;
}

/** 모델 호출 한 번의 결과 */
export interface RunRecord {
  file: string;
  /** 녹음한 문항 세트(set-a, set-b) */
  questionSetId: string;
  expected: RegionKey;
  model: string;
  run: number;
  status: RunStatus;
  latencyMs: number;
  usage?: AiUsage;
  /** status가 rejected일 때 audio_quality 값 */
  quality?: string;
  top?: RegionKey;
  mixed?: boolean;
  /** 판정 유보: 검증을 통과한 근거가 1순위 권역을 뒷받침하지 못함 */
  uncertain?: boolean;
  score?: number;
  grade?: Grade;
  /** 모사 의심(true면 score는 이미 절반으로 낮춘 값) */
  imitationSuspected?: boolean;
  evidence?: EvidenceCheck[];
  transcript?: string;
  /** 문항별 받아쓰기. 모델이 문항 수만큼 주지 않았으면 null */
  questionTranscripts?: string[] | null;
  error?: string;
}

/** 100만 토큰당 달러(명세 3장 표, 2026-11-12 확인. 3.8 Flash는 12/31까지 가격). */
export const PRICES_PER_MILLION_TOKENS: Readonly<Record<string, { input: number; output: number }>> =
  {
    "gemini-3.8-flash": { input: 0.75, output: 3.75 },
    "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
    "gemini-4-argon": { input: 2, output: 10 },
  };

/** 사고 토큰은 출력 단가로 따로 청구된다(Gemini thinking 문서). 가격을 모르는 모델이면 null. */
export function estimateCostUsd(model: string, usage: AiUsage | undefined): number | null {
  const price = PRICES_PER_MILLION_TOKENS[model];
  if (!price || !usage) return null;
  return (
    (usage.inputTokens * price.input + (usage.outputTokens + usage.thoughtTokens) * price.output) /
    1_000_000
  );
}

/** 가장 많이 나온 값. 1위가 둘 이상이면 null. */
export function mostCommon<T>(values: readonly T[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  let best: T | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** 오름차순으로 정렬된 값의 백분위(nearest-rank 방식). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new RangeError("값이 없다");
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/** 명세 3장 판단 기준(12개 중 8개 이상 / 5~7개 / 4개 이하)을 샘플 수에 비례해 적용한다. */
export function decisionFor(correctFiles: number, files: number): string {
  if (files === 0) return "판단할 샘플이 없음";
  if (correctFiles * 12 >= files * 8) return "오디오 직접 판정으로 진행 (12개 중 8개 이상)";
  if (correctFiles * 12 >= files * 5) return "유도 질문 비중을 늘림 (12개 중 5~7개)";
  return "받아쓰기의 어휘와 어미 중심으로 전환 (12개 중 4개 이하)";
}

export interface FileOutcome {
  file: string;
  expected: RegionKey;
  /** 호출 순서대로의 1순위 권역. 판정이 나오지 않은 호출은 null */
  tops: Array<RegionKey | null>;
  /** 판정이 나온 호출의 다수결. 1위가 둘 이상이면 null */
  majority: RegionKey | null;
  correct: boolean;
  /** 판정이 2번 이상 나왔을 때 모두 같은 권역인지. 비교할 수 없으면 null */
  consistent: boolean | null;
  /** 같은 파일 농도의 최대 - 최소. 판정이 2번 미만이면 null */
  scoreRange: number | null;
}

export interface ModelSummary {
  model: string;
  calls: number;
  judged: number;
  rejected: number;
  formatErrors: number;
  callErrors: number;
  correctRuns: number;
  files: FileOutcome[];
  correctFiles: number;
  consistentFiles: number;
  comparableFiles: number;
  avgScoreRange: number | null;
  evidenceTotal: number;
  evidenceDropped: number;
  latency: { avg: number; p50: number; p95: number; max: number };
  /** 운영의 첫 시도 제한 시간을 넘긴 호출 수 */
  overFirstAttemptLimit: number;
  avgUsage: AiUsage | null;
  avgCostUsd: number | null;
  decision: string;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeFile(file: string, records: readonly RunRecord[]): FileOutcome {
  const tops = records.map((record) => (record.status === "ok" ? (record.top ?? null) : null));
  const judgedTops = tops.filter((top): top is RegionKey => top !== null);
  const scores = records.flatMap((record) =>
    record.status === "ok" && record.score !== undefined ? [record.score] : [],
  );
  const majority = mostCommon(judgedTops);
  return {
    file,
    expected: records[0].expected,
    tops,
    majority,
    correct: majority !== null && majority === records[0].expected,
    consistent: judgedTops.length >= 2 ? judgedTops.every((top) => top === judgedTops[0]) : null,
    scoreRange: scores.length >= 2 ? Math.max(...scores) - Math.min(...scores) : null,
  };
}

function summarizeModel(model: string, records: readonly RunRecord[]): ModelSummary {
  const judged = records.filter((record) => record.status === "ok");
  const fileNames = [...new Set(records.map((record) => record.file))];
  const files = fileNames.map((file) =>
    summarizeFile(
      file,
      records.filter((record) => record.file === file),
    ),
  );
  const ranges = files.flatMap((file) => (file.scoreRange === null ? [] : [file.scoreRange]));
  const latencies = records.map((record) => record.latencyMs).sort((a, b) => a - b);
  const usages = records.flatMap((record) => (record.usage ? [record.usage] : []));
  const costs = records.flatMap((record) => {
    const cost = estimateCostUsd(model, record.usage);
    return cost === null ? [] : [cost];
  });
  const evidence = judged.flatMap((record) => record.evidence ?? []);
  const correctFiles = files.filter((file) => file.correct).length;

  return {
    model,
    calls: records.length,
    judged: judged.length,
    rejected: records.filter((record) => record.status === "rejected").length,
    formatErrors: records.filter((record) => record.status === "format_error").length,
    callErrors: records.filter((record) => record.status === "call_error").length,
    correctRuns: judged.filter((record) => record.top === record.expected).length,
    files,
    correctFiles,
    consistentFiles: files.filter((file) => file.consistent === true).length,
    comparableFiles: files.filter((file) => file.consistent !== null).length,
    avgScoreRange: ranges.length > 0 ? average(ranges) : null,
    evidenceTotal: evidence.length,
    evidenceDropped: evidence.filter((item) => !item.kept).length,
    latency: {
      avg: average(latencies),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies[latencies.length - 1],
    },
    overFirstAttemptLimit: records.filter(
      (record) => record.latencyMs > DEFAULT_AI_TIMING.firstAttemptMs,
    ).length,
    avgUsage:
      usages.length > 0
        ? {
            inputTokens: average(usages.map((usage) => usage.inputTokens)),
            outputTokens: average(usages.map((usage) => usage.outputTokens)),
            thoughtTokens: average(usages.map((usage) => usage.thoughtTokens)),
          }
        : null,
    avgCostUsd: costs.length > 0 ? average(costs) : null,
    decision: decisionFor(correctFiles, files.length),
  };
}

/** 모델별로 묶어 집계한다. 모델 순서는 기록에 처음 나온 순서다. */
export function summarize(records: readonly RunRecord[]): ModelSummary[] {
  const models = [...new Set(records.map((record) => record.model))];
  return models.map((model) =>
    summarizeModel(
      model,
      records.filter((record) => record.model === model),
    ),
  );
}

const RUN_COLUMNS = [
  "file",
  "question_set",
  "expected",
  "model",
  "run",
  "status",
  "quality",
  "top",
  "correct",
  "mixed",
  "uncertain",
  "score",
  "grade",
  "evidence_total",
  "evidence_dropped",
  "latency_ms",
  "input_tokens",
  "output_tokens",
  "thought_tokens",
  "est_cost_usd",
  "error",
];

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 호출 한 번마다 한 줄. 엑셀에서 한글이 깨지지 않도록 BOM을 붙인다. */
export function toRunsCsv(records: readonly RunRecord[]): string {
  const lines = [RUN_COLUMNS.join(",")];
  for (const record of records) {
    const judged = record.status === "ok";
    const evidence = record.evidence ?? [];
    const cost = estimateCostUsd(record.model, record.usage);
    lines.push(
      [
        record.file,
        record.questionSetId,
        record.expected,
        record.model,
        record.run,
        record.status,
        record.quality,
        record.top,
        judged ? record.top === record.expected : "",
        record.mixed,
        record.uncertain,
        record.score,
        record.grade,
        judged ? evidence.length : "",
        judged ? evidence.filter((item) => !item.kept).length : "",
        Math.round(record.latencyMs),
        record.usage?.inputTokens,
        record.usage?.outputTokens,
        record.usage?.thoughtTokens,
        cost === null ? "" : cost.toFixed(6),
        record.error,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `﻿${lines.join("\n")}\n`;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
const count = (value: number) => Math.round(value).toLocaleString("en-US");
const regionName = (key: RegionKey | null) => (key ? REGION_NAMES[key] : "판정 없음");

export interface ReportMeta {
  startedAt: string;
  csvPath: string;
  sampleCount: number;
  runs: number;
  thinkingLevel: string;
  timeoutMs: number;
  dryRun: boolean;
}

export function toSummaryMarkdown(summaries: readonly ModelSummary[], meta: ReportMeta): string {
  const lines: string[] = [
    "# 정확도 검증 결과",
    "",
    `- 시작: ${meta.startedAt}`,
    `- 정답 CSV: ${meta.csvPath} (샘플 ${meta.sampleCount}개, 모델마다 ${meta.runs}회)`,
    `- 사고 수준: ${meta.thinkingLevel}, 호출 제한 시간: ${seconds(meta.timeoutMs)}, 재시도와 대체 모델 없음`,
  ];
  if (meta.dryRun) {
    lines.push("- **가짜 응답(--dry-run)으로 돌린 결과다. 실제 모델 성능이 아니다.**");
  }

  const row = (label: string, cell: (summary: ModelSummary) => string) =>
    `| ${label} | ${summaries.map(cell).join(" | ")} |`;
  lines.push(
    "",
    "## 모델별 요약",
    "",
    `| 항목 | ${summaries.map((summary) => summary.model).join(" | ")} |`,
    `| --- | ${summaries.map(() => "---").join(" | ")} |`,
    row("권역 정답 (파일별 다수결)", (s) => `${s.correctFiles}/${s.files.length}`),
    row("권역 정답 (호출 기준)", (s) => `${s.correctRuns}/${s.judged}`),
    row("명세 3장 판단", (s) => s.decision),
    row("같은 파일 결과 일치", (s) => `${s.consistentFiles}/${s.comparableFiles}`),
    row("같은 파일 농도 차 평균", (s) =>
      s.avgScoreRange === null ? "-" : `${s.avgScoreRange.toFixed(1)}점`,
    ),
    row("받아쓰기에 없어 걸러진 근거", (s) => `${s.evidenceDropped}/${s.evidenceTotal}`),
    row(
      "판정 / 품질 반려 / 형식 오류 / 호출 실패",
      (s) => `${s.judged} / ${s.rejected} / ${s.formatErrors} / ${s.callErrors}`,
    ),
    row(
      "응답 시간 평균, p50, p95, 최대",
      (s) =>
        `${seconds(s.latency.avg)}, ${seconds(s.latency.p50)}, ${seconds(s.latency.p95)}, ${seconds(s.latency.max)}`,
    ),
    row(
      `${seconds(DEFAULT_AI_TIMING.firstAttemptMs)} 넘은 호출 (운영 첫 시도 제한)`,
      (s) => `${s.overFirstAttemptLimit}`,
    ),
    row("평균 토큰 (입력 / 출력 / 사고)", (s) =>
      s.avgUsage
        ? `${count(s.avgUsage.inputTokens)} / ${count(s.avgUsage.outputTokens)} / ${count(s.avgUsage.thoughtTokens)}`
        : "-",
    ),
    row("호출당 예상 비용", (s) => (s.avgCostUsd === null ? "-" : `$${s.avgCostUsd.toFixed(4)}`)),
  );

  lines.push(
    "",
    "## 파일별 1순위 권역",
    "",
    "✓는 다수결이 정답과 같은 파일이다.",
    "",
    `| 파일 | 정답 | ${summaries.map((summary) => summary.model).join(" | ")} |`,
    `| --- | --- | ${summaries.map(() => "---").join(" | ")} |`,
  );
  const fileNames = [...new Set(summaries.flatMap((s) => s.files.map((file) => file.file)))];
  for (const fileName of fileNames) {
    const outcomes = summaries.map((s) => s.files.find((file) => file.file === fileName));
    const expected = outcomes.find((outcome) => outcome)?.expected ?? null;
    const cells = outcomes.map((outcome) =>
      outcome ? `${outcome.tops.map(regionName).join(", ")} ${outcome.correct ? "✓" : "✗"}` : "-",
    );
    lines.push(`| ${fileName} | ${regionName(expected)} | ${cells.join(" | ")} |`);
  }

  lines.push(
    "",
    "근거가 실제 녹음에 있는지는 details.md의 받아쓰기와 근거를 녹음과 함께 들으며 확인한다.",
    "",
  );
  return lines.join("\n");
}

/** 호출마다 받아쓰기와 근거. 사람이 녹음을 들으며 근거의 진위를 확인하는 용도다. */
export function toDetailsMarkdown(records: readonly RunRecord[]): string {
  const lines = [
    "# 받아쓰기와 근거",
    "",
    "✓는 그 문항의 받아쓰기에 그대로 있어 통과한 근거, ✗는 없어 걸러진 근거다.",
    "문항별 받아쓰기가 없는 호출은 전체 받아쓰기로 확인한다.",
    "통과한 근거도 실제 녹음에 그 말이 있는지 들어서 확인한다.",
  ];
  for (const record of records) {
    lines.push("", `## ${record.file} · ${record.model} · ${record.run}회`, "");
    lines.push(
      `- 정답: ${REGION_NAMES[record.expected]}`,
      `- 문항 세트: ${record.questionSetId}`,
      `- 응답 시간: ${seconds(record.latencyMs)}`,
    );
    if (record.status === "ok" && record.top) {
      lines.push(
        `- 판정: ${REGION_NAMES[record.top]}${record.mixed ? " (혼합)" : ""}${record.uncertain ? " (판정 유보)" : ""}, 농도 ${record.score}점, ${record.grade}등급${record.imitationSuspected ? ", 모사 의심(농도 절반)" : ""}`,
        `- 받아쓰기: ${record.transcript ?? ""}`,
        ...(record.questionTranscripts
          ? [
              "- 문항별 받아쓰기:",
              ...record.questionTranscripts.map(
                (text, index) => `  - 문항 ${index + 1}: ${text || "(답 없음)"}`,
              ),
            ]
          : ["- 문항별 받아쓰기: 없음 (문항 수만큼 오지 않아 전체 받아쓰기로 근거를 확인)"]),
        "- 근거:",
        ...(record.evidence ?? []).map(
          (item) =>
            `  - ${item.kept ? "✓" : "✗"} ${item.question ? `문항 ${item.question} ` : ""}[${item.type}${item.region ? ` · ${item.region}` : ""}] "${item.quote}" — ${item.note}`,
        ),
      );
      if ((record.evidence ?? []).length === 0) lines.push("  - (없음)");
    } else if (record.status === "rejected") {
      lines.push(`- 품질 반려: ${record.quality}`);
    } else {
      lines.push(`- ${record.status === "format_error" ? "형식 오류" : "호출 실패"}: ${record.error}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
