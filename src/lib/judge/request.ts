/** 요청자 IP. Vercel은 x-forwarded-for의 첫 값에 실제 IP를 넣는다. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}
