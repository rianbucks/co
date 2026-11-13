/**
 * 판정 파이프라인(명세 4장 처리 순서 2~5단계).
 * 서버 검사 → 호출 제한 → AI 호출(실패나 형식 오류면 1회 재시도) → 후처리 → 응답.
 * 오디오는 메모리에서 AI로 넘긴 뒤 버린다. 받아쓰기, 모델 출력, 음성은 로그에 남기지 않는다.
 */
import type { RateLimiter } from "../rate-limit";
import type { AiClient, AiRequest } from "./ai-client";
import { MAX_AUDIO_BYTES, detectAudioFormat } from "./audio";
import { errorResponse, rejectedResponse, type JudgeResponse } from "./contract";
import { createIssueInfo } from "./issue";
import { MODEL_OUTPUT_JSON_SCHEMA, parseModelOutput, type ModelOutput } from "./model-output";
import { buildJudgeResult, type IssueInfo } from "./postprocess";
import { USER_TEXT, buildSystemInstruction, findQuestionSet } from "./prompt";

/** 처음 1번 + 재시도 1번(명세 7장 502 ai_error). */
export const MAX_AI_ATTEMPTS = 2;

export interface AiTiming {
  /** 첫 시도의 제한 시간 */
  firstAttemptMs: number;
  /** 첫 시도와 재시도를 합친 제한 시간. S4 화면이 30초에 재시도 안내를 띄우므로 그 전에 끝낸다. */
  totalMs: number;
  /** 남은 시간이 이보다 짧으면 재시도하지 않는다. */
  minRetryMs: number;
}

/** 검증 단계에서 실제 응답 시간을 재고 조정한다. */
export const DEFAULT_AI_TIMING: AiTiming = {
  firstAttemptMs: 20_000,
  totalMs: 25_000,
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

export interface JudgeDeps {
  ai: AiClient;
  rateLimiter: RateLimiter;
  timing?: AiTiming;
  /** 밀리초 시계(테스트용) */
  now?: () => number;
  /** id, 문서번호, 발급 시각(테스트용) */
  issue?: () => IssueInfo;
  log?: JudgeLog;
}

const defaultLog: JudgeLog = (event, detail) => {
  console.warn(`[judge] ${event}`, detail);
};

function describeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { name: typeof error };
  const status = (error as { status?: unknown }).status;
  return {
    name: error.name,
    ...(typeof status === "number" ? { status } : {}),
    message: error.message.slice(0, 200),
  };
}

async function callAiWithRetry(
  request: Omit<AiRequest, "timeoutMs">,
  deps: JudgeDeps,
): Promise<ModelOutput | null> {
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
    try {
      const parsed = parseModelOutput(await deps.ai.generate({ ...request, timeoutMs }));
      if (parsed.ok) return parsed.value;
      log("ai_invalid_output", { attempt, problem: parsed.problem });
    } catch (error) {
      log("ai_call_failed", { attempt, ...describeError(error) });
    }
  }
  return null;
}

export async function judge(input: JudgeInput, deps: JudgeDeps): Promise<JudgeResponse> {
  const { audio, questionSetId } = input;

  // 서버 검사: 파일, 크기(2MB), 형식. 길이는 검사하지 않는다.
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
      responseSchema: MODEL_OUTPUT_JSON_SCHEMA,
    },
    deps,
  );
  if (!output) return errorResponse("ai_error");

  // 후처리: 품질 불량이면 결과 대신 재녹음 안내(422)
  if (output.audio_quality !== "ok") return rejectedResponse(output.audio_quality);

  const issue = deps.issue ?? (() => createIssueInfo(new Date()));
  return { status: 200, body: buildJudgeResult(output, issue()) };
}
