/**
 * Upstash Redis REST 연결 정보.
 * Vercel Marketplace로 연결하면 KV_REST_API_URL, KV_REST_API_TOKEN이 들어온다.
 * UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN 중 하나라도 있으면 그 쌍을 먼저 쓴다.
 * 출처가 다른 주소와 토큰이 섞이지 않도록 쌍 단위로 고른다.
 * 읽기 전용 토큰(KV_REST_API_READ_ONLY_TOKEN)은 쓰지 않는다. 호출 제한과 랭킹은 모두 쓰기가 필요하다.
 */

export interface UpstashConfig {
  /** 끝의 '/'를 뗀 REST 주소 */
  url: string;
  token: string;
}

export type UpstashConfigResult =
  | { status: "ok"; config: UpstashConfig }
  | { status: "missing" }
  | { status: "partial" }
  | { status: "insecure" };

export function upstashConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): UpstashConfigResult {
  const upstashUrl = env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const useUpstashNames = Boolean(upstashUrl || upstashToken);

  const url = useUpstashNames ? upstashUrl : env.KV_REST_API_URL?.trim();
  const token = useUpstashNames ? upstashToken : env.KV_REST_API_TOKEN?.trim();

  if (!url && !token) return { status: "missing" };
  if (!url || !token) return { status: "partial" };
  if (!url.startsWith("https://")) return { status: "insecure" };
  return { status: "ok", config: { url: url.replace(/\/+$/, ""), token } };
}
