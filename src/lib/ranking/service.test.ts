import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "../rate-limit";
import {
  ADMIN_TOKEN_MIN_LENGTH,
  deleteRanking,
  isAdminRequest,
  listRanking,
  parseListQuery,
  registerRanking,
  type RegisterDeps,
} from "./service";
import {
  createMemoryRankingState,
  createMemoryRankingStore,
  type JudgmentRecord,
  type MemoryRankingState,
  type RankingStore,
} from "./store";

const JUDGMENT_ID = "j_0123456789ab";
const ENTRY_ID = "r_00000000000a";
const CLIENT_IP = "203.0.113.7";
const T0 = Date.parse("2026-11-20T14:00:00+09:00");

const RECORD: JudgmentRecord = {
  intensity: 68,
  region: "gyeongsang",
  grade: 2,
  mock: false,
  uncertain: false,
  instructionAttempt: false,
};

let clock: number;
let state: MemoryRankingState;
let store: RankingStore;
let limiter: { check: ReturnType<typeof vi.fn<RateLimiter["check"]>> };

function deps(overrides: Partial<RegisterDeps> = {}): RegisterDeps {
  return {
    store,
    rateLimiter: limiter,
    mock: false,
    now: () => new Date("2026-11-20T14:03:00+09:00"),
    newEntryId: () => ENTRY_ID,
    ...overrides,
  };
}

function register(body: unknown, overrides: Partial<RegisterDeps> = {}) {
  return registerRanking({ body, clientIp: CLIENT_IP }, deps(overrides));
}

beforeEach(async () => {
  clock = T0;
  state = createMemoryRankingState();
  store = createMemoryRankingStore({ now: () => clock, state });
  limiter = { check: vi.fn<RateLimiter["check"]>(async () => ({ allowed: true })) };
  await store.saveJudgment(JUDGMENT_ID, RECORD);
});

