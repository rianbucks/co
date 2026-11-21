import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "../../rate-limit";
import {
  deleteGsRanking,
  listGsRanking,
  parseGsListQuery,
  registerGsRanking,
  toGsView,
  type GsRegisterDeps,
} from "./service";
import {
  createMemoryGsRankingState,
  createMemoryGsRankingStore,
  type GsJudgmentRecord,
  type GsRankingStore,
  type MemoryGsRankingState,
} from "./store";

const JUDGMENT_ID = "g_0123456789ab";
const ENTRY_ID = "gr_00000000000a";
const CLIENT_IP = "203.0.113.7";
const T0 = Date.parse("2026-11-20T14:00:00+09:00");

const RECORD: GsJudgmentRecord = { intensity: 69, gyeongbuk: 64, mock: false };

let clock: number;
let state: MemoryGsRankingState;
let store: GsRankingStore;
let limiter: { check: ReturnType<typeof vi.fn<RateLimiter["check"]>> };

function deps(overrides: Partial<GsRegisterDeps> = {}): GsRegisterDeps {
  return {
    store,
    rateLimiter: limiter,
    mock: false,
    now: () => new Date("2026-11-20T14:03:00+09:00"),
    newEntryId: () => ENTRY_ID,
    ...overrides,
  };
}

function register(body: unknown, overrides: Partial<GsRegisterDeps> = {}) {
  return registerGsRanking({ body, clientIp: CLIENT_IP }, deps(overrides));
}

const BODY = { judgmentId: JUDGMENT_ID, nickname: "대구토박이", origin: "daegu" };

beforeEach(async () => {
  clock = T0;
  state = createMemoryGsRankingState();
  store = createMemoryGsRankingStore({ now: () => clock, state });
  limiter = { check: vi.fn<RateLimiter["check"]>(async () => ({ allowed: true })) };
  await store.saveJudgment(JUDGMENT_ID, RECORD);
});

