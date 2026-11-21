import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsRankingStoreFromEnv } from "@/lib/gyeongsang/ranking/store";
import { GET } from "../route";
import { DELETE } from "./route";

const ADMIN_TOKEN = "admin-token-for-tests-0123456789";
const ENTRY_ID = "gr_0000000000d1";

function del(id: string, authorization?: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/gyeongsang-ranking/${id}`, {
      method: "DELETE",
      headers: authorization ? { authorization } : {},
    }),
    { params: Promise.resolve({ id }) },
  ];
}

const listedIds = async (area = "all") => {
  const body = await (await GET(new Request(`http://localhost/api/gyeongsang-ranking?area=${area}`))).json();
  return body.entries.map((item: { id: string }) => item.id);
};

beforeEach(async () => {
  vi.stubEnv("MOCK_AI", "false");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN);

  const store = gsRankingStoreFromEnv({ NODE_ENV: "test" });
  await store.remove(ENTRY_ID);
  await store.register(`g_${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`, {
    id: ENTRY_ID,
    nickname: "지울닉네임",
    origin: "busan",
    intensity: 77,
    gyeongbuk: 20,
    registeredAt: "2026-11-20T15:00:00+09:00",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DELETE /api/gyeongsang-ranking/{id}", () => {
  it("ADMIN_TOKEN이 맞으면 204로 지우고, 전체와 신고 원산지 보기에서 모두 빠진다", async () => {
    expect(await listedIds("gyeongnam")).toContain(ENTRY_ID);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await DELETE(...del(ENTRY_ID, `Bearer ${ADMIN_TOKEN}`));
    expect(response.status).toBe(204);
    expect(await listedIds("all")).not.toContain(ENTRY_ID);
    expect(await listedIds("gyeongnam")).not.toContain(ENTRY_ID);
  });

  it("토큰이 없거나 틀리면 401이고 지우지 않는다", async () => {
    for (const authorization of [undefined, "Bearer wrong-token-0123456789", ADMIN_TOKEN]) {
      const response = await DELETE(...del(ENTRY_ID, authorization));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    expect(await listedIds()).toContain(ENTRY_ID);
  });

  it("서버에 ADMIN_TOKEN이 없으면 어떤 요청도 지우지 못한다", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await DELETE(...del(ENTRY_ID, "Bearer "));
    expect(response.status).toBe(401);
    expect(await listedIds()).toContain(ENTRY_ID);
  });

  it("없는 항목이나 형식이 틀린 id(기존 랭킹 id 포함)는 404", async () => {
    for (const id of ["gr_ffffffffffff", "r_0000000000d1", "not-an-id"]) {
      const response = await DELETE(...del(id, `Bearer ${ADMIN_TOKEN}`));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
  });
});
