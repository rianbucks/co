import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsRankingStoreFromEnv, type GsJudgmentRecord } from "@/lib/gyeongsang/ranking/store";
import { rankingStoreFromEnv } from "@/lib/ranking/store";
import { POST as judgePOST } from "../judge/route";
import { GET as generalGET } from "../ranking/route";
import { GET, POST } from "./route";

const RECORD: GsJudgmentRecord = { intensity: 69, gyeongbuk: 64, mock: false };

/** 테스트 환경(NODE_ENV=test)에서 라우트가 쓰는 메모리 저장소와 같은 저장소 */
const localStore = () => gsRankingStoreFromEnv({ NODE_ENV: "test" });

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/gyeongsang-ranking", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(query = ""): Request {
  return new Request(`http://localhost/api/gyeongsang-ranking${query}`);
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

describe("GET /api/gyeongsang-ranking", () => {
  it("보기, 목록, 항목 수, 내 항목을 캐시 없이 돌려준다. 보기가 없으면 전체다", async () => {
    const response = await GET(get("?limit=50"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      area: "all",
      entries: expect.any(Array),
      total: expect.any(Number),
      me: null,
    });
  });

  it("보기, limit, id 형식이 틀리면 400 invalid_request", async () => {
    for (const query of ["?area=seoul", "?limit=0", "?id=r_0123456789ab", "?id=g_0123456789ab"]) {
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

describe("POST /api/gyeongsang-ranking", () => {
  it("등록하면 201과 순위를 돌려주고, 신고 원산지의 보기에서만 내 순위가 보인다", async () => {
    await localStore().saveJudgment("g_aaaaaaaaaaa1", RECORD);

    const response = await POST(
      postJson(
        { judgmentId: "g_aaaaaaaaaaa1", nickname: "라우트시험", origin: "gyeongbuk", intensity: 100 },
        { "x-forwarded-for": "198.51.100.30" },
      ),
    );
    expect(response.status).toBe(201);
    const { entry } = await response.json();
    expect(entry).toMatchObject({
      nickname: "라우트시험",
      origin: "gyeongbuk",
      intensity: 69,
      gyeongbuk: 64,
      grade: 4,
      gradeName: "지역 말투가 뚜렷하게 들려요",
      matched: true,
    });
    expect(entry.id).toMatch(/^gr_[0-9a-f]{12}$/);
    expect(entry.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);

    const inArea = await (await GET(get(`?area=gyeongbuk&id=${entry.id}`))).json();
    expect(inArea.area).toBe("gyeongbuk");
    expect(inArea.me).toMatchObject({ id: entry.id, nickname: "라우트시험" });
    const otherArea = await (await GET(get(`?area=gyeongnam&id=${entry.id}`))).json();
    expect(otherArea.me).toBeNull();

    const again = await POST(postJson({ judgmentId: "g_aaaaaaaaaaa1", nickname: "다시등록", origin: "busan" }));
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "already_registered" });
  });

  it("기존 농도 랭킹과 섞이지 않는다", async () => {
    await localStore().saveJudgment("g_aaaaaaaaaab1", RECORD);
    const response = await POST(postJson({ judgmentId: "g_aaaaaaaaaab1", nickname: "따로랭킹", origin: "ulsan" }));
    const { entry } = await response.json();

    const general = await (await generalGET(new Request("http://localhost/api/ranking?limit=50"))).json();
    expect(general.entries.map((item: { id: string }) => item.id)).not.toContain(entry.id);
    // 정밀 감정 기록은 기존 랭킹의 저장소에 없다.
    await expect(rankingStoreFromEnv({ NODE_ENV: "test" }).getJudgment("g_aaaaaaaaaab1")).resolves.toBeNull();
  });

  it("JSON이 아니거나 본문이 너무 크거나 신고 원산지가 틀리면 400 invalid_request", async () => {
    for (const body of [
      "{judgmentId",
      { judgmentId: "g_aaaaaaaaaaa2", nickname: "가".repeat(5000), origin: "daegu" },
      { judgmentId: "g_aaaaaaaaaaa2", nickname: "닉네임", origin: "seoul" },
      { judgmentId: "g_aaaaaaaaaaa2", nickname: "닉네임" },
    ]) {
      const response = await POST(postJson(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_request" });
    }
  });

  it("닉네임 규칙을 어기면 400 invalid_nickname", async () => {
    const response = await POST(postJson({ judgmentId: "g_aaaaaaaaaaa3", nickname: "닉 네임", origin: "daegu" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_nickname", reason: "characters" });
  });

  it("감정 기록이 없으면 404 not_found", async () => {
    const response = await POST(postJson({ judgmentId: "g_aaaaaaaaaaa4", nickname: "없는기록", origin: "busan" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });

  it("Production에서 Upstash가 없으면 500 server_error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await POST(postJson({ judgmentId: "g_aaaaaaaaaaa5", nickname: "닉네임", origin: "daegu" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
  });
});

describe("정밀 감정과 정밀 랭킹 연결", () => {
  const WAV = new Uint8Array(64);
  WAV.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  WAV.set([0x24, 0, 0, 0], 4);
  WAV.set([..."WAVEfmt "].map((c) => c.charCodeAt(0)), 8);

  async function judgeOnce(): Promise<{ id: string }> {
    const form = new FormData();
    form.append("audio", new File([WAV], "recording.wav", { type: "audio/wav" }));
    form.append("questionSetId", "set-gs");
    const response = await judgePOST(new Request("http://localhost/api/judge", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    return response.json();
  }

  it("정밀 감정할 때 서버가 경상 농도와 경북권 비율을 남기고(신고 원산지는 없다), 가짜 응답 모드의 결과는 등록할 수 없다", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const result = await judgeOnce();
    expect(result.id).toMatch(/^g_[0-9a-f]{12}$/);
    await expect(localStore().getJudgment(result.id)).resolves.toEqual({
      intensity: 69,
      gyeongbuk: 64,
      mock: true,
    });

    const response = await POST(postJson({ judgmentId: result.id, nickname: "가짜응답", origin: "daegu" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_eligible", reason: "mock" });
  });

  it("가짜 응답 모드에서 받은 결과는 실제 모드로 바꾼 뒤에도 등록할 수 없다", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const result = await judgeOnce();

    vi.stubEnv("MOCK_AI", "false");
    const response = await POST(postJson({ judgmentId: result.id, nickname: "가짜응답", origin: "busan" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "not_eligible", reason: "mock" });
  });
});
