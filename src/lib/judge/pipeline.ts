/**
 * 판정 파이프라인(명세 4장 처리 순서 2~5단계).
 * 서버 검사 → 호출 제한 → AI 호출(실패나 형식 오류면 대체 모델로 1회 재시도) → 후처리
 * → 랭킹 등록 자격 기록 → 응답.
 * 오디오는 메모리에서 AI로 넘긴 뒤 버린다. 받아쓰기, 모델 출력, 음성은 로그에 남기지 않는다.
 */
import type { RateLimiter } from "../rate-limit";
import type { AiClient, AiRequest } from "./ai-client";
import { MAX_AUDIO_BYTES, detectAudioFormat } from "./audio";
import {
  errorResponse,
  rejectedResponse,
  type Grade,
  type JudgeResponse,
  type RegionKey,
} from "./contract";
import { createIssueInfo } from "./issue";
import { buildModelOutputSchema, parseModelOutput } from "./model-output";
import { buildJudgeResult, type IssueInfo } from "./postprocess";
import { USER_TEXT, buildSystemInstruction } from "./prompt";
import { findQuestionSet } from "./questions";
import { AI_FIRST_ATTEMPT_MS, AI_TOTAL_MS } from "./timing";

/** 처음 1번은 주 모델, 재시도 1번은 대체 모델(명세 7장 502 ai_error, 11장). */
export const MAX_AI_ATTEMPTS = 2;

export interface AiTiming {
  /** 첫 시도의 제한 시간 */
  firstAttemptMs: number;
  /** 첫 시도와 재시도를 합친 제한 시간. S4 화면이 45초에 재시도 안내를 띄우므로 그 전에 끝낸다. */
  totalMs: number;
  /** 남은 시간이 이보다 짧으면 재시도하지 않는다. */
  minRetryMs: number;
}

/** 첫 시도 25초, 전체 40초(./timing.ts). 검증 단계에서 실제 응답 시간을 재고 조정한다. */
export const DEFAULT_AI_TIMING: AiTiming = {
  firstAttemptMs: AI_FIRST_ATTEMPT_MS,
  totalMs: AI_TOTAL_MS,
  minRetryMs: 1_000,
};

export interface JudgeInput {
  /** multipart의 audio 값 */
  audio: FormDataEntryValue | null;
  /** multipart의 questionSetId 값 */
  questionSetId: FormDataEntryValue | null;
  clientIp: string | null;
}

export type JudgeLog = (event: string, detail: Record<string, unknown>) => void;

/** 랭킹 등록 자격으로 남기는 감정 요약. 음성과 받아쓰기는 넣지 않는다. */
export interface JudgmentSummary {
  id: string;
  intensity: number;
  /** 1순위 권역 */
  region: RegionKey;
  grade: Grade;
  /** 판정 유보 결과인지(region.uncertain). 랭킹에 올릴 수 없다. */
  uncertain: boolean;
  /** 녹음이 감정 결과를 지시하려 했는지(instructionAttempt). 랭킹에 올릴 수 없다. */
  instructionAttempt: boolean;
}

export interface JudgeDeps {
  ai: AiClient;
  rateLimiter: RateLimiter;
  timing?: AiTiming;
  /** 밀리초 시계(테스트용) */
  now?: () => number;
  /** id, 문서번호, 발급 시각(테스트용) */
  issue?: () => IssueInfo;
  log?: JudgeLog;
  /**
   * 성공한 감정의 요약을 저장한다(랭킹 등록 때 서버가 이 값을 읽는다).
   * 실패해도 감정 결과는 그대로 돌려주고 로그만 남긴다.
   */
  recordJudgment?: (summary: JudgmentSummary) => Promise<void>;
}

/** 기본 로그. 경상 정밀 감정 파이프라인(../gyeongsang/pipeline.ts)도 쓴다. */
export const defaultLog: JudgeLog = (event, detail) => {
  console.warn(`[judge] ${event}`, detail);
};

/** 예외를 로그에 남길 수 있는 값으로 줄인다(이름, HTTP 상태, 메시지 앞 200자). */
export function describeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { name: typeof error };
  const status = (error as { status?: unknown }).status;
  return {
    name: error.name,
    ...(typeof status === "number" ? { status } : {}),
    message: error.message.slice(0, 200),
  };
}

