import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JUDGMENT_TTL_SECONDS, RANKING_KEYS } from "../../ranking/store";
import { createFakeUpstash } from "../../testing/fake-upstash";
import type { GsRankingEntry } from "./contract";
import {
  GS_RANKING_KEYS,
  areaOf,
  createMemoryGsRankingState,
  createMemoryGsRankingStore,
  createUpstashGsRankingStore,
  gsRankingStoreFromEnv,
  type GsJudgmentRecord,
  type GsRankingStore,
} from "./store";

const T0 = Date.parse("2026-11-20T10:00:00+09:00");
const HOUR_MS = 60 * 60 * 1000;

const RECORD: GsJudgmentRecord = { intensity: 69, gyeongbuk: 64, mock: false, flagged: false };

function entry(overrides: Partial<GsRankingEntry> & Pick<GsRankingEntry, "id">): GsRankingEntry {
  return {
    nickname: "대구토박이",
    origin: "daegu",
    intensity: 69,
    gyeongbuk: 64,
    registeredAt: "2026-11-20T10:00:00+09:00",
    ...overrides,
  };
}

const implementations: Array<[string, (now: () => number) => GsRankingStore]> = [
  ["메모리", (now) => createMemoryGsRankingStore({ now, state: createMemoryGsRankingState() })],
  [
    "Upstash(가짜 REST)",
    (now) =>
      createUpstashGsRankingStore({
        url: "https://fake.upstash.io",
        token: "test-token",
        fetcher: createFakeUpstash({ now, token: "test-token" }).fetcher,
      }),
  ],
];

describe("areaOf", () => {
  it("신고 원산지로 보기를 정한다: 대구, 경북은 대구·경북, 부산, 울산, 경남은 부산·울산·경남", () => {
    expect(areaOf({ origin: "daegu" })).toBe("gyeongbuk");
    expect(areaOf({ origin: "gyeongbuk" })).toBe("gyeongbuk");
    expect(areaOf({ origin: "busan" })).toBe("gyeongnam");
    expect(areaOf({ origin: "ulsan" })).toBe("gyeongnam");
    expect(areaOf({ origin: "gyeongnam" })).toBe("gyeongnam");
  });
});

