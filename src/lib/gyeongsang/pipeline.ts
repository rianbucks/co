/**
 * 경상 정밀 감정 파이프라인(명세 12장). POST /api/judge에서 questionSetId가 set-gs일 때만 쓴다.
 * 서버 검사 → 호출 제한(일반 감정과 같은 한도를 함께 센다) → AI 호출(실패나 형식 오류면 대체 모델로 1회 재시도)
 * → 후처리 → 정밀 랭킹 등록 자격 기록 → 응답. 일반 감정의 처리 경로(../judge/pipeline.ts의 judge)와 응답 형식은 건드리지 않는다.
 *
 * 신고 원산지는 받지 않는다(정밀 랭킹에 등록할 때만 받는다). 오디오는 메모리에서 AI로 넘긴 뒤 버린다.
 */
import type { RateLimiter } from "../rate-limit";
import { MAX_AUDIO_BYTES, detectAudioFormat } from "../judge/audio";
import { callAiWithRetry, defaultLog, describeError, type AiRetryDeps } from "../judge/pipeline";
import type { IssueInfo } from "../judge/postprocess";
import { USER_TEXT } from "../judge/prompt";
import { NOT_GYEONGSANG, gsErrorResponse, gsRejectedResponse, type GsJudgeResponse } from "./contract";
import { createGsIssueInfo } from "./issue";
import { buildGsModelOutputSchema, parseGsModelOutput } from "./model-output";
import { buildGyeongsangResult } from "./postprocess";
import { buildGsSystemInstruction } from "./prompt";
import { GS_QUESTIONS } from "./questions";

export interface GsJudgeInput {
  /** multipart의 audio 값 */
  audio: FormDataEntryValue | null;
  clientIp: string | null;
}

/** 정밀 랭킹 등록 자격으로 남기는 감정 요약. 음성, 받아쓰기, 신고 원산지는 넣지 않는다. */
export interface GsJudgmentSummary {
  id: string;
  /** 경상 농도 */
  intensity: number;
  /** 경북권 비율(경남권은 100에서 뺀 값) */
  gyeongbuk: number;
  /** 녹음이 감정 결과를 지시하려 했는지(instructionAttempt). 랭킹에 올릴 수 없다. */
  instructionAttempt: boolean;
}

export interface GsJudgeDeps extends AiRetryDeps {
  /** 일반 감정과 같은 제한기를 넘긴다. 두 감정의 횟수를 합쳐 하루 한도를 센다. */
  rateLimiter: RateLimiter;
  /** id, 문서번호, 발급 시각(테스트용) */
  issue?: () => IssueInfo;
  /**
   * 성공한 정밀 감정의 요약을 저장한다(정밀 랭킹 등록 때 서버가 이 값을 읽는다).
   * 실패해도 감정 결과는 그대로 돌려주고 로그만 남긴다.
   */
  recordJudgment?: (summary: GsJudgmentSummary) => Promise<void>;
}

export async function judgeGyeongsang(input: GsJudgeInput, deps: GsJudgeDeps): Promise<GsJudgeResponse> {
  const { audio } = input;

  // 서버 검사: 파일, 크기(2MB), 형식. 일반 감정과 같다.
  if (audio === null || typeof audio === "string") return gsErrorResponse("invalid_audio");
  if (audio.size > MAX_AUDIO_BYTES) return gsErrorResponse("too_large");

  const bytes = new Uint8Array(await audio.arrayBuffer());
  const format = detectAudioFormat(bytes);
  if (!format) return gsErrorResponse("invalid_audio");

  // 호출 제한
  const limit = await deps.rateLimiter.check({ ip: input.clientIp });
  if (!limit.allowed) return gsErrorResponse("rate_limited");

  // AI 호출
  const questions = GS_QUESTIONS;
  const output = await callAiWithRetry(
    {
      systemInstruction: buildGsSystemInstruction(questions),
      userText: USER_TEXT,
      audio: bytes,
      mimeType: format.mimeType,
      responseSchema: buildGsModelOutputSchema(questions.length),
    },
    (text) => parseGsModelOutput(text, questions.length),
    deps,
  );
  if (!output) return gsErrorResponse("ai_error");

  // 품질 불량이거나 경상 방언으로 보기 어려우면 결과 대신 반려(422)
  if (output.audio_quality !== "ok") return gsRejectedResponse(output.audio_quality);
  if (output.not_gyeongsang) return gsRejectedResponse(NOT_GYEONGSANG);

  const issue = deps.issue ?? (() => createGsIssueInfo(new Date()));
  const result = buildGyeongsangResult(output, issue(), questions);

  if (deps.recordJudgment) {
    try {
      await deps.recordJudgment({
        id: result.id,
        intensity: result.intensity.score,
        gyeongbuk: result.subregions.gyeongbuk,
        instructionAttempt: result.instructionAttempt,
      });
    } catch (error) {
      (deps.log ?? defaultLog)("judgment_record_failed", describeError(error));
    }
  }

  return { status: 200, body: result };
}
