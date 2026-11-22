import { beforeEach, describe, expect, it } from "vitest";
import {
  GS_RANKING_KEYS,
  createMemoryGsRankingState,
  createMemoryGsRankingStore,
  createUpstashGsRankingStore,
  type GsRankingStore,
} from "../gyeongsang/ranking/store";
import { createFakeUpstash, type FakeUpstash } from "../testing/fake-upstash";
import { nicknameKey, numberedNickname, renamedNotice } from "./nickname";
import {
  RANKING_KEYS,
  createMemoryRankingState,
  createMemoryRankingStore,
  createUpstashRankingStore,
  type RankingStore,
} from "./store";

/**
 * 닉네임이 겹치면 뒤에 숫자를 붙인다(명세 7장). 일반 랭킹과 정밀 감정 랭킹, 메모리 저장소와 Upstash 저장소(가짜 REST)에
 * 같은 시나리오를 돌린다. 등록 Lua 스크립트 자체는 실제 Redis로 따로 확인한다.
 */

/** 등록만 하는 공통 인터페이스: (닉네임) → 최종 닉네임 */
interface Board {
  register(nickname: string): Promise<string>;
  remove(nth: number): Promise<boolean>;
}

let seq = 0;
const nextId = () => (seq += 1).toString(16).padStart(12, "0");

function generalBoard(store: RankingStore): Board {
  const ids: string[] = [];
  return {
    async register(nickname) {
      const id = `r_${nextId()}`;
      ids.push(id);
      const result = await store.register(`j_${nextId()}`, {
        id,
        nickname,
        intensity: 50,
        region: "gyeongsang",
        grade: 3,
        registeredAt: "2026-11-22T10:00:00+09:00",
      });
      return result!.nickname;
    },
    remove: (nth) => store.remove(ids[nth]),
  };
}

function gsBoard(store: GsRankingStore): Board {
  const ids: string[] = [];
  return {
    async register(nickname) {
      const id = `gr_${nextId()}`;
      ids.push(id);
      const result = await store.register(`g_${nextId()}`, {
        id,
        nickname,
        origin: "daegu",
        intensity: 50,
        gyeongbuk: 60,
        registeredAt: "2026-11-22T10:00:00+09:00",
      });
      return result!.nickname;
    },
    remove: (nth) => store.remove(ids[nth]),
  };
}

const fakeStores = (fake: FakeUpstash) => ({
  general: createUpstashRankingStore({ url: "https://fake.upstash.io", token: "t", fetcher: fake.fetcher }),
  gs: createUpstashGsRankingStore({ url: "https://fake.upstash.io", token: "t", fetcher: fake.fetcher }),
});

const boards: Array<[string, () => Board]> = [
  ["일반 랭킹(메모리)", () => generalBoard(createMemoryRankingStore({ state: createMemoryRankingState() }))],
  ["일반 랭킹(Upstash)", () => generalBoard(fakeStores(createFakeUpstash()).general)],
  ["정밀 랭킹(메모리)", () => gsBoard(createMemoryGsRankingStore({ state: createMemoryGsRankingState() }))],
  ["정밀 랭킹(Upstash)", () => gsBoard(fakeStores(createFakeUpstash()).gs)],
];

describe("numberedNickname: 번호 붙이기 규칙", () => {
  it("비어 있으면 그대로, 쓰이고 있으면 1부터 붙이고 붙일 이름도 쓰이고 있으면 다음 번호", () => {
    expect(numberedNickname("냥이", () => false)).toEqual({ nickname: "냥이", key: "냥이" });
    const taken = new Set(["냥이", "냥이1"]);
    expect(numberedNickname("냥이", (key) => taken.has(key))).toEqual({ nickname: "냥이2", key: "냥이2" });
  });

  it("비교 키는 NFC와 영문 소문자이고, 표기는 입력 그대로다", () => {
    expect(nicknameKey("Admin")).toBe("admin");
    expect(nicknameKey("한글".normalize("NFD"))).toBe("한글");
    expect(numberedNickname("ADMIN", (key) => key === "admin")).toEqual({ nickname: "ADMIN1", key: "admin1" });
  });
});

describe("renamedNotice: 등록 완료 화면의 안내", () => {
  it("숫자가 붙었으면 안내 문구, 그대로면 null", () => {
    expect(renamedNotice("냥이", "냥이1")).toBe("같은 닉네임이 있어 '냥이1'(으)로 등록되었습니다.");
    expect(renamedNotice("냥이", "냥이")).toBeNull();
    expect(renamedNotice("admin", "admin1")).toBe("같은 닉네임이 있어 'admin1'(으)로 등록되었습니다.");
  });
});