describe.each(implementations)("%s 정밀 랭킹 저장소", (_name, makeStore) => {
  let clock = T0;
  let store: GsRankingStore;

  beforeEach(() => {
    clock = T0;
    store = makeStore(() => clock);
  });

  it("감정 기록은 1시간 동안만 읽힌다", async () => {
    await store.saveJudgment("g_000000000001", RECORD);
    expect(await store.getJudgment("g_000000000001")).toEqual(RECORD);
    clock = T0 + HOUR_MS - 1;
    expect(await store.getJudgment("g_000000000001")).toEqual(RECORD);
    clock = T0 + HOUR_MS;
    expect(await store.getJudgment("g_000000000001")).toBeNull();
  });

  it("감정 기록에는 정해 둔 필드만 남는다", async () => {
    await store.saveJudgment("g_000000000001", {
      ...RECORD,
      origin: "busan",
      transcript: "녹음 내용",
    } as GsJudgmentRecord);
    expect(await store.getJudgment("g_000000000001")).toEqual(RECORD);
  });

  it("감정 1건당 한 번만 등록한다", async () => {
    expect(await store.register("g_000000000001", entry({ id: "gr_000000000001" }))).toBe(1);
    expect(await store.register("g_000000000001", entry({ id: "gr_000000000002" }))).toBeNull();
    const page = await store.list("all", 50);
    expect(page.entries.map((item) => item.entry.id)).toEqual(["gr_000000000001"]);
  });

  it("농도가 높은 순, 같으면 먼저 등록한 순으로 줄 세우고 전체 순위를 돌려준다", async () => {
    expect(await store.register("g_000000000001", entry({ id: "gr_000000000001", intensity: 50 }))).toBe(1);
    expect(
      await store.register(
        "g_000000000002",
        entry({ id: "gr_000000000002", intensity: 80, origin: "busan", registeredAt: "2026-11-20T10:01:00+09:00" }),
      ),
    ).toBe(1);
    expect(
      await store.register(
        "g_000000000003",
        entry({ id: "gr_000000000003", intensity: 50, registeredAt: "2026-11-20T10:02:00+09:00" }),
      ),
    ).toBe(3);
    const page = await store.list("all", 50);
    expect(page.entries.map((item) => [item.rank, item.entry.id])).toEqual([
      [1, "gr_000000000002"],
      [2, "gr_000000000001"],
      [3, "gr_000000000003"],
    ]);
  });

  it("보기는 신고 원산지로 나누고, 순위와 항목 수는 그 보기 안에서 센다", async () => {
    await store.register("g_000000000001", entry({ id: "gr_000000000001", origin: "daegu", intensity: 60 }));
    await store.register("g_000000000002", entry({ id: "gr_000000000002", origin: "busan", intensity: 90 }));
    await store.register("g_000000000003", entry({ id: "gr_000000000003", origin: "gyeongbuk", intensity: 70 }));
    await store.register("g_000000000004", entry({ id: "gr_000000000004", origin: "ulsan", intensity: 40 }));
    await store.register("g_000000000005", entry({ id: "gr_000000000005", origin: "gyeongnam", intensity: 50 }));

    const gyeongbuk = await store.list("gyeongbuk", 50, "gr_000000000001");
    expect(gyeongbuk.entries.map((item) => item.entry.id)).toEqual(["gr_000000000003", "gr_000000000001"]);
    expect(gyeongbuk.total).toBe(2);
    expect(gyeongbuk.me).toMatchObject({ rank: 2, entry: { id: "gr_000000000001", origin: "daegu" } });

    const gyeongnam = await store.list("gyeongnam", 50, "gr_000000000001");
    expect(gyeongnam.entries.map((item) => item.entry.id)).toEqual([
      "gr_000000000002",
      "gr_000000000005",
      "gr_000000000004",
    ]);
    expect(gyeongnam.total).toBe(3);
    // 다른 보기의 항목은 me가 아니다.
    expect(gyeongnam.me).toBeNull();

    const all = await store.list("all", 2, "gr_000000000004");
    expect(all.entries.map((item) => item.entry.id)).toEqual(["gr_000000000002", "gr_000000000003"]);
    expect(all.total).toBe(5);
    expect(all.me).toMatchObject({ rank: 5, entry: { id: "gr_000000000004" } });
  });

  it("AI 판정의 경북권 비율이 아니라 신고 원산지로 나눈다", async () => {
    // 부산을 신고했지만 경북권 비율이 높은 항목도 부산·울산·경남 보기에 든다.
    await store.register("g_000000000001", entry({ id: "gr_000000000001", origin: "busan", gyeongbuk: 90 }));
    expect((await store.list("gyeongnam", 50)).total).toBe(1);
    expect((await store.list("gyeongbuk", 50)).total).toBe(0);
  });

  it("limit이 1 미만이면 전체를 돌려주지 않고 예외", async () => {
    await expect(store.list("all", 0)).rejects.toThrow(RangeError);
  });

  it("비어 있으면 빈 목록", async () => {
    expect(await store.list("gyeongbuk", 50, "gr_000000000001")).toEqual({ entries: [], total: 0, me: null });
  });

  it("지운 항목은 모든 보기와 내 순위에서 빠지고, 같은 감정으로 다시 등록할 수 없다", async () => {
    await store.register("g_000000000001", entry({ id: "gr_000000000001", origin: "ulsan" }));
    expect(await store.remove("gr_000000000001")).toBe(true);
    expect(await store.remove("gr_000000000001")).toBe(false);
    for (const area of ["all", "gyeongbuk", "gyeongnam"] as const) {
      expect(await store.list(area, 50, "gr_000000000001")).toEqual({ entries: [], total: 0, me: null });
    }
    expect(await store.register("g_000000000001", entry({ id: "gr_000000000002" }))).toBeNull();
  });

  it("항목에는 닉네임, 신고 원산지, 경상 농도, 경북권 비율, 등록 시각(과 id)만 남는다", async () => {
    const extra = { ...entry({ id: "gr_000000000001" }), transcript: "녹음 내용", ip: "203.0.113.7" };
    await store.register("g_000000000001", extra as GsRankingEntry);
    const page = await store.list("all", 50);
    expect(page.entries[0].entry).toEqual(entry({ id: "gr_000000000001" }));
  });
});

