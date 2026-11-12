/**
 * POST /api/judge (명세 7장)
 * 요청: multipart/form-data, audio(파일), questionSetId
 * 응답: 200 결과 JSON, 오류는 { error } (422는 reason 포함)
 */
import { readConfig } from "@/lib/config";
import { createGeminiClient } from "@/lib/gemini";
import { MAX_AUDIO_BYTES } from "@/lib/judge/audio";
import { errorResponse, type JudgeResponse } from "@/lib/judge/contract";
import { mockAiClient } from "@/lib/judge/mock";
import { judge } from "@/lib/judge/pipeline";
import { clientIpFrom } from "@/lib/judge/request";
import { noopRateLimiter } from "@/lib/rate-limit";

// runtime은 지정하지 않는다. Cache Components가 켜져 있으면 쓸 수 없고, 기본값이 Node.js다.

/** 초 단위. AI 호출은 최대 25초 안에 끝나도록 잡았고, 업로드와 후처리 여유를 둔다. */
export const maxDuration = 60;

/** multipart 본문에서 파일 외 부분(경계 문자열, 헤더, questionSetId)에 주는 여유 */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

function toResponse(outcome: JudgeResponse): Response {
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

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return toResponse(errorResponse("invalid_audio"));
    }

    const outcome = await judge(
      {
        audio: form.get("audio"),
        questionSetId: form.get("questionSetId"),
        clientIp: clientIpFrom(request.headers),
      },
      {
        ai: config.config.mock ? mockAiClient : createGeminiClient(config.config.gemini),
        rateLimiter: noopRateLimiter,
      },
    );
    return toResponse(outcome);
  } catch (error) {
    console.error("[judge] 처리 중 예외", error);
    return toResponse(errorResponse("server_error"));
  }
}
