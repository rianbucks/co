import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rankingStoreFromEnv } from "@/lib/ranking/store";
import { GET } from "../route";
import { DELETE } from "./route";

const ADMIN_TOKEN = "admin-token-for-tests-0123456789";
const ENTRY_ID = "r_0000000000d1";

function del(id: string, authorization?: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/ranking/${id}`, {
      method: "DELETE",
      headers: authorization ? { authorization } : {},
    }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(async () => {
  vi.stubEnv("MOCK_AI", "false");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
  vi.stubEnv("ADMIN_TOKEN", ADMIN_TOKEN);

  const store = rankingStoreFromEnv({ NODE_ENV: "test" });
  await store.remove(ENTRY_ID);
  await store.register(`j_${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`, {
    id: ENTRY_ID,
    nickname: "지울닉네임",
    intensity: 77,
    region: "jeolla",
    grade: 4,
    registeredAt: "2026-11-20T15:00:00+09:00",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DELETE /api/ranking/{id}", () => {
  it("ADMIN_TOKEN이 맞으면 204로 지우고, 목록에서 빠진다", async () => {
    const response = await DELETE(...del(ENTRY_ID, `Bearer ${ADMIN_TOKEN}`));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");

    const listed = await (await GET(new Request(`http://localhost/api/ranking?id=${ENTRY_ID}`))).json();
    expect(listed.me).toBeNull();
    expect(listed.entries.map((entry: { id: string }) => entry.id)).not.toContain(ENTRY_ID);

    const again = await DELETE(...del(ENTRY_ID, `Bearer ${ADMIN_TOKEN}`));
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "not_found" });
  });

  it("토큰이 없거나 틀리면 401이고 지우지 않는다", async () => {
    for (const authorization of [undefined, "Bearer wrong-token-0123456789", ADMIN_TOKEN]) {
      const response = await DELETE(...del(ENTRY_ID, authorization));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }

    const listed = await (await GET(new Request(`http://localhost/api/ranking?id=${ENTRY_ID}`))).json();
    expect(listed.me).toMatchObject({ id: ENTRY_ID, nickname: "지울닉네임" });
  });

  it("서버에 ADMIN_TOKEN이 없으면 어떤 요청도 지우지 못한다", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await DELETE(...del(ENTRY_ID, "Bearer "));
    expect(response.status).toBe(401);
    expect(consoleError).toHaveBeenCalled();
  });

  it("없는 항목이나 형식이 틀린 id는 404", async () => {
    for (const id of ["r_ffffffffffff", "j_0000000000d1", "anything"]) {
      const response = await DELETE(...del(id, `Bearer ${ADMIN_TOKEN}`));
      expect(response.status).toBe(404);
    }
  });
});
