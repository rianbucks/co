import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeUpstash } from "../testing/fake-upstash";
import type { RankingEntry } from "./contract";
import {
  JUDGMENT_TTL_SECONDS,
  RANKING_KEYS,
  createMemoryRankingState,
  createMemoryRankingStore,
  createUpstashRankingStore,
  rankingScore,
  rankingStoreFromEnv,
  type JudgmentRecord,
  type RankingStore,
} from "./store";

const T0 = Date.parse("2026-11-20T10:00:00+09:00");
const HOUR_MS = 60 * 60 * 1000;

const RECORD: JudgmentRecord = {
  intensity: 68,
  region: "gyeongsang",
  grade: 4,
  mock: false,
  uncertain: false,
};

function entry(overrides: Partial<RankingEntry> & Pick<RankingEntry, "id">): RankingEntry {
  return {
    nickname: "경상도",
    intensity: 68,
    region: "gyeongsang",
    grade: 4,
    registeredAt: "2026-11-20T10:00:00+09:00",
    ...overrides,
  };
}

const implementations: Array<[string, (now: () => number) => RankingStore]> = [
  ["메모리", (now) => createMemoryRankingStore({ now, state: createMemoryRankingState() })],
  [
    "Upstash(가짜 REST)",
    (now) =>
      createUpstashRankingStore({
        url: "https://fake.upstash.io",
        token: "test-token",
        fetcher: createFakeUpstash({ now, token: "test-token" }).fetcher,
      }),
  ],
];

describe.each(implementations)("%s 랭킹 저장소", (_name, makeStore) => {
  let clock = T0;
  let store: RankingStore;

  beforeEach(() => {
    clock = T0;
    store = makeStore(() => clock);
  });

  it("감정 기록은 1시간 동안만 읽힌다", async () => {
    await store.saveJudgment("j_000000000001", RECORD);
    clock = T0 + HOUR_MS - 1;
    await expect(store.getJudgment("j_000000000001")).resolves.toEqual(RECORD);
    clock = T0 + HOUR_MS;
    await expect(store.getJudgment("j_000000000001")).resolves.toBeNull();
    await expect(store.getJudgment("j_00000000000f")).resolves.toBeNull();
  });

  it("감정 기록에는 정해 둔 필드만 남는다", async () => {
    await store.saveJudgment("j_000000000001", {
      ...RECORD,
      transcript: "받아쓰기",
      ip: "203.0.113.7",
    } as JudgmentRecord);
    await expect(store.getJudgment("j_000000000001")).resolves.toEqual(RECORD);
  });

  it("판정 유보 여부도 그대로 남는다", async () => {
    await store.saveJudgment("j_000000000002", { ...RECORD, uncertain: true });
    await expect(store.getJudgment("j_000000000002")).resolves.toEqual({ ...RECORD, uncertain: true });
  });

  it("감정 1건당 한 번만 등록한다", async () => {
    await expect(store.register("j_000000000001", entry({ id: "r_000000000001" }))).resolves.toBe(1);
    await expect(
      store.register("j_000000000001", entry({ id: "r_000000000002", nickname: "다른이름" })),
    ).resolves.toBeNull();

    const page = await store.list(50);
    expect(page.total).toBe(1);
    expect(page.entries.map((item) => item.entry.id)).toEqual(["r_000000000001"]);
  });

  it("농도가 높은 순, 같으면 먼저 등록한 순으로 줄 세우고 등록 순위를 돌려준다", async () => {
    await expect(
      store.register("j_000000000001", entry({ id: "r_00000000000a", intensity: 50 })),
    ).resolves.toBe(1);
    await expect(
      store.register(
        "j_000000000002",
        entry({ id: "r_00000000000b", intensity: 90, registeredAt: "2026-11-20T10:05:00+09:00" }),
      ),
    ).resolves.toBe(1);
    await expect(
      store.register(
        "j_000000000003",
        entry({ id: "r_00000000000c", intensity: 50, registeredAt: "2026-11-20T09:59:00+09:00" }),
      ),
    ).resolves.toBe(2);
    await expect(
      store.register(
        "j_000000000004",
        entry({ id: "r_00000000000d", intensity: 50, registeredAt: "2026-11-20T10:30:00+09:00" }),
      ),
    ).resolves.toBe(4);

    const page = await store.list(50);
    expect(page.entries.map(({ rank, entry: item }) => [rank, item.id])).toEqual([
      [1, "r_00000000000b"],
      [2, "r_00000000000c"],
      [3, "r_00000000000a"],
      [4, "r_00000000000d"],
    ]);
  });

  it("상위 limit개와 전체 수, 상위 밖이어도 내 순위를 돌려준다", async () => {
    for (let i = 0; i < 5; i += 1) {
      await store.register(
        `j_00000000000${i}`,
        entry({ id: `r_00000000000${i}`, nickname: `닉네임${i}`, intensity: 90 - i * 10 }),
      );
    }

    const page = await store.list(2, "r_000000000004");
    expect(page.total).toBe(5);
    expect(page.entries).toEqual([
      { rank: 1, entry: entry({ id: "r_000000000000", nickname: "닉네임0", intensity: 90 }) },
      { rank: 2, entry: entry({ id: "r_000000000001", nickname: "닉네임1", intensity: 80 }) },
    ]);
    expect(page.me).toEqual({
      rank: 5,
      entry: entry({ id: "r_000000000004", nickname: "닉네임4", intensity: 50 }),
    });

    await expect(store.list(2, "r_0000000000ff")).resolves.toMatchObject({ me: null });
  });

  it("limit이 1 미만이면 전체를 돌려주지 않고 예외", async () => {
    await store.register("j_000000000001", entry({ id: "r_000000000001" }));
    await expect(store.list(0)).rejects.toThrow(RangeError);
    await expect(store.list(1.5)).rejects.toThrow(RangeError);
  });

  it("비어 있으면 빈 목록", async () => {
    await expect(store.list(50, "r_000000000001")).resolves.toEqual({ entries: [], total: 0, me: null });
  });

  it("지운 항목은 목록과 내 순위에서 빠지고, 같은 감정으로 다시 등록할 수 없다", async () => {
    await store.register("j_000000000001", entry({ id: "r_000000000001", intensity: 90 }));
    await store.register("j_000000000002", entry({ id: "r_000000000002", intensity: 80 }));

    await expect(store.remove("r_000000000001")).resolves.toBe(true);
    await expect(store.remove("r_000000000001")).resolves.toBe(false);

    const page = await store.list(50, "r_000000000001");
    expect(page.total).toBe(1);
    expect(page.entries).toEqual([{ rank: 1, entry: entry({ id: "r_000000000002", intensity: 80 }) }]);
    expect(page.me).toBeNull();

    await expect(
      store.register("j_000000000001", entry({ id: "r_000000000003", intensity: 90 })),
    ).resolves.toBeNull();
  });

  it("랭킹 항목에는 닉네임, 농도, 지역, 등급, 등록 시각(와 id)만 남는다", async () => {
    await store.register("j_000000000001", {
      ...entry({ id: "r_000000000001" }),
      transcript: "받아쓰기",
      ip: "203.0.113.7",
      audio: "base64",
    } as RankingEntry);

    const [first] = (await store.list(1)).entries;
    expect(Object.keys(first.entry).sort()).toEqual(
      ["grade", "id", "intensity", "nickname", "region", "registeredAt"].sort(),
    );
  });
});

