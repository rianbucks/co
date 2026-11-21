/**
 * 정확도 검증(명세 3장 검증 계획). 실제 Gemini를 부르므로 로컬에서 .env.local에 키를 넣고 실행한다.
 *
 *   npm run validate -- --csv validation/answers.csv --models gemini-3.8-flash,gemini-3.5-flash-lite --runs 3
 *
 * 운영과 같은 지시문, 문항, 출력 스키마, 후처리를 쓰되, 모델 자체를 재기 위해 재시도와 대체 모델 없이
 * 모델마다 한 번씩 부른다. 음성은 validation/samples/, 결과는 validation/results/에 두고 커밋하지 않는다.
 * 사용법은 validation/README.md에 있다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_THINKING_LEVEL,
  THINKING_LEVELS,
  type ThinkingLevel,
} from "../src/lib/config";
import { createGeminiClient } from "../src/lib/gemini";
import type { AiClient, AiUsage } from "../src/lib/judge/ai-client";
import { MAX_AUDIO_BYTES, detectAudioFormat, type GeminiAudioMime } from "../src/lib/judge/audio";
import { formatKstIso } from "../src/lib/judge/issue";
import { mockAiClient } from "../src/lib/judge/mock";
import { buildModelOutputSchema, parseModelOutput } from "../src/lib/judge/model-output";
import { buildJudgeResult, verifyEvidence } from "../src/lib/judge/postprocess";
import { USER_TEXT, buildSystemInstruction, findQuestionSet } from "../src/lib/judge/prompt";
import {
  summarize,
  toDetailsMarkdown,
  toRunsCsv,
  toSummaryMarkdown,
  type RunRecord,
} from "../src/lib/validation/report";
import { parseSamples, type SampleRow } from "../src/lib/validation/samples";

const HELP = `정확도 검증 (명세 3장)

사용법:
  npm run validate -- [옵션]

옵션:
  --csv <경로>         정답 CSV (기본 validation/answers.csv)
  --samples <폴더>     음성 파일 폴더 (기본 validation/samples)
  --out <폴더>         결과 폴더 (기본 validation/results)
  --models <a,b,...>   비교할 모델, 쉼표로 구분 (기본 GEMINI_MODEL 또는 ${DEFAULT_GEMINI_MODEL})
  --runs <n>           파일마다 모델별 반복 횟수 (기본 3)
  --thinking <수준>    사고 수준 ${THINKING_LEVELS.join(", ")} (기본 GEMINI_THINKING_LEVEL 또는 ${DEFAULT_THINKING_LEVEL})
  --timeout-ms <ms>    호출 한 번의 제한 시간 (기본 60000)
  --delay-ms <ms>      호출 사이 쉬는 시간 (기본 1000)
  --dry-run            Gemini 대신 가짜 응답으로 흐름만 확인 (키 불필요)
  -h, --help           이 도움말`;

interface PreparedSample extends SampleRow {
  audio: Uint8Array;
  mimeType: GeminiAudioMime;
  /** 녹음한 문항 세트(문항 순서) */
  questions: readonly string[];
  systemInstruction: string;
}

function fail(messages: string[]): never {
  for (const message of messages) console.error(`오류: ${message}`);
  process.exit(1);
}

function positiveInt(name: string, text: string): number {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) fail([`--${name}는 0 이상의 정수여야 한다: ${text}`]);
  return value;
}

function prepareSamples(samples: SampleRow[], samplesDir: string): PreparedSample[] {
  const prepared: PreparedSample[] = [];
  const errors: string[] = [];
  for (const sample of samples) {
    const filePath = path.resolve(samplesDir, sample.file);
    const questions = findQuestionSet(sample.questionSetId);
    if (!questions) {
      errors.push(`${sample.row}행: 등록되지 않은 questionSetId '${sample.questionSetId}'`);
      continue;
    }
    if (!existsSync(filePath)) {
      errors.push(`${sample.row}행: 파일이 없다 ${filePath}`);
      continue;
    }
    const audio = new Uint8Array(readFileSync(filePath));
    if (audio.length > MAX_AUDIO_BYTES) {
      errors.push(`${sample.row}행: 2MB를 넘는다(운영에서는 413) ${sample.file}`);
      continue;
    }
    const format = detectAudioFormat(audio);
    if (!format) {
      errors.push(`${sample.row}행: 지원하지 않는 형식이다 ${sample.file}`);
      continue;
    }
    prepared.push({
      ...sample,
      audio,
      mimeType: format.mimeType,
      questions,
      systemInstruction: buildSystemInstruction(questions),
    });
  }
  if (errors.length > 0) fail(errors);
  return prepared;
}

