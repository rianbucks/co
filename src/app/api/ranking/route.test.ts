import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rankingStoreFromEnv, type JudgmentRecord } from "@/lib/ranking/store";
import { POST as judgePOST } from "../judge/route";
import { GET, POST } from "./route";

const RECORD: JudgmentRecord = {
  intensity: 68,
  region: "gyeongsang",
  grade: 4,
  mock: false,
  flagged: false,
  uncertain: false,
};

/** 테스트 환경(NODE_ENV=test)에서 라우트가 쓰는 메모리 저장소와 같은 저장소 */
const localStore = () => rankingStoreFromEnv({ NODE_ENV: "test" });

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ranking", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(query = ""): Request {
  return new Request(`http://localhost/api/ranking${query}`);
}

beforeEach(() => {
  vi.stubEnv("MOCK_AI", "false");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/ranking", () => {
  it("목록, 전체 수, 내 항목을 캐시 없이 돌려준다", async () => {
    const response = await GET(get("?limit=50"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ entries: expect.any(Array), total: expect.any(Number), me: null });
  });

  it("limit이나 id 형식이 틀리면 400 invalid_request", async () => {
    for (const query of ["?limit=0", "?limit=abc", "?id=j_0123456789ab"]) {
      const response = await GET(get(query));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
  });

  it("Production에서 Upstash가 없으면 500 server_error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(get());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
  });
});

describe("POST /api/ranking", () => {
  it("등록하면 201과 순위를 돌려주고, 조회하면 내 순위가 보인다", async () => {
    await localStore().saveJudgment("j_aaaaaaaaaaa1", { ...RECORD, intensity: 99, grade: 5 });

    const response = await POST(
      postJson(
        { judgmentId: "j_aaaaaaaaaaa1", nickname: "라우트시험", intensity: 1 },
        { "x-forwarded-for": "198.51.100.20" },
      ),
    );
    expect(response.status).toBe(201);
    const { entry } = await response.json();
    expect(entry).toMatchObject({
      rank: 1,
      nickname: "라우트시험",
      intensity: 99,
      region: "gyeongsang",
      grade: 5,
      gradeName: "무형문화재 지정 검토 대상",
    });
    expect(entry.id).toMatch(/^r_[0-9a-f]{12}$/);
    expect(entry.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);

    const listed = await (await GET(get(`?limit=50&id=${entry.id}`))).json();
    expect(listed.me).toEqual(entry);
    expect(listed.entries[0]).toEqual(entry);

    const again = await POST(postJson({ judgmentId: "j_aaaaaaaaaaa1", nickname: "다시등록" }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "already_registered" });
  });

  it("JSON이 아니거나 본문이 너무 크면 400 invalid_request", async () => {
    const notJson = await POST(postJson("{judgmentId"));
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "invalid_request" });

    const tooLarge = await POST(
      postJson({ judgmentId: "j_aaaaaaaaaaa2", nickname: "가".repeat(5000) }),
    );
    expect(tooLarge.status).toBe(400);
    expect(await tooLarge.json()).toEqual({ error: "invalid_request" });
  });

  it("닉네임 규칙을 어기면 400 invalid_nickname", async () => {
    const response = await POST(postJson({ judgmentId: "j_aaaaaaaaaaa3", nickname: "닉 네임" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_nickname", reason: "characters" });
  });

  it("판정 유보 결과는 403 not_eligible(uncertain)", async () => {
    await localStore().saveJudgment("j_aaaaaaaaaaa5", { ...RECORD, uncertain: true });
    const response = await POST(postJson({ judgmentId: "j_aaaaaaaaaaa5", nickname: "유보결과" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_eligible", reason: "uncertain" });
  });

  it("감정 기록이 없으면 404 not_found", async () => {
    const response = await POST(postJson({ judgmentId: "j_aaaaaaaaaaa4", nickname: "없는기록" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("Production에서 Upstash가 없으면 500 server_error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(postJson({ judgmentId: "j_aaaaaaaaaaa5", nickname: "닉네임" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
  });
});

describe("감정과 랭킹 연결", () => {
  const WAV = new Uint8Array(64);
  WAV.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  WAV.set([0x24, 0, 0, 0], 4);
  WAV.set([..."WAVEfmt "].map((c) => c.charCodeAt(0)), 8);

  async function judgeOnce(): Promise<{ id: string }> {
    const form = new FormData();
    form.append("audio", new File([WAV], "recording.wav", { type: "audio/wav" }));
    form.append("questionSetId", "set-a");
    const response = await judgePOST(
      new Request("http://localhost/api/judge", { method: "POST", body: form }),
    );
    expect(response.status).toBe(200);
    return response.json();
  }

  it("감정할 때 서버가 농도, 지역, 등급을 남기고, 가짜 응답 모드의 결과는 등록할 수 없다", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const result = await judgeOnce();
    await expect(localStore().getJudgment(result.id)).resolves.toEqual({
      intensity: 68,
      region: "gyeongsang",
      grade: 4,
      mock: true,
      flagged: false,
      uncertain: false,
    });

    const response = await POST(postJson({ judgmentId: result.id, nickname: "가짜응답" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_eligible", reason: "mock" });
  });

  it("가짜 응답 모드에서 받은 결과는 실제 모드로 바꾼 뒤에도 등록할 수 없다", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const result = await judgeOnce();

    vi.stubEnv("MOCK_AI", "false");
    const response = await POST(postJson({ judgmentId: result.id, nickname: "가짜응답" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_eligible", reason: "mock" });
  });
});