describe("Upstash 정밀 랭킹 저장소의 요청", () => {
  it("기존 랭킹과 다른 키(co:gs:*)를 쓰고, 감정 기록은 1시간 만료다", async () => {
    const fake = createFakeUpstash({ now: () => T0 });
    const store = createUpstashGsRankingStore({
      url: "https://fake.upstash.io/",
      token: "test-token",
      fetcher: fake.fetcher,
    });

    await store.saveJudgment("g_000000000001", RECORD);
    await store.register("g_000000000001", entry({ id: "gr_000000000001", origin: "busan" }));

    expect(fake.requests[0]).toEqual([
      ["SET", "co:gs:judgment:g_000000000001", JSON.stringify(RECORD), "EX", String(JUDGMENT_TTL_SECONDS)],
    ]);
    expect(fake.keys().sort()).toEqual(
      [
        GS_RANKING_KEYS.judgment("g_000000000001"),
        GS_RANKING_KEYS.claim("g_000000000001"),
        "co:gs:ranking",
        "co:gs:ranking:gyeongnam",
        "co:gs:ranking:entries",
      ].sort(),
    );
    // 기존 농도 랭킹의 키와 겹치지 않는다.
    for (const key of fake.keys()) {
      expect([RANKING_KEYS.entries, RANKING_KEYS.order]).not.toContain(key);
      expect(key.startsWith("co:gs:")).toBe(true);
    }
  });

  it("HTTP 오류는 예외로 올리고, 깨진 값은 기록이 없는 것으로 본다", async () => {
    const failing = createUpstashGsRankingStore({
      url: "https://fake.upstash.io",
      token: "test-token",
      fetcher: async () => new Response("unavailable", { status: 503 }),
    });
    await expect(failing.getJudgment("g_000000000001")).rejects.toThrow("HTTP 503");

    const broken = createUpstashGsRankingStore({
      url: "https://fake.upstash.io",
      token: "test-token",
      fetcher: async () => Response.json([{ result: "{not json" }]),
    });
    await expect(broken.getJudgment("g_000000000001")).resolves.toBeNull();
  });
});

describe("gsRankingStoreFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Production에서 Upstash가 없으면 닫힌 상태로 실패한다", () => {
    expect(() => gsRankingStoreFromEnv({ NODE_ENV: "production" })).toThrow("not configured");
  });

  it("Production이어도 가짜 응답 모드는 메모리로 동작한다(등록은 서비스에서 막는다)", async () => {
    const store = gsRankingStoreFromEnv({ NODE_ENV: "production" }, { mock: true });
    await expect(store.list("all", 1)).resolves.toMatchObject({ entries: expect.any(Array) });
  });

  it("설정이 반만 있거나 HTTPS가 아니면 설정 오류", () => {
    expect(() => gsRankingStoreFromEnv({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" })).toThrow(
      "not configured",
    );
    expect(() =>
      gsRankingStoreFromEnv({ UPSTASH_REDIS_REST_URL: "http://x.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }),
    ).toThrow("HTTPS");
  });

  it("개발 환경은 Upstash가 없으면 인스턴스끼리 공유하는 메모리를 쓰고, 기존 랭킹의 메모리와는 따로다", async () => {
    const first = gsRankingStoreFromEnv({ NODE_ENV: "test" });
    const second = gsRankingStoreFromEnv({ NODE_ENV: "test" });
    await first.saveJudgment("g_0000000000aa", RECORD);
    expect(await second.getJudgment("g_0000000000aa")).toEqual(RECORD);
  });
});
