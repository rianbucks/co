/**
 * 테스트용 가짜 Upstash REST(/pipeline). 랭킹 저장소가 쓰는 Redis 명령만 흉내 낸다.
 * Lua는 실행하지 못하므로 알려진 스크립트(농도 랭킹과 정밀 랭킹의 등록, 삭제)만 같은 의미로 처리한다.
 * 실제 Lua는 실제 Redis로 따로 확인한다(명세 7장 닉네임 번호).
 */
import { GS_REGISTER_SCRIPT, GS_REMOVE_SCRIPT } from "../gyeongsang/ranking/store";
import { REGISTER_SCRIPT, REMOVE_SCRIPT } from "../ranking/store";
import type { Fetcher } from "../upstash";

type StoredValue =
  | { kind: "string"; value: string }
  | { kind: "hash"; value: Map<string, string> }
  | { kind: "zset"; value: Map<string, number> }
  | { kind: "set"; value: Set<string> };

/** Lua string.lower처럼 영문만 소문자로 바꾼다. */
const luaLower = (text: string) => text.replace(/[A-Z]/g, (char) => char.toLowerCase());
/** 항목 JSON에서 닉네임을 꺼낸다(등록·삭제 스크립트의 string.match와 같다). */
const storedNickname = (raw: string) => /"nickname":"(.*?)"/.exec(raw)?.[1] ?? null;

export interface FakeUpstash {
  fetcher: Fetcher;
  /** 받은 요청 본문(명령 배열)을 순서대로 */
  requests: string[][][];
  /** 만료되지 않은 키 */
  keys(): string[];
  /** 문자열 값 그대로(만료됐으면 null) */
  rawString(key: string): string | null;
}