describe("registerGsRanking", () => {
  it("정밀 감정할 때 서버가 남긴 경상 농도와 경북권 비율, 요청의 신고 원산지로 등록하고 201과 순위를 돌려준다", async () => {
    expect(await register(BODY)).toEqual({
      status: 201,
      body: {
        entry: {
          rank: 1,
          id: ENTRY_ID,
          nickname: "대구토박이",
          origin: "daegu",
          intensity: 69,
          gyeongbuk: 64,
          grade: 4,
          gradeName: "자막 필요",
          matched: true,
          registeredAt: "2026-11-20T14:03:00+09:00",
        },
      },
    });
    expect(limiter.check).toHaveBeenCalledWith({ ip: CLIENT_IP });
  });

  it("클라이언트가 보낸 점수와 비율은 무시한다(점수 위조 방지)", async () => {
    const outcome = await register({ ...BODY, intensity: 100, gyeongbuk: 0, grade: 5, matched: true });
    expect(outcome.body).toMatchObject({ entry: { intensity: 69, gyeongbuk: 64, grade: 4 } });
  });

  it("원산지 일치 여부는 신고 원산지와 경북권 비율로 계산한다", async () => {
    const outcome = await register({ ...BODY, origin: "busan" });
    expect(outcome.body).toMatchObject({ entry: { origin: "busan", matched: false } });
  });

  it("저장소에는 닉네임, 신고 원산지, 경상 농도, 경북권 비율, 등록 시각(과 id)만 남고 IP는 남지 않는다", async () => {
    await register({ ...BODY, transcript: "녹음 내용" });
    expect([...state.entries.values()].map((item) => item.entry)).toEqual([
      {
        id: ENTRY_ID,
        nickname: "대구토박이",
        origin: "daegu",
        intensity: 69,
        gyeongbuk: 64,
        registeredAt: "2026-11-20T14:03:00+09:00",
      },
    ]);
    expect(JSON.stringify([...state.entries.values()])).not.toContain(CLIENT_IP);
  });

  it.each([
    ["본문이 객체가 아님", "text"],
    ["배열", []],
    ["일반 감정 id(j_)", { ...BODY, judgmentId: "j_0123456789ab" }],
    ["형식이 틀린 id", { ...BODY, judgmentId: "g_123" }],
    ["닉네임이 문자열이 아님", { ...BODY, nickname: 123 }],
    ["신고 원산지 없음", { judgmentId: JUDGMENT_ID, nickname: "대구토박이" }],
    ["모르는 신고 원산지", { ...BODY, origin: "seoul" }],
    ["한글 이름의 신고 원산지", { ...BODY, origin: "대구" }],
  ])("%s이면 400 invalid_request", async (_name, body) => {
    expect(await register(body)).toEqual({ status: 400, body: { error: "invalid_request" } });
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it.each([
    ["가", "length"],
    ["열한글자닉네임입니다요", "length"],
    ["대구 토박이", "characters"],
    ["대구!", "characters"],
  ])("닉네임 '%s'는 기존 랭킹과 같은 규칙으로 400 invalid_nickname(%s)", async (nickname, reason) => {
    expect(await register({ ...BODY, nickname })).toEqual({
      status: 400,
      body: { error: "invalid_nickname", reason },
    });
  });

  it("서버가 가짜 응답 모드면 403 not_eligible(mock)", async () => {
    expect(await register(BODY, { mock: true })).toEqual({
      status: 403,
      body: { error: "not_eligible", reason: "mock" },
    });
  });

  it("가짜 응답 모드에서 받은 정밀 감정 결과는 403 not_eligible(mock)", async () => {
    await store.saveJudgment(JUDGMENT_ID, { ...RECORD, mock: true });
    expect((await register(BODY)).body).toEqual({ error: "not_eligible", reason: "mock" });
  });

  it("녹음 내용으로는 막지 않는다: 이전에 flags가 붙어 저장된 기록도 등록된다", async () => {
    await store.saveJudgment(JUDGMENT_ID, { ...RECORD, flagged: true } as GsJudgmentRecord);
    expect((await register(BODY)).status).toBe(201);
  });

  it("감정 기록이 없거나 1시간이 지났으면 404 not_found", async () => {
    expect((await register({ ...BODY, judgmentId: "g_ffffffffffff" })).status).toBe(404);
    clock = T0 + 60 * 60 * 1000;
    expect(await register(BODY)).toEqual({ status: 404, body: { error: "not_found" } });
  });

  it("IP당 하루 한도를 넘으면 429 rate_limited이고 등록하지 않는다", async () => {
    limiter.check.mockResolvedValueOnce({ allowed: false, scope: "ip" });
    expect(await register(BODY)).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(state.entries.size).toBe(0);
  });

  it("같은 정밀 감정 결과로 두 번 등록하면 409 already_registered(감정 1건당 1회)", async () => {
    expect((await register(BODY)).status).toBe(201);
    expect(await register({ ...BODY, nickname: "다른닉네임", origin: "busan" }, { newEntryId: () => "gr_00000000000b" })).toEqual({
      status: 409,
      body: { error: "already_registered" },
    });
  });
});

describe("parseGsListQuery", () => {
  const parse = (query: string) => parseGsListQuery(new URLSearchParams(query));

  it("area가 없으면 전체(all), limit이 없으면 50이고 50보다 크면 50", () => {
    expect(parse("")).toEqual({ area: "all", limit: 50, meId: null });
    expect(parse("area=gyeongbuk&limit=10")).toEqual({ area: "gyeongbuk", limit: 10, meId: null });
    expect(parse("area=gyeongnam&limit=500")).toEqual({ area: "gyeongnam", limit: 50, meId: null });
  });

  it.each(["area=seoul", "area=", "area=GYEONGBUK", "limit=0", "limit=abc", "id=r_0123456789ab", "id=gr_123"])(
    "'%s'는 형식 오류(null)",
    (query) => {
      expect(parse(query)).toBeNull();
    },
  );

  it("id는 정밀 랭킹 항목 id 형식만 받는다", () => {
    expect(parse("id=gr_0123456789ab")).toEqual({ area: "all", limit: 50, meId: "gr_0123456789ab" });
  });
});

describe("listGsRanking", () => {
  it("보기, 순위, 등급, 원산지 일치 여부를 붙이고 내 항목을 따로 돌려준다", async () => {
    await register(BODY);
    await store.saveJudgment("g_0123456789ac", { ...RECORD, intensity: 90, gyeongbuk: 30 });
    await register(
      { judgmentId: "g_0123456789ac", nickname: "부산갈매기", origin: "busan" },
      { newEntryId: () => "gr_00000000000b" },
    );

    const all = await listGsRanking({ area: "all", limit: 50, meId: ENTRY_ID }, store);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({
      area: "all",
      total: 2,
      entries: [
        { rank: 1, nickname: "부산갈매기", origin: "busan", intensity: 90, gyeongbuk: 30, grade: 5, matched: true },
        { rank: 2, nickname: "대구토박이", origin: "daegu", intensity: 69, gyeongbuk: 64, grade: 4, matched: true },
      ],
      me: { rank: 2, id: ENTRY_ID },
    });

    const gyeongbuk = await listGsRanking({ area: "gyeongbuk", limit: 50, meId: ENTRY_ID }, store);
    expect(gyeongbuk.body).toMatchObject({ area: "gyeongbuk", total: 1, me: { rank: 1, id: ENTRY_ID } });

    const gyeongnam = await listGsRanking({ area: "gyeongnam", limit: 50, meId: ENTRY_ID }, store);
    expect(gyeongnam.body).toMatchObject({ area: "gyeongnam", total: 1, me: null });
  });
});

describe("toGsView", () => {
  it("50 대 50이면 어느 원산지를 신고했어도 일치다", () => {
    const base = { id: ENTRY_ID, nickname: "반반", intensity: 0, gyeongbuk: 50, registeredAt: "2026-11-20T14:03:00+09:00" };
    expect(toGsView({ rank: 1, entry: { ...base, origin: "ulsan" } })).toMatchObject({
      matched: true,
      grade: 1,
      gradeName: "서울 사람인 척하는 중",
    });
    expect(toGsView({ rank: 1, entry: { ...base, origin: "gyeongbuk" } }).matched).toBe(true);
  });
});

describe("deleteGsRanking", () => {
  it("항목을 지우면 204, 없는 항목이나 형식이 틀린 id(기존 랭킹 id 포함)는 404", async () => {
    await register(BODY);
    expect(await deleteGsRanking(ENTRY_ID, store)).toEqual({ status: 204, body: null });
    expect(await deleteGsRanking(ENTRY_ID, store)).toEqual({ status: 404, body: { error: "not_found" } });
    expect((await deleteGsRanking("r_00000000000a", store)).status).toBe(404);
    expect((await deleteGsRanking("../etc", store)).status).toBe(404);
  });
});