/** 모델 출력 검증 결과. 실패면 problem(형식 오류의 종류)을 로그에만 남긴다. */
export type AiParseResult<T> = { ok: true; value: T } | { ok: false; problem: string };

/** AI 호출과 재시도에 쓰는 값. 일반 감정과 경상 정밀 감정(../gyeongsang/pipeline.ts)이 함께 쓴다. */
export type AiRetryDeps = Pick<JudgeDeps, "ai" | "timing" | "now" | "log">;

/**
 * AI를 부르고 parse로 출력을 검증한다. 호출이 실패하거나 형식 오류면 대체 모델로 1회 재시도하고,
 * 그래도 안 되면 null이다. 첫 시도와 재시도를 합쳐 timing.totalMs 안에 끝낸다.
 */
export async function callAiWithRetry<T>(
  request: Omit<AiRequest, "timeoutMs">,
  parse: (text: string) => AiParseResult<T>,
  deps: AiRetryDeps,
): Promise<T | null> {
  const timing = deps.timing ?? DEFAULT_AI_TIMING;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? defaultLog;
  const deadline = now() + timing.totalMs;

  for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt += 1) {
    const remaining = deadline - now();
    if (attempt > 1 && remaining < timing.minRetryMs) {
      log("ai_retry_skipped", { remainingMs: remaining });
      break;
    }

    const timeoutMs = attempt === 1 ? Math.min(timing.firstAttemptMs, remaining) : remaining;
    const useFallbackModel = attempt > 1;
    const model = useFallbackModel ? "fallback" : "primary";
    try {
      const parsed = parse(await deps.ai.generate({ ...request, timeoutMs, useFallbackModel }));
      if (parsed.ok) return parsed.value;
      log("ai_invalid_output", { attempt, model, problem: parsed.problem });
    } catch (error) {
      log("ai_call_failed", { attempt, model, ...describeError(error) });
    }
  }
  return null;
}

export async function judge(input: JudgeInput, deps: JudgeDeps): Promise<JudgeResponse> {
  const { audio, questionSetId } = input;

  // 서버 검사: 파일, 크기(2MB), 형식. 녹음 길이(문항당 10초, set-b 합계 60초)는 화면에서 지키므로 검사하지 않는다.
  if (audio === null || typeof audio === "string") return errorResponse("invalid_audio");
  if (audio.size > MAX_AUDIO_BYTES) return errorResponse("too_large");

  const bytes = new Uint8Array(await audio.arrayBuffer());
  const format = detectAudioFormat(bytes);
  if (!format) return errorResponse("invalid_audio");

  const questions = typeof questionSetId === "string" ? findQuestionSet(questionSetId) : null;
  if (!questions) return errorResponse("invalid_request");

  // 호출 제한
  const limit = await deps.rateLimiter.check({ ip: input.clientIp });
  if (!limit.allowed) return errorResponse("rate_limited");

  // AI 호출
  const output = await callAiWithRetry(
    {
      systemInstruction: buildSystemInstruction(questions),
      userText: USER_TEXT,
      audio: bytes,
      mimeType: format.mimeType,
      responseSchema: buildModelOutputSchema(questions.length),
    },
    (text) => parseModelOutput(text, questions.length),
    deps,
  );
  if (!output) return errorResponse("ai_error");

  // 후처리: 품질 불량이면 결과 대신 재녹음 안내(422)
  if (output.audio_quality !== "ok") return rejectedResponse(output.audio_quality);

  const issue = deps.issue ?? (() => createIssueInfo(new Date()));
  const result = buildJudgeResult(output, issue(), questions);

  if (deps.recordJudgment) {
    try {
      await deps.recordJudgment({
        id: result.id,
        intensity: result.intensity.score,
        region: result.region.top,
        grade: result.intensity.grade,
        uncertain: result.region.uncertain,
        instructionAttempt: result.instructionAttempt,
      });
    } catch (error) {
      (deps.log ?? defaultLog)("judgment_record_failed", describeError(error));
    }
  }

  return { status: 200, body: result };
}