export function createFakeUpstash({
  now = Date.now,
  token,
}: { now?: () => number; token?: string } = {}): FakeUpstash {
  const data = new Map<string, { item: StoredValue; expiresAt: number | null }>();
  const requests: string[][][] = [];

  function read(key: string): StoredValue | null {
    const entry = data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= now()) {
      data.delete(key);
      return null;
    }
    return entry.item;
  }

  function readKind<K extends StoredValue["kind"]>(key: string, kind: K) {
    const item = read(key);
    if (item === null) return null;
    if (item.kind !== kind) throw new Error("WRONGTYPE Operation against a key holding the wrong kind of value");
    return item as Extract<StoredValue, { kind: K }>;
  }

  function hash(key: string, create: boolean): Map<string, string> | null {
    const item = readKind(key, "hash");
    if (item) return item.value;
    if (!create) return null;
    const value = new Map<string, string>();
    data.set(key, { item: { kind: "hash", value }, expiresAt: null });
    return value;
  }

  function members(key: string, create: boolean): Set<string> | null {
    const item = readKind(key, "set");
    if (item) return item.value;
    if (!create) return null;
    const value = new Set<string>();
    data.set(key, { item: { kind: "set", value }, expiresAt: null });
    return value;
  }

  function zset(key: string, create: boolean): Map<string, number> | null {
    const item = readKind(key, "zset");
    if (item) return item.value;
    if (!create) return null;
    const value = new Map<string, number>();
    data.set(key, { item: { kind: "zset", value }, expiresAt: null });
    return value;
  }

  /** ZREVRANGE 순서: 점수 내림차순, 점수가 같으면 멤버 내림차순 */
  function reverseOrder(members: Map<string, number>): string[] {
    return [...members.entries()]
      .sort(([a, scoreA], [b, scoreB]) => scoreB - scoreA || (a < b ? 1 : a > b ? -1 : 0))
      .map(([member]) => member);
  }

  function dropEmpty(key: string, collection: { size: number }) {
    if (collection.size === 0) data.delete(key);
  }

  function set(key: string, value: string, options: string[]): "OK" | null {
    let expiresAt: number | null = null;
    let onlyIfAbsent = false;
    for (let i = 0; i < options.length; i += 1) {
      const option = options[i].toUpperCase();
      if (option === "NX") onlyIfAbsent = true;
      else if (option === "EX") expiresAt = now() + Number(options[++i]) * 1000;
      else throw new Error(`fake upstash: unsupported SET option ${option}`);
    }
    if (onlyIfAbsent && read(key) !== null) return null;
    data.set(key, { item: { kind: "string", value }, expiresAt });
    return "OK";
  }

  function exec(command: string[]): unknown {
    const [name, ...args] = command;
    switch (name.toUpperCase()) {
      case "GET":
        return readKind(args[0], "string")?.value ?? null;
      case "SET":
        return set(args[0], args[1], args.slice(2));
      case "HSET": {
        const fields = hash(args[0], true)!;
        let added = 0;
        for (let i = 1; i < args.length; i += 2) {
          if (!fields.has(args[i])) added += 1;
          fields.set(args[i], args[i + 1]);
        }
        return added;
      }
      case "HGET":
        return hash(args[0], false)?.get(args[1]) ?? null;
      case "HVALS":
        return [...(hash(args[0], false)?.values() ?? [])];
      case "EXISTS":
        return args.filter((key) => read(key) !== null).length;
      case "SADD": {
        const set = members(args[0], true)!;
        return args.slice(1).filter((member) => !set.has(member) && set.add(member)).length;
      }
      case "SREM": {
        const set = members(args[0], false);
        if (!set) return 0;
        const removed = args.slice(1).filter((member) => set.delete(member)).length;
        dropEmpty(args[0], set);
        return removed;
      }
      case "SISMEMBER":
        return members(args[0], false)?.has(args[1]) ? 1 : 0;
      case "HMGET": {
        const fields = hash(args[0], false);
        return args.slice(1).map((field) => fields?.get(field) ?? null);
      }
      case "HDEL": {
        const fields = hash(args[0], false);
        if (!fields) return 0;
        const removed = args.slice(1).filter((field) => fields.delete(field)).length;
        dropEmpty(args[0], fields);
        return removed;
      }
      case "ZADD": {
        const members = zset(args[0], true)!;
        const added = members.has(args[2]) ? 0 : 1;
        members.set(args[2], Number(args[1]));
        return added;
      }
      case "ZREM": {
        const members = zset(args[0], false);
        if (!members) return 0;
        const removed = args.slice(1).filter((member) => members.delete(member)).length;
        dropEmpty(args[0], members);
        return removed;
      }
      case "ZCARD":
        return zset(args[0], false)?.size ?? 0;
      case "ZREVRANGE": {
        const members = zset(args[0], false);
        if (!members) return [];
        return reverseOrder(members).slice(Number(args[1]), Number(args[2]) + 1);
      }
      case "ZREVRANK": {
        const members = zset(args[0], false);
        if (!members?.has(args[1])) return null;
        return reverseOrder(members).indexOf(args[1]);
      }
      case "EVAL": {
        const [script, numKeys, ...rest] = args;
        const keys = rest.slice(0, Number(numKeys));
        const argv = rest.slice(Number(numKeys));
        if (script === REGISTER_SCRIPT || script === GS_REGISTER_SCRIPT) {
          // 정밀 랭킹 등록은 보기 정렬 집합에도 넣고, 이름 집합이 다섯 번째 키다.
          const gs = script === GS_REGISTER_SCRIPT;
          const [claimKey, entriesKey, orderKey] = keys;
          const areaKey = gs ? keys[3] : null;
          const namesKey = gs ? keys[4] : keys[3];
          const [entryId, head, tail, score, ttlSeconds, base, baseKey] = argv;
          if (set(claimKey, entryId, ["NX", "EX", ttlSeconds]) === null) return [0, ""];
          // 이름 집합이 없으면 이미 있는 항목의 닉네임으로 채운다.
          if (read(namesKey) === null) {
            for (const raw of hash(entriesKey, false)?.values() ?? []) {
              const nickname = storedNickname(raw);
              if (nickname) exec(["SADD", namesKey, luaLower(nickname)]);
            }
          }
          let name = base;
          let key = baseKey;
          for (let n = 1; exec(["SISMEMBER", namesKey, key]) === 1; n += 1) {
            name = `${base}${n}`;
            key = `${baseKey}${n}`;
          }
          exec(["SADD", namesKey, key]);
          exec(["HSET", entriesKey, entryId, `${head}${name}${tail}`]);
          exec(["ZADD", orderKey, score, entryId]);
          if (areaKey) exec(["ZADD", areaKey, score, entryId]);
          return [(exec(["ZREVRANK", orderKey, entryId]) as number) + 1, name];
        }
        if (script === REMOVE_SCRIPT || script === GS_REMOVE_SCRIPT) {
          const gs = script === GS_REMOVE_SCRIPT;
          const orderKeys = gs ? keys.slice(0, 3) : keys.slice(0, 1);
          const [entriesKey, namesKey] = gs ? keys.slice(3) : keys.slice(1);
          const [entryId] = argv;
          const raw = exec(["HGET", entriesKey, entryId]) as string | null;
          let removed = 0;
          for (const orderKey of orderKeys) removed += exec(["ZREM", orderKey, entryId]) as number;
          removed += exec(["HDEL", entriesKey, entryId]) as number;
          // 남은 항목 중에 같은 이름을 쓰는 항목이 있으면 이름 집합에서 빼지 않는다.
          const nickname = raw ? storedNickname(raw) : null;
          if (nickname) {
            const key = luaLower(nickname);
            const shared = [...(hash(entriesKey, false)?.values() ?? [])].some((other) => {
              const otherName = storedNickname(other);
              return otherName !== null && luaLower(otherName) === key;
            });
            if (!shared) exec(["SREM", namesKey, key]);
          }
          return removed;
        }
        throw new Error("fake upstash: unknown script");
      }
      default:
        throw new Error(`fake upstash: unsupported command ${name}`);
    }
  }

  const fetcher: Fetcher = async (url, init) => {
    if (!url.endsWith("/pipeline")) return new Response("not found", { status: 404 });
    const authorization = (init.headers as Record<string, string> | undefined)?.Authorization;
    if (token !== undefined && authorization !== `Bearer ${token}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const commands = JSON.parse(String(init.body)) as string[][];
    requests.push(commands);
    const results = commands.map((command) => {
      try {
        return { result: exec(command) };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    });
    return Response.json(results);
  };

  return {
    fetcher,
    requests,
    keys: () => [...data.keys()].filter((key) => read(key) !== null),
    rawString: (key) => readKind(key, "string")?.value ?? null,
  };
}