describe.each(boards)("%s: 닉네임이 겹치면 뒤에 숫자", (_name, makeBoard) => {
  let board: Board;
  beforeEach(() => {
    board = makeBoard();
  });

  it("같은 닉네임을 세 번 등록하면 냥이, 냥이1, 냥이2", async () => {
    expect(await board.register("냥이")).toBe("냥이");
    expect(await board.register("냥이")).toBe("냥이1");
    expect(await board.register("냥이")).toBe("냥이2");
  });

  it("'냥이1'이 먼저 있으면 두 번째 '냥이'는 '냥이2'", async () => {
    expect(await board.register("냥이1")).toBe("냥이1");
    expect(await board.register("냥이")).toBe("냥이");
    expect(await board.register("냥이")).toBe("냥이2");
  });

  it("영문 대소문자만 다른 닉네임은 겹친 것으로 보고, 표기는 입력 그대로 둔다", async () => {
    expect(await board.register("Admin")).toBe("Admin");
    expect(await board.register("admin")).toBe("admin1");
    expect(await board.register("ADMIN")).toBe("ADMIN2");
  });

  it("10자 닉네임이 겹치면 11자가 된다", async () => {
    expect(await board.register("가나다라마바사아자차")).toBe("가나다라마바사아자차");
    expect(await board.register("가나다라마바사아자차")).toBe("가나다라마바사아자차1");
  });

  it("삭제한 이름은 다시 쓸 수 있다", async () => {
    expect(await board.register("냥이")).toBe("냥이");
    expect(await board.register("냥이")).toBe("냥이1");
    expect(await board.remove(0)).toBe(true);
    expect(await board.register("냥이")).toBe("냥이");
    expect(await board.remove(1)).toBe(true);
    expect(await board.register("냥이")).toBe("냥이1");
  });
});

describe("일반 랭킹과 정밀 랭킹은 이름을 따로 센다", () => {
  it("메모리 저장소", async () => {
    const general = generalBoard(createMemoryRankingStore({ state: createMemoryRankingState() }));
    const gs = gsBoard(createMemoryGsRankingStore({ state: createMemoryGsRankingState() }));
    expect(await general.register("냥이")).toBe("냥이");
    expect(await gs.register("냥이")).toBe("냥이");
    expect(await general.register("냥이")).toBe("냥이1");
    expect(await gs.register("냥이")).toBe("냥이1");
  });

  it("같은 Redis를 써도 이름 집합 키가 다르다(co:ranking:names, co:gs:ranking:names)", async () => {
    const fake = createFakeUpstash();
    const stores = fakeStores(fake);
    const general = generalBoard(stores.general);
    const gs = gsBoard(stores.gs);
    expect(await general.register("냥이")).toBe("냥이");
    expect(await gs.register("냥이")).toBe("냥이");
    expect(fake.keys()).toEqual(expect.arrayContaining([RANKING_KEYS.names, "co:gs:ranking:names"]));
  });
});

describe("이름 집합이 생기기 전에 등록된 항목", () => {
  it("메모리 저장소: 이름 집합이 없는 상태에 항목이 있어도 그 이름을 쓰이고 있는 것으로 본다", async () => {
    const state = createMemoryRankingState();
    const store = createMemoryRankingStore({ state });
    const board = generalBoard(store);
    expect(await board.register("냥이")).toBe("냥이");
    delete state.names;
    expect(await board.register("냥이")).toBe("냥이1");
    expect(await board.register("Admin")).toBe("Admin");
  });

  it("Upstash 저장소: 이름 집합 키가 없어도 오류 없이 항목 해시의 닉네임으로 채운 뒤 번호를 붙인다", async () => {
    const fake = createFakeUpstash();
    // 이 기능 전에 등록된 항목: 항목 해시와 정렬 집합만 있고 이름 집합은 없다.
    const legacy = JSON.stringify({
      id: "r_00000000aaaa",
      nickname: "Neko",
      intensity: 70,
      region: "gyeongsang",
      grade: 2,
      registeredAt: "2026-11-21T10:00:00+09:00",
    });
    await fake.fetcher("https://fake.upstash.io/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer t" },
      body: JSON.stringify([
        ["HSET", RANKING_KEYS.entries, "r_00000000aaaa", legacy],
        ["ZADD", RANKING_KEYS.order, "1", "r_00000000aaaa"],
      ]),
    });
    expect(fake.keys()).not.toContain(RANKING_KEYS.names);

    const board = generalBoard(fakeStores(fake).general);
    expect(await board.register("neko")).toBe("neko1");
    expect(fake.keys()).toContain(RANKING_KEYS.names);

    // 지운 이전 항목의 이름도 이름 집합에서 빠져 다시 쓸 수 있다.
    await expect(fakeStores(fake).general.remove("r_00000000aaaa")).resolves.toBe(true);
    expect(await board.register("NEKO")).toBe("NEKO");
  });
});