describe("registerRanking", () => {
  it("같은 닉네임이 이미 있으면 뒤에 숫자를 붙여 등록하고, 응답에 최종 닉네임을 담는다", async () => {
    await store.saveJudgment("j_00000000000a", RECORD);
    await store.saveJudgment("j_00000000000b", RECORD);
    const first = await register({ judgmentId: "j_00000000000a", nickname: "냥이" }, { newEntryId: () => "r_0000000000a1" });
    const second = await register({ judgmentId: "j_00000000000b", nickname: "냥이" }, { newEntryId: () => "r_0000000000a2" });
    expect(first).toMatchObject({ status: 201, body: { entry: { id: "r_0000000000a1", nickname: "냥이" } } });
    expect(second).toMatchObject({ status: 201, body: { entry: { id: "r_0000000000a2", nickname: "냥이1" } } });
    // 저장된 항목도 최종 닉네임이다(목록과 내 순위가 이 이름으로 나온다).
    const page = await store.list(50, "r_0000000000a2");
    expect(page.me?.entry.nickname).toBe("냥이1");
  });

  it("닉네임 검사는 입력 닉네임에만 한다: 10자 닉네임이 겹쳐 11자가 되어도 등록된다", async () => {
    await store.saveJudgment("j_00000000000a", RECORD);
    await store.saveJudgment("j_00000000000b", RECORD);
    await register({ judgmentId: "j_00000000000a", nickname: "가나다라마바사아자차" }, { newEntryId: () => "r_0000000000a1" });
    const second = await register(
      { judgmentId: "j_00000000000b", nickname: "가나다라마바사아자차" },
      { newEntryId: () => "r_0000000000a2" },
    );
    expect(second).toMatchObject({ status: 201, body: { entry: { nickname: "가나다라마바사아자차1" } } });
  });

  it("감정할 때 서버가 남긴 농도, 지역, 등급으로 등록하고 201과 순위를 돌려준다", async () => {
    const outcome = await register({ judgmentId: JUDGMENT_ID, nickname: "경상도사람" });

    expect(outcome).toEqual({
      status: 201,
      body: {
        entry: {
          rank: 1,
          id: ENTRY_ID,
          nickname: "경상도사람",
          intensity: 68,
          region: "gyeongsang",
          grade: 2,
          gradeName: "자막 필요",
          registeredAt: "2026-11-20T14:03:00+09:00",
        },
      },
    });
    expect(limiter.check).toHaveBeenCalledWith({ ip: CLIENT_IP });
  });

  it("클라이언트가 보낸 점수, 지역, 등급은 무시한다", async () => {
    const outcome = await register({
      judgmentId: JUDGMENT_ID,
      nickname: "만점주장",
      intensity: 100,
      score: 100,
      grade: 1,
      region: "jeju",
    });

    expect(outcome.status).toBe(201);
    expect(outcome.body).toMatchObject({ entry: { intensity: 68, grade: 2, region: "gyeongsang" } });
  });

  it("저장소에는 닉네임, 농도, 지역, 등급, 등록 시각(와 id)만 남고 IP는 남지 않는다", async () => {
    await register({ judgmentId: JUDGMENT_ID, nickname: "경상도사람" });

    const stored = [...state.entries.values()].map(({ entry }) => entry);
    expect(stored).toEqual([
      {
        id: ENTRY_ID,
        nickname: "경상도사람",
        intensity: 68,
        region: "gyeongsang",
        grade: 2,
        registeredAt: "2026-11-20T14:03:00+09:00",
      },
    ]);
    expect(JSON.stringify([...state.entries.values()])).not.toContain(CLIENT_IP);
  });

  it("닉네임의 앞뒤 공백은 떼고 저장한다", async () => {
    const outcome = await register({ judgmentId: JUDGMENT_ID, nickname: "  Busan99 " });
    expect(outcome.body).toMatchObject({ entry: { nickname: "Busan99" } });
  });

  it.each([
    ["본문이 객체가 아님", "judgmentId"],
    ["배열", [JUDGMENT_ID, "닉네임"]],
    ["null", null],
    ["judgmentId 없음", { nickname: "닉네임" }],
    ["judgmentId 형식 오류", { judgmentId: "j_123", nickname: "닉네임" }],
    ["랭킹 항목 id를 보냄", { judgmentId: "r_0123456789ab", nickname: "닉네임" }],
    ["대문자 16진", { judgmentId: "j_0123456789AB", nickname: "닉네임" }],
    ["nickname 없음", { judgmentId: JUDGMENT_ID }],
    ["nickname이 숫자", { judgmentId: JUDGMENT_ID, nickname: 1234 }],
  ])("형식이 틀리면 400 invalid_request: %s", async (_label, body) => {
    await expect(register(body)).resolves.toEqual({ status: 400, body: { error: "invalid_request" } });
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it.each([
    ["가", "length"],
    ["가나다라마바사아자차카", "length"],
    ["홍 길동", "characters"],
    ["nick_name", "characters"],
    ["시1발", "banned"],
    ["ㅅㅂ", "banned"],
    ["fuck", "banned"],
  ])("닉네임 규칙을 어기면 400 invalid_nickname: %s", async (nickname, reason) => {
    await expect(register({ judgmentId: JUDGMENT_ID, nickname })).resolves.toEqual({
      status: 400,
      body: { error: "invalid_nickname", reason },
    });
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it("서버가 가짜 응답 모드면 기록을 찾지 않고 403 not_eligible(mock)", async () => {
    const getJudgment = vi.spyOn(store, "getJudgment");
    await expect(register({ judgmentId: JUDGMENT_ID, nickname: "닉네임" }, { mock: true })).resolves.toEqual(
      { status: 403, body: { error: "not_eligible", reason: "mock" } },
    );
    expect(getJudgment).not.toHaveBeenCalled();
    expect(state.entries.size).toBe(0);
  });

  it("가짜 응답 모드에서 받은 감정 결과는 403 not_eligible(mock)", async () => {
    await store.saveJudgment("j_00000000000b", { ...RECORD, mock: true });
    await expect(register({ judgmentId: "j_00000000000b", nickname: "닉네임" })).resolves.toEqual({
      status: 403,
      body: { error: "not_eligible", reason: "mock" },
    });
    expect(limiter.check).not.toHaveBeenCalled();
  });

  it("녹음 내용으로는 막지 않는다: 이전에 flags가 붙어 저장된 기록도 등록된다", async () => {
    await store.saveJudgment("j_00000000000c", { ...RECORD, flagged: true } as JudgmentRecord);
    await expect(register({ judgmentId: "j_00000000000c", nickname: "닉네임" })).resolves.toMatchObject({
      status: 201,
      body: { entry: { nickname: "닉네임", intensity: 68, region: "gyeongsang" } },
    });
    expect(state.entries.size).toBe(1);
  });

  it("판정 유보 결과는 403 not_eligible(uncertain)이고 한도를 쓰지 않는다", async () => {
    await store.saveJudgment("j_00000000000d", { ...RECORD, uncertain: true });
    await expect(register({ judgmentId: "j_00000000000d", nickname: "닉네임" })).resolves.toEqual({
      status: 403,
      body: { error: "not_eligible", reason: "uncertain" },
    });
    expect(limiter.check).not.toHaveBeenCalled();
    expect(state.entries.size).toBe(0);
  });

  it("녹음이 감정 결과를 지시하려 한 결과는 403 not_eligible(instruction)이고 한도를 쓰지 않는다", async () => {
    await store.saveJudgment("j_00000000000e", { ...RECORD, instructionAttempt: true });
    await expect(register({ judgmentId: "j_00000000000e", nickname: "닉네임" })).resolves.toEqual({
      status: 403,
      body: { error: "not_eligible", reason: "instruction" },
    });
    expect(limiter.check).not.toHaveBeenCalled();
    expect(state.entries.size).toBe(0);
  });

  it("판정 유보이면서 지시 발화도 있으면 지시 발화(instruction)로 거절한다", async () => {
    await store.saveJudgment("j_00000000000f", { ...RECORD, uncertain: true, instructionAttempt: true });
    expect((await register({ judgmentId: "j_00000000000f", nickname: "닉네임" })).body).toEqual({
      error: "not_eligible",
      reason: "instruction",
    });
  });

  it("감정 기록이 없거나 1시간이 지났으면 404 not_found", async () => {
    await expect(register({ judgmentId: "j_ffffffffffff", nickname: "닉네임" })).resolves.toEqual({
      status: 404,
      body: { error: "not_found" },
    });

    clock = T0 + 60 * 60 * 1000;
    await expect(register({ judgmentId: JUDGMENT_ID, nickname: "닉네임" })).resolves.toEqual({
      status: 404,
      body: { error: "not_found" },
    });
  });

  it("IP당 하루 한도를 넘으면 429 rate_limited이고 등록하지 않는다", async () => {
    limiter.check.mockResolvedValueOnce({ allowed: false, scope: "ip" });
    await expect(register({ judgmentId: JUDGMENT_ID, nickname: "닉네임" })).resolves.toEqual({
      status: 429,
      body: { error: "rate_limited" },
    });
    expect(state.entries.size).toBe(0);

    // 한도에 걸린 시도는 감정의 1회 등록 기회를 쓰지 않는다.
    await expect(register({ judgmentId: JUDGMENT_ID, nickname: "닉네임" })).resolves.toMatchObject({
      status: 201,
    });
  });

  it("같은 감정 결과로 두 번 등록하면 409 already_registered", async () => {
    await register({ judgmentId: JUDGMENT_ID, nickname: "첫번째" });
    await expect(
      register({ judgmentId: JUDGMENT_ID, nickname: "두번째" }, { newEntryId: () => "r_00000000000b" }),
    ).resolves.toEqual({ status: 409, body: { error: "already_registered" } });

    expect([...state.entries.values()].map(({ entry }) => entry.nickname)).toEqual(["첫번째"]);
  });
});

describe("parseListQuery", () => {
  const parse = (query: string) => parseListQuery(new URLSearchParams(query));

  it("limit이 없으면 50, 50보다 크면 50", () => {
    expect(parse("")).toEqual({ limit: 50, meId: null });
    expect(parse("limit=10")).toEqual({ limit: 10, meId: null });
    expect(parse("limit=500")).toEqual({ limit: 50, meId: null });
  });

  it.each(["limit=0", "limit=-1", "limit=abc", "limit=1.5", "limit=", "limit=9999999"])(
    "limit이 1 이상의 정수가 아니면 null: %s",
    (query) => {
      expect(parse(query)).toBeNull();
    },
  );

  it("id는 랭킹 항목 id 형식만 받는다", () => {
    expect(parse(`limit=50&id=${ENTRY_ID}`)).toEqual({ limit: 50, meId: ENTRY_ID });
    expect(parse(`id=${JUDGMENT_ID}`)).toBeNull();
    expect(parse("id=")).toBeNull();
  });
});

describe("listRanking", () => {
  it("순위, 등급명을 붙이고 내 항목을 따로 돌려준다", async () => {
    await register({ judgmentId: JUDGMENT_ID, nickname: "경상도사람" });

    const outcome = await listRanking({ limit: 50, meId: ENTRY_ID }, store);
    const view = {
      rank: 1,
      id: ENTRY_ID,
      nickname: "경상도사람",
      intensity: 68,
      region: "gyeongsang",
      grade: 2,
      gradeName: "자막 필요",
      registeredAt: "2026-11-20T14:03:00+09:00",
    };
    expect(outcome).toEqual({ status: 200, body: { entries: [view], total: 1, me: view } });
  });

  it("예전 등급으로 저장된 항목도 농도에 맞춰 표시한다", async () => {
    await store.register(JUDGMENT_ID, {
      id: ENTRY_ID, nickname: "경상도사람", intensity: 68, region: "gyeongsang",
      grade: 4, registeredAt: "2026-11-20T14:03:00+09:00",
    });
    const outcome = await listRanking({ limit: 50, meId: ENTRY_ID }, store);
    expect(outcome.body).toMatchObject({ entries: [{ grade: 2 }], me: { grade: 2 } });
  });

  it("id가 없으면 me는 null", async () => {
    await expect(listRanking({ limit: 50, meId: null }, store)).resolves.toEqual({
      status: 200,
      body: { entries: [], total: 0, me: null },
    });
  });
});

describe("isAdminRequest", () => {
  const TOKEN = "admin-token-0123456789abcdef";

  it("ADMIN_TOKEN이 없거나 16자보다 짧으면 누구도 통과하지 못한다", () => {
    expect(ADMIN_TOKEN_MIN_LENGTH).toBe(16);
    expect(isAdminRequest("Bearer anything", undefined)).toBe(false);
    expect(isAdminRequest("Bearer ", "")).toBe(false);
    expect(isAdminRequest("Bearer short", "short")).toBe(false);
  });

  it("Bearer 토큰이 같을 때만 통과한다", () => {
    expect(isAdminRequest(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isAdminRequest(`bearer ${TOKEN}`, ` ${TOKEN} `)).toBe(true);
    expect(isAdminRequest(null, TOKEN)).toBe(false);
    expect(isAdminRequest(TOKEN, TOKEN)).toBe(false);
    expect(isAdminRequest(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(isAdminRequest(`Basic ${TOKEN}`, TOKEN)).toBe(false);
  });
});

describe("deleteRanking", () => {
  it("항목을 지우면 204, 없는 항목이나 형식이 틀린 id는 404", async () => {
    await register({ judgmentId: JUDGMENT_ID, nickname: "지울이름" });

    await expect(deleteRanking(ENTRY_ID, store)).resolves.toEqual({ status: 204, body: null });
    await expect(deleteRanking(ENTRY_ID, store)).resolves.toEqual({
      status: 404,
      body: { error: "not_found" },
    });
    await expect(deleteRanking("../../etc", store)).resolves.toEqual({
      status: 404,
      body: { error: "not_found" },
    });
    await expect(listRanking({ limit: 50, meId: ENTRY_ID }, store)).resolves.toMatchObject({
      body: { entries: [], total: 0, me: null },
    });
  });
});
