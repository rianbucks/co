/**
 * POST /api/judge (명세 7장)
 * 요청: multipart/form-data, audio(파일), questionSetId
 * 응답: 200 결과 JSON, 오류는 { error } (422는 reason 포함)
 * questionSetId가 set-gs면 경상 정밀 감정(명세 12장)으로 처리한다. 그 밖의 값은 일반 감정 경로 그대로다.
 */
import { readConfig } from "@/lib/config";
import { createGeminiClient } from "@/lib/gemini";
import { MAX_AUDIO_BYTES } from "@/lib/judge/audio";
import { gsMockAiClient } from "@/lib/gyeongsang/mock";
import { judgeGyeongsang } from "@/lib/gyeongsang/pipeline";
import { GS_QUESTION_SET_ID } from "@/lib/gyeongsang/questions";
import { gsRankingStoreFromEnv } from "@/lib/gyeongsang/ranking/store";
import { errorResponse } from "@/lib/judge/contract";
import { mockAiClientFor } from "@/lib/judge/mock";
import { judge } from "@/lib/judge/pipeline";
import { clientIpFrom } from "@/lib/judge/request";
import { rankingStoreFromEnv } from "@/lib/ranking/store";
import { rateLimiterFromEnv } from "@/lib/rate-limit";

// runtime은 지정하지 않는다. Cache Components가 켜져 있으면 쓸 수 없고, 기본값이 Node.js다.

/**
 * 초 단위. 정적 값이어야 한다. AI 호출은 최대 40초(src/lib/judge/timing.ts의 AI_TOTAL_MS) 안에 끝나도록 잡았고,
 * 업로드, 호출 제한, 후처리 여유로 20초를 더 둔다. AI 전체 제한보다 커야 한다(테스트로 확인한다).
 */
export const maxDuration = 60;

/** multipart 본문에서 파일 외 부분(경계 문자열, 헤더, questionSetId)에 주는 여유 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function toResponse(outcome: { status: number; body: unknown }): Response {
  return Response.json(outcome.body, { status: outcome.status });
}

export async function POST(request: Request): Promise<Response> {
  try {
    // 본문을 읽기 전에 선언된 길이로 큰 요청을 먼저 거른다. 파일 크기는 judge에서 정확히 다시 본다.
    const declaredLength = Number(request.headers.get("content-length"));
    if (declaredLength > MAX_AUDIO_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return toResponse(errorResponse("too_large"));
    }

    const config = readConfig();
    if (!config.ok) {
      console.error(`[judge] 설정 오류: ${config.problem}`);
      return toResponse(errorResponse("server_error"));
    }

    // Production은 분산 저장소가 없으면 fail closed: AI 호출을 허용하지 않는다.
    // 가짜 응답 모드는 Gemini 비용이 없으므로 Upstash 없이도 받는다.
    const mock = config.config.mock;
    const rateLimiter = rateLimiterFromEnv(process.env, { mock });
    // 랭킹 등록 자격(농도, 지역, 등급)을 1시간 남긴다. 등록할 때 클라이언트가 보낸 점수 대신 이 값을 쓴다.
    const rankingStore = rankingStoreFromEnv(process.env, { mock });

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return toResponse(errorResponse("invalid_audio"));
    }

    // 경상 정밀 감정: 같은 제한기로 일반 감정과 횟수를 합쳐 센다.
    // 정밀 랭킹 등록 자격(경상 농도, 경북권 비율)은 기존 랭킹과 다른 저장소에 1시간 남긴다.
    if (form.get("questionSetId") === GS_QUESTION_SET_ID) {
      const gsRankingStore = gsRankingStoreFromEnv(process.env, { mock });
      const outcome = await judgeGyeongsang(
        { audio: form.get("audio"), clientIp: clientIpFrom(request.headers) },
        {
          ai: config.config.mock ? gsMockAiClient : createGeminiClient(config.config.gemini),
          rateLimiter,
          recordJudgment: ({ id, ...summary }) => gsRankingStore.saveJudgment(id, { ...summary, mock }),
        },
      );
      return toResponse(outcome);
    }

    const outcome = await judge(
      {
        audio: form.get("audio"),
        questionSetId: form.get("questionSetId"),
        clientIp: clientIpFrom(request.headers),
      },
      {
        // 가짜 응답은 녹음한 세트(set-a 4문항, set-b 6문항)의 문항 수에 맞춰 고른다.
        ai: config.config.mock
          ? mockAiClientFor(form.get("questionSetId"))
          : createGeminiClient(config.config.gemini),
        rateLimiter,
        recordJudgment: ({ id, ...summary }) =>
          rankingStore.saveJudgment(id, { ...summary, mock }),
      },
    );
    return toResponse(outcome);
  } catch (error) {
    console.error("[judge] 처리 중 예외", error);
    return toResponse(errorResponse("server_error"));
  }
}