describe("rankingScore", () => {
  it("농도가 1점이라도 높으면 언제 등록했든 앞선다", () => {
    const early = rankingScore({ intensity: 50, registeredAt: "2026-11-01T00:00:00+09:00" });
    const lateHigher = rankingScore({ intensity: 51, registeredAt: "2099-12-31T23:59:59+09:00" });
    expect(lateHigher).toBeGreaterThan(early);
  });

  it("농도가 같으면 먼저 등록한 쪽이 크다", () => {
    const first = rankingScore({ intensity: 70, registeredAt: "2026-11-20T10:00:00+09:00" });
    const second = rankingScore({ intensity: 70, registeredAt: "2026-11-20T10:00:01+09:00" });
    expect(first).toBeGreaterThan(second);
  });

  it("최대 점수도 정수로 정확히 표현된다", () => {
    const score = rankingScore({ intensity: 100, registeredAt: "2026-11-20T10:00:00+09:00" });
    expect(Number.isSafeInteger(score)).toBe(true);
    expect(String(score)).toMatch(/^\d+$/);
  });

  it("시각이 올바르지 않으면 예외", () => {
    expect(() => rankingScore({ intensity: 70, registeredAt: "not-a-date" })).toThrow(RangeError);
  });
});

describe("Upstash 랭킹 저장소의 요청", () => {
  it("감정 기록을 1시간 만료로 저장하고 정해 둔 키를 쓴다", async () => {
    const fake = createFakeUpstash({ now: () => T0 });
    const store = createUpstashRankingStore({
      url: "https://fake.upstash.io/",
      token: "test-token",
      fetcher: fake.fetcher,
    });

    await store.saveJudgment("j_000000000001", RECORD);
    await store.register("j_000000000001", entry({ id: "r_000000000001" }));

    expect(fake.requests[0]).toEqual([
      ["SET", "co:judgment:j_000000000001", JSON.stringify(RECORD), "EX", String(JUDGMENT_TTL_SECONDS)],
    ]);
    expect(JUDGMENT_TTL_SECONDS).toBe(3600);
    expect(fake.keys().sort()).toEqual(
      [
        RANKING_KEYS.judgment("j_000000000001"),
        RANKING_KEYS.claim("j_000000000001"),
        "co:ranking",
        "co:ranking:entries",
      ].sort(),
    );
  });

  it("HTTP 오류나 명령 오류는 예외로 올린다", async () => {
    const failing = createUpstashRankingStore({
      url: "https://fake.upstash.io",
      token: "test-token",
      fetcher: async () => new Response("unavailable", { status: 503 }),
    });
    await expect(failing.getJudgment("j_000000000001")).rejects.toThrow("HTTP 503");

    const commandError = createUpstashRankingStore({
      url: "https://fake.upstash.io",
      token: "test-token",
      fetcher: async () => Response.json([{ error: "ERR something" }]),
    });
    await expect(commandError.getJudgment("j_000000000001")).rejects.toThrow("ERR something");
  });

  it("판정 유보 여부가 생기기 전에 남긴 기록은 유보가 아닌 것으로 읽는다", async () => {
    const legacy = { intensity: 68, region: "gyeongsang", grade: 4, mock: false };
    const store = createUpstashRankingStore({
      url: "https://fake.upstash.io",
      token: "test-token",
      fetcher: async () => Response.json([{ result: JSON.stringify(legacy) }]),
    });
    await expect(store.getJudgment("j_000000000001")).resolves.toEqual({ ...legacy, uncertain: false });
  });

  it("flags 여부가 남은 이전 기록도 읽고 그 값은 버린다(녹음 내용으로는 등록을 막지 않는다)", async () => {
    const legacy = { ...RECORD, flagged: true };
    const store = createUpstashRankingStore({
      url: "https://fake.upstash.io",
      token: "test-token",
      fetcher: async () => Response.json([{ result: JSON.stringify(legacy) }]),
    });
    await expect(store.getJudgment("j_000000000001")).resolves.toEqual(RECORD);
  });

  it("저장된 값이 깨져 있으면 기록이 없는 것으로 본다", async () => {
    const store = createUpstashRankingStore({
      url: "https://fake.upstash.io",
      token: "test-token",
      fetcher: async () => Response.json([{ result: "{not json" }]),
    });
    await expect(store.getJudgment("j_000000000001")).resolves.toBeNull();
  });
});

