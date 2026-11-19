import { describe, expect, it } from "vitest";
import { upstashConfigFromEnv } from "./upstash";

const KV = {
  KV_REST_API_URL: "https://kv-example.upstash.io",
  KV_REST_API_TOKEN: "kv-token",
};
const UPSTASH = {
  UPSTASH_REDIS_REST_URL: "https://direct-example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "direct-token",
};

describe("upstashConfigFromEnv", () => {
  it("UPSTASH_REDIS_REST_*가 없으면 Vercel Marketplace의 KV_REST_API_*를 쓴다", () => {
    expect(upstashConfigFromEnv(KV)).toEqual({
      status: "ok",
      config: { url: "https://kv-example.upstash.io", token: "kv-token" },
    });
  });

  it("UPSTASH_REDIS_REST_*가 있으면 그 쌍을 먼저 쓴다", () => {
    expect(upstashConfigFromEnv({ ...KV, ...UPSTASH })).toEqual({
      status: "ok",
      config: { url: "https://direct-example.upstash.io", token: "direct-token" },
    });
  });

  it("UPSTASH 쪽이 반만 있으면 KV 쪽과 섞지 않고 설정 오류로 본다", () => {
    expect(
      upstashConfigFromEnv({ ...KV, UPSTASH_REDIS_REST_URL: "https://direct-example.upstash.io" }),
    ).toEqual({ status: "partial" });
  });

  it("읽기 전용 토큰은 쓰지 않는다", () => {
    expect(
      upstashConfigFromEnv({
        KV_REST_API_URL: "https://kv-example.upstash.io",
        KV_REST_API_READ_ONLY_TOKEN: "read-only-token",
      }),
    ).toEqual({ status: "partial" });
    expect(upstashConfigFromEnv({ KV_REST_API_READ_ONLY_TOKEN: "read-only-token" })).toEqual({
      status: "missing",
    });
  });

  it("아무것도 없으면 missing, 빈 값과 공백도 없는 것으로 본다", () => {
    expect(upstashConfigFromEnv({})).toEqual({ status: "missing" });
    expect(
      upstashConfigFromEnv({ UPSTASH_REDIS_REST_URL: " ", KV_REST_API_URL: "", KV_REST_API_TOKEN: "" }),
    ).toEqual({ status: "missing" });
  });

  it("HTTPS가 아니면 insecure", () => {
    expect(upstashConfigFromEnv({ ...KV, KV_REST_API_URL: "http://kv-example.upstash.io" })).toEqual({
      status: "insecure",
    });
  });

  it("주소 끝의 '/'와 앞뒤 공백을 뗀다", () => {
    expect(
      upstashConfigFromEnv({ KV_REST_API_URL: " https://kv-example.upstash.io/ ", KV_REST_API_TOKEN: " t " }),
    ).toEqual({ status: "ok", config: { url: "https://kv-example.upstash.io", token: "t" } });
  });
});