async function runOnce(
  client: AiClient,
  sample: PreparedSample,
  base: { model: string; run: number; timeoutMs: number },
): Promise<RunRecord> {
  const record = { file: sample.file, expected: sample.expected, model: base.model, run: base.run };
  let usage: AiUsage | undefined;
  const started = performance.now();
  let text: string;
  try {
    text = await client.generate({
      systemInstruction: sample.systemInstruction,
      userText: USER_TEXT,
      audio: sample.audio,
      mimeType: sample.mimeType,
      responseSchema: buildModelOutputSchema(sample.questions.length),
      timeoutMs: base.timeoutMs,
      onUsage: (value) => {
        usage = value;
      },
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return {
      ...record,
      status: "call_error",
      latencyMs: performance.now() - started,
      usage,
      error: message.slice(0, 300),
    };
  }
  const latencyMs = performance.now() - started;

  const parsed = parseModelOutput(text, sample.questions.length);
  if (!parsed.ok) return { ...record, status: "format_error", latencyMs, usage, error: parsed.problem };

  const output = parsed.value;
  if (output.audio_quality !== "ok") {
    return { ...record, status: "rejected", latencyMs, usage, quality: output.audio_quality };
  }

  const result = buildJudgeResult(output, { id: "-", certificateNo: "-", issuedAt: "-" }, sample.questions);
  return {
    ...record,
    status: "ok",
    latencyMs,
    usage,
    top: result.region.top,
    mixed: result.region.mixed,
    uncertain: result.region.uncertain,
    score: result.intensity.score,
    grade: result.intensity.grade,
    imitationSuspected: result.imitationSuspected,
    transcript: output.transcript,
    questionTranscripts: output.question_transcripts,
    // 운영과 같은 기준: 문항별 받아쓰기가 있으면 그 문항에서, 없으면 전체 받아쓰기에서 찾는다.
    evidence: output.evidence.map((item) => ({
      ...item,
      kept: verifyEvidence([item], output.transcript, output.question_transcripts).length === 1,
    })),
  };
}

function describe(record: RunRecord): string {
  switch (record.status) {
    case "ok":
      return `${record.top}${record.mixed ? "(혼합)" : ""}${record.uncertain ? "(유보)" : ""} ${record.score}점`;
    case "rejected":
      return `품질 반려 ${record.quality}`;
    default:
      return `${record.status} ${record.error ?? ""}`;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      csv: { type: "string", default: "validation/answers.csv" },
      samples: { type: "string", default: "validation/samples" },
      out: { type: "string", default: "validation/results" },
      models: { type: "string" },
      runs: { type: "string", default: "3" },
      thinking: { type: "string" },
      "timeout-ms": { type: "string", default: "60000" },
      "delay-ms": { type: "string", default: "1000" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }

  try {
    process.loadEnvFile(".env.local");
  } catch {
    // .env.local이 없으면 이미 설정된 환경 변수만 쓴다.
  }

  const dryRun = values["dry-run"];
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!dryRun && !apiKey) fail(["GEMINI_API_KEY가 없다. .env.local에 넣거나 --dry-run으로 흐름만 확인한다."]);

  const thinkingLevel = (values.thinking ??
    process.env.GEMINI_THINKING_LEVEL?.trim() ??
    DEFAULT_THINKING_LEVEL) as ThinkingLevel;
  if (!(THINKING_LEVELS as readonly string[]).includes(thinkingLevel)) {
    fail([`알 수 없는 사고 수준: ${thinkingLevel}`]);
  }
  const models = (values.models ?? process.env.GEMINI_MODEL?.trim() ?? DEFAULT_GEMINI_MODEL)
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const runs = positiveInt("runs", values.runs);
  const timeoutMs = positiveInt("timeout-ms", values["timeout-ms"]);
  const delayMs = positiveInt("delay-ms", values["delay-ms"]);
  if (models.length === 0 || runs === 0) fail(["모델과 반복 횟수가 하나 이상이어야 한다"]);

  if (!existsSync(values.csv)) fail([`정답 CSV가 없다: ${values.csv}`]);
  const parsed = parseSamples(readFileSync(values.csv, "utf8"));
  if (parsed.errors.length > 0) fail(parsed.errors);
  const samples = prepareSamples(parsed.samples, values.samples);

  const startedAt = formatKstIso(new Date());
  const outDir = path.resolve(values.out, startedAt.slice(0, 19).replace(/:/g, ""));
  const total = models.length * samples.length * runs;
  console.log(
    `샘플 ${samples.length}개 × 모델 ${models.length}개 × ${runs}회 = 호출 ${total}번` +
      (dryRun ? " (가짜 응답)" : ""),
  );

  const records: RunRecord[] = [];
  for (const model of models) {
    const client = dryRun
      ? mockAiClient
      : createGeminiClient({ apiKey, model, fallbackModel: model, thinkingLevel });
    for (const sample of samples) {
      for (let run = 1; run <= runs; run += 1) {
        if (records.length > 0 && delayMs > 0 && !dryRun) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        const record = await runOnce(client, sample, { model, run, timeoutMs });
        records.push(record);
        console.log(
          `[${records.length}/${total}] ${model} ${sample.file} ${run}회: ${describe(record)}` +
            ` (${(record.latencyMs / 1000).toFixed(1)}초)`,
        );
      }
    }
  }

  const summary = toSummaryMarkdown(summarize(records), {
    startedAt,
    csvPath: values.csv,
    sampleCount: samples.length,
    runs,
    thinkingLevel,
    timeoutMs,
    dryRun,
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "summary.md"), summary);
  writeFileSync(path.join(outDir, "runs.csv"), toRunsCsv(records));
  writeFileSync(path.join(outDir, "details.md"), toDetailsMarkdown(records));

  console.log(`\n${summary}`);
  console.log(`결과: ${path.relative(process.cwd(), outDir)}/ (summary.md, runs.csv, details.md)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