describe("이름 집합이 생기기 전에 같은 닉네임이 두 번 등록돼 있었으면", () => {
  /** 이 기능 전에는 겹치는 닉네임도 그대로 등록됐다: Neko(…a1)와 neko(…a2) */
  const legacyGeneral = (id: string, nickname: string) => ({
    id,
    nickname,
    intensity: 70,
    region: "gyeongsang" as const,
    grade: 2 as const,
    registeredAt: "2026-11-21T10:00:00+09:00",
  });
  const legacyGs = (id: string, nickname: string) => ({
    id,
    nickname,
    origin: "daegu" as const,
    intensity: 70,
    gyeongbuk: 60,
    registeredAt: "2026-11-21T10:00:00+09:00",
  });

  /** 하나를 지워도 남은 항목이 그 이름을 쓰고 있으므로 다시 번호가 붙고, 둘 다 지우면 그 이름을 쓸 수 있다 */
  async function expectNameKeptWhileUsed(board: Board, remove: (id: string) => Promise<boolean>, ids: [string, string]) {
    expect(await board.register("냥이")).toBe("냥이"); // 이름 집합을 이전 항목으로 채운다
    await expect(remove(ids[0])).resolves.toBe(true);
    expect(await board.register("NEKO")).toBe("NEKO1");
    await expect(remove(ids[1])).resolves.toBe(true);
    expect(await board.register("neko")).toBe("neko");
  }

  it("메모리 저장소(일반 랭킹): 하나를 지워도 남은 항목의 이름은 계속 쓰이고 있다", async () => {
    const state = createMemoryRankingState();
    delete state.names;
    const ids: [string, string] = ["r_00000000aaa1", "r_00000000aaa2"];
    state.entries.set(ids[0], { entry: legacyGeneral(ids[0], "Neko"), score: 2 });
    state.entries.set(ids[1], { entry: legacyGeneral(ids[1], "neko"), score: 1 });
    const store = createMemoryRankingStore({ state });
    await expectNameKeptWhileUsed(generalBoard(store), (id) => store.remove(id), ids);
  });

  it("메모리 저장소(정밀 랭킹): 하나를 지워도 남은 항목의 이름은 계속 쓰이고 있다", async () => {
    const state = createMemoryGsRankingState();
    delete state.names;
    const ids: [string, string] = ["gr_00000000aaa1", "gr_00000000aaa2"];
    state.entries.set(ids[0], { entry: legacyGs(ids[0], "Neko"), score: 2 });
    state.entries.set(ids[1], { entry: legacyGs(ids[1], "neko"), score: 1 });
    const store = createMemoryGsRankingStore({ state });
    await expectNameKeptWhileUsed(gsBoard(store), (id) => store.remove(id), ids);
  });

  it("Upstash 저장소(일반 랭킹과 정밀 랭킹): 하나를 지워도 남은 항목의 이름은 계속 쓰이고 있다", async () => {
    const fake = createFakeUpstash();
    const general: [string, string] = ["r_00000000aaa1", "r_00000000aaa2"];
    const gs: [string, string] = ["gr_00000000aaa1", "gr_00000000aaa2"];
    await fake.fetcher("https://fake.upstash.io/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer t" },
      body: JSON.stringify([
        ["HSET", RANKING_KEYS.entries, general[0], JSON.stringify(legacyGeneral(general[0], "Neko"))],
        ["HSET", RANKING_KEYS.entries, general[1], JSON.stringify(legacyGeneral(general[1], "neko"))],
        ["ZADD", RANKING_KEYS.order, "2", general[0]],
        ["ZADD", RANKING_KEYS.order, "1", general[1]],
        ["HSET", GS_RANKING_KEYS.entries, gs[0], JSON.stringify(legacyGs(gs[0], "Neko"))],
        ["HSET", GS_RANKING_KEYS.entries, gs[1], JSON.stringify(legacyGs(gs[1], "neko"))],
        ...gs.flatMap((id, index) => [
          ["ZADD", GS_RANKING_KEYS.order("all"), String(2 - index), id],
          ["ZADD", GS_RANKING_KEYS.order("gyeongbuk"), String(2 - index), id],
        ]),
      ]),
    });
    const stores = fakeStores(fake);
    await expectNameKeptWhileUsed(generalBoard(stores.general), (id) => stores.general.remove(id), general);
    await expectNameKeptWhileUsed(gsBoard(stores.gs), (id) => stores.gs.remove(id), gs);
  });
});
