import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_AUDIO_BYTES } from "@/lib/judge/audio";
import { SET_A_MODEL_OUTPUT_EXAMPLE, SPEC_MODEL_OUTPUT_EXAMPLE } from "@/lib/judge/mock";
import { GS_MOCK_MODEL_OUTPUT } from "@/lib/gyeongsang/mock";
import { GS_QUESTION_TEXTS } from "@/lib/gyeongsang/questions";
import { DAILY_IP_LIMIT } from "@/lib/rate-limit";
import { DEFAULT_AI_TIMING } from "@/lib/judge/pipeline";
import { POST, maxDuration } from "./route";

const WAV_HEADER = new Uint8Array([
  ...[..."RIFF"].map((c) => c.charCodeAt(0)),
  0x24,
  0,
  0,
  0,
  ...[..."WAVEfmt "].map((c) => c.charCodeAt(0)),
]);

function wavFile(size = 64): File {
  const content = new Uint8Array(size);
  content.set(WAV_HEADER);
  return new File([content], "recording.wav", { type: "audio/wav" });
}

function postForm(fields: Record<string, string | Blob>, headers: Record<string, string> = {}): Request {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new Request("http://localhost/api/judge", { method: "POST", body: form, headers });
}

/** 로컬 메모리 제한기를 쓰도록 Upstash 연결 값을 비운다. */
function useMemoryRateLimiter() {
  for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
    vi.stubEnv(name, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("route 실행 시간", () => {
  it("maxDuration(초)은 AI 호출 전체 제한(40초)보다 크다", () => {
    expect(maxDuration * 1000).toBeGreaterThan(DEFAULT_AI_TIMING.totalMs);
  });
});

describe("POST /api/judge", () => {
  it("MOCK_AI=true면 Gemini 없이 4장 예시(기본 세트 set-b)를 후처리한 200 결과를 돌려준다", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-b" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body).toMatchObject({
      region: { top: "gyeongsang", label: "경상 방언", mixed: false },
      intensity: { score: 68, grade: 2, gradeName: "자막 필요" },
      transcript: SPEC_MODEL_OUTPUT_EXAMPLE.transcript,
    });
    expect(body.imitationSuspected).toBe(false);
    expect(body.region.uncertain).toBe(false);
    expect(body.evidence).toHaveLength(7);
    expect(body.evidence[0]).toEqual({
      question: 1,
      quote: "어디고",
      type: "endings",
      region: "gyeongsang",
      note: "'어디야'를 의문사와 함께 쓰는 경상 방언 의문형 어미 '-고'로 바꿔 말함",
    });
    expect(body.segments).toHaveLength(6);
    expect(body.segments[0]).toEqual({
      question: 1,
      kind: "convert",
      prompt: "너 어디야? 왜 이렇게 안 와? 언제 올 거야?",
      transcript: "니 어디고? 와 이래 안 오노? 언제 올 끼고?",
    });
    expect(body.segments[4]).toMatchObject({ question: 5, kind: "question" });
    expect(body.id).toMatch(/^j_[0-9a-f]{12}$/);
    expect(body.certificateNo).toMatch(/^제\d{4}-\d{6}호$/);
    expect(body.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  });

  it("MOCK_AI=true에서 set-a로 보내면 set-a 가짜 출력(문항 4개)으로 감정한다", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-a" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.transcript).toBe(SET_A_MODEL_OUTPUT_EXAMPLE.transcript);
    expect(body.evidence).toHaveLength(5);
    expect(body.segments).toHaveLength(4);
    expect(body.segments[0]).toEqual({
      question: 1,
      kind: "question",
      prompt: "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
      transcript: "어, 니가 웬일이고? 억수로 오랜만이네",
    });
  });

  it("multipart가 아니면 400 invalid_audio", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const response = await POST(
      new Request("http://localhost/api/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionSetId: "set-a" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_audio" });
  });

  it("모르는 questionSetId는 400 invalid_request", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-z" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("2MB를 넘는 파일은 413 too_large", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const response = await POST(
      postForm({ audio: wavFile(MAX_AUDIO_BYTES + 1), questionSetId: "set-a" }),
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
  });

  it("선언된 본문 길이가 한도를 크게 넘으면 본문을 읽기 전에 413", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const request = new Request("http://localhost/api/judge", {
      method: "POST",
      headers: { "content-length": String(10 * 1024 * 1024) },
      body: "x",
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "too_large" });
  });

  it("MOCK이 아닌데 GEMINI_API_KEY가 없으면 500 server_error", async () => {
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("GEMINI_API_KEY", "");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-a" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
    expect(consoleError).toHaveBeenCalled();
  });

  it("Production에서 Upstash가 없으면 Gemini 호출 없이 요청을 닫는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MOCK_AI", "false");
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-used");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-a" }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
  });

  it("Production에서 Upstash가 없어도 가짜 응답 모드는 동작한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MOCK_AI", "true");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");

    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-a" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ intensity: { score: 68, grade: 2 } });
  });
});

