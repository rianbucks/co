/**
 * 랭킹(음성 없음): 닉네임과 농도만 공개한다.
 * POST /api/ranking          { judgmentId, nickname } → 201 { entry }
 * GET  /api/ranking?limit=50[&id=r_...] → 200 { entries, total, me }
 * 오류는 { error } (invalid_nickname, not_eligible은 reason 포함)
 */
import { isMockMode } from "@/lib/config";
import { clientIpFrom } from "@/lib/judge/request";
import {
  listRanking,
  parseListQuery,
  rankingError,
  registerRanking,
  toHttpResponse,
} from "@/lib/ranking/service";
import { rankingStoreFromEnv } from "@/lib/ranking/store";
import { RANKING_RATE_LIMIT, rateLimiterFromEnv } from "@/lib/rate-limit";

/** { judgmentId, nickname }에 충분한 크기 */
const MAX_BODY_BYTES = 4 * 1024;

export async function GET(request: Request): Promise<Response> {
  try {
    // 요청 주소를 읽으므로 빌드 때 미리 만들지 않고 요청마다 실행된다.
    const query = parseListQuery(new URL(request.url).searchParams);
    if (!query) return toHttpResponse(rankingError({ error: "invalid_request" }));

    const store = rankingStoreFromEnv(process.env, { mock: isMockMode(process.env) });
    return toHttpResponse(await listRanking(query, store));
  } catch (error) {
    console.error("[ranking] 조회 중 예외", error);
    return toHttpResponse(rankingError({ error: "server_error" }));
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
      return toHttpResponse(rankingError({ error: "invalid_request" }));
    }

    let body: unknown;
    try {
      const text = await request.text();
      if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
        return toHttpResponse(rankingError({ error: "invalid_request" }));
      }
      body = JSON.parse(text);
    } catch {
      return toHttpResponse(rankingError({ error: "invalid_request" }));
    }

    // Production은 Upstash가 없으면 닫힌 상태로 실패한다(가짜 응답 모드는 등록을 받지 않으므로 예외).
    const mock = isMockMode(process.env);
    const outcome = await registerRanking(
      { body, clientIp: clientIpFrom(request.headers) },
      {
        mock,
        store: rankingStoreFromEnv(process.env, { mock }),
        rateLimiter: rateLimiterFromEnv(process.env, { mock, policy: RANKING_RATE_LIMIT }),
      },
    );
    return toHttpResponse(outcome);
  } catch (error) {
    console.error("[ranking] 등록 중 예외", error);
    return toHttpResponse(rankingError({ error: "server_error" }));
  }
}