describe("rankingStoreFromEnv", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Production에서 Upstash가 없으면 닫힌 상태로 실패한다", () => {
    expect(() => rankingStoreFromEnv({ NODE_ENV: "production" })).toThrow(
      "Upstash Redis ranking store is not configured",
    );
  });

  it("Production이어도 가짜 응답 모드는 메모리로 동작한다(등록은 서비스에서 막는다)", async () => {
    const store = rankingStoreFromEnv({ NODE_ENV: "production" }, { mock: true });
    await expect(store.list(50)).resolves.toMatchObject({ entries: expect.any(Array) });
  });

  it("설정이 반만 있거나 HTTPS가 아니면 설정 오류", () => {
    expect(() =>
      rankingStoreFromEnv({ NODE_ENV: "development", KV_REST_API_URL: "https://kv.upstash.io" }),
    ).toThrow("not configured");
    expect(() =>
      rankingStoreFromEnv({
        NODE_ENV: "production",
        KV_REST_API_URL: "http://kv.upstash.io",
        KV_REST_API_TOKEN: "kv-token",
      }),
    ).toThrow("must use HTTPS");
  });

  it("Vercel Marketplace의 KV_REST_API_*로 Upstash를 쓴다", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      void init;
      expect(url).toBe("https://kv-example.upstash.io/pipeline");
      return Response.json([{ result: null }]);
    });
    vi.stubGlobal("fetch", fetcher);

    const store = rankingStoreFromEnv({
      NODE_ENV: "production",
      KV_REST_API_URL: "https://kv-example.upstash.io",
      KV_REST_API_TOKEN: "kv-token",
      KV_REST_API_READ_ONLY_TOKEN: "read-only-token",
    });
    await expect(store.getJudgment("j_000000000001")).resolves.toBeNull();
    expect(fetcher.mock.calls[0]![1].headers).toMatchObject({ Authorization: "Bearer kv-token" });
  });

  it("개발 환경은 Upstash가 없으면 인스턴스끼리 공유하는 메모리를 쓴다", async () => {
    const first = rankingStoreFromEnv({ NODE_ENV: "development" });
    const second = rankingStoreFromEnv({ NODE_ENV: "development" });
    await first.saveJudgment("j_0000000000aa", RECORD);
    await expect(second.getJudgment("j_0000000000aa")).resolves.toEqual(RECORD);
  });
});