describe("POST /api/judge: 경상 정밀 감정(questionSetId=set-gs)", () => {
  it("MOCK_AI=true면 경상 전용 가짜 출력을 후처리한 200 정밀 감정 결과를 돌려준다", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-gs" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      subregions: { gyeongbuk: 64, gyeongnam: 36 },
      intensity: { score: 69, grade: 2, gradeName: "자막 필요" },
      transcript: GS_MOCK_MODEL_OUTPUT.transcript,
    });
    expect(body.evidence).toHaveLength(GS_MOCK_MODEL_OUTPUT.evidence.length);
    expect(body.evidence[0]).toEqual({ question: 1, quote: "그카는데", note: GS_MOCK_MODEL_OUTPUT.evidence[0].note });
    expect(body.segments.map((segment: { prompt: string }) => segment.prompt)).toEqual(GS_QUESTION_TEXTS);
    expect(body.segments.map((segment: { kind: string }) => segment.kind)).toEqual([
      "convert",
      "convert",
      "convert",
      "convert",
      "question",
      "question",
    ]);
    expect(body.id).toMatch(/^g_[0-9a-f]{12}$/);
    expect(body.certificateNo).toMatch(/^제\d{4}-경상-\d{6}호$/);
    // 일반 감정의 필드는 없다.
    expect(body).not.toHaveProperty("region");
    expect(body).not.toHaveProperty("opinion");
  });

  it("set-gs도 파일 검사는 같다: 파일이 없으면 400 invalid_audio, 2MB를 넘으면 413", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const missing = await POST(postForm({ questionSetId: "set-gs" }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "invalid_audio" });

    const large = await POST(postForm({ audio: wavFile(MAX_AUDIO_BYTES + 1), questionSetId: "set-gs" }));
    expect(large.status).toBe(413);
  });

  it("set-a 응답은 그대로다(경상 정밀 감정 필드가 없다)", async () => {
    vi.stubEnv("MOCK_AI", "true");
    const body = await (await POST(postForm({ audio: wavFile(), questionSetId: "set-a" }))).json();
    expect(body.region.top).toBe("gyeongsang");
    expect(body.id).toMatch(/^j_[0-9a-f]{12}$/);
    expect(body).not.toHaveProperty("subregions");
  });

  it("일반 감정과 하루 호출 한도(IP당 60회)를 합쳐 센다", async () => {
    vi.stubEnv("MOCK_AI", "true");
    useMemoryRateLimiter();
    const headers = { "x-forwarded-for": "198.51.100.23" };

    for (let count = 1; count < DAILY_IP_LIMIT; count += 1) {
      const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-a" }, headers));
      expect(response.status).toBe(200);
    }
    // 60번째는 정밀 감정으로 받는다.
    expect((await POST(postForm({ audio: wavFile(), questionSetId: "set-gs" }, headers))).status).toBe(200);

    for (const questionSetId of ["set-gs", "set-a"]) {
      const blocked = await POST(postForm({ audio: wavFile(), questionSetId }, headers));
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({ error: "rate_limited" });
    }

    // 다른 IP는 영향을 받지 않는다.
    const other = await POST(postForm({ audio: wavFile(), questionSetId: "set-gs" }, { "x-forwarded-for": "198.51.100.24" }));
    expect(other.status).toBe(200);
  });
});
