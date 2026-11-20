/**
 * 경상 정밀 감정 랭킹(명세 12장): 기존 농도 랭킹과 다른 키를 쓰는 별도 랭킹이다.
 * POST /api/gyeongsang-ranking  { judgmentId, nickname, origin } → 201 { entry }
 * GET  /api/gyeongsang-ranking?area=all|gyeongbuk|gyeongnam&limit=50[&id=gr_...] → 200 { area, entries, total, me }
 * 오류는 기존 랭킹과 같은 { error } (invalid_nickname, not_eligible은 reason 포함)
 */
import { isMockMode } from "@/lib/config";
import {
  listGsRanking,
  parseGsListQuery,
  registerGsRanking,
} from "@/lib/gyeongsang/ranking/service";
import { gsRankingStoreFromEnv } from "@/lib/gyeongsang/ranking/store";
import { clientIpFrom } from "@/lib/judge/request";
import { rankingError, toHttpResponse } from "@/lib/ranking/service";
import { RANKING_RATE_LIMIT, rateLimiterFromEnv } from "@/lib/rate-limit";

/** { judgmentId, nickname, origin }에 충분한 크기 */
const MAX_BODY_BYTES = 4 * 1024;

export async function GET(request: Request): Promise<Response> {
  try {
    // 요청 주소를 읽으므로 빌드 때 미리 만들지 않고 요청마다 실행된다.
    const query = parseGsListQuery(new URL(request.url).searchParams);
    if (!query) return toHttpResponse(rankingError({ error: "invalid_request" }));

    const store = gsRankingStoreFromEnv(process.env, { mock: isMockMode(process.env) });
    return toHttpResponse(await listGsRanking(query, store));
  } catch (error) {
    console.error("[gyeongsang-ranking] 조회 중 예외", error);
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
    // 등록 한도는 기존 랭킹 등록과 같은 제한기로 합쳐 센다.
    const mock = isMockMode(process.env);
    const outcome = await registerGsRanking(
      { body, clientIp: clientIpFrom(request.headers) },
      {
        mock,
        store: gsRankingStoreFromEnv(process.env, { mock }),
        rateLimiter: rateLimiterFromEnv(process.env, { mock, policy: RANKING_RATE_LIMIT }),
      },
    );
    return toHttpResponse(outcome);
  } catch (error) {
    console.error("[gyeongsang-ranking] 등록 중 예외", error);
    return toHttpResponse(rankingError({ error: "server_error" }));
  }
}
