import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_AUDIO_BYTES } from "@/lib/judge/audio";
import { SPEC_MODEL_OUTPUT_EXAMPLE } from "@/lib/judge/mock";
import { POST } from "./route";

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

function postForm(fields: Record<string, string | Blob>): Request {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  return new Request("http://localhost/api/judge", { method: "POST", body: form });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/judge", () => {
  it("MOCK_AI=true면 Gemini 없이 4장 예시를 후처리한 200 결과를 돌려준다", async () => {
    vi.stubEnv("MOCK_AI", "true");

    const response = await POST(postForm({ audio: wavFile(), questionSetId: "set-a" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body).toMatchObject({
      region: { top: "gyeongsang", label: "경상 방언", mixed: false },
      intensity: { score: 68, grade: 4, gradeName: "자막 필요" },
      transcript: SPEC_MODEL_OUTPUT_EXAMPLE.transcript,
    });
    expect(body.imitationSuspected).toBe(false);
    expect(body.evidence).toHaveLength(5);
    expect(body.evidence[0]).toEqual({
      question: 1,
      type: "vocabulary",
      quote: "억수로",
      note: "'아주'를 뜻하는 경상 방언 어휘",
    });
    expect(body.segments).toHaveLength(4);
    expect(body.segments[0]).toEqual({
      question: 1,
      prompt: "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
      transcript: "어, 니가 웬일이고? 억수로 오랜만이네",
    });
    expect(body.id).toMatch(/^j_[0-9a-f]{12}$/);
    expect(body.certificateNo).toMatch(/^제\d{4}-\d{6}호$/);
    expect(body.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
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
    expect(await response.json()).toMatchObject({ intensity: { score: 68, grade: 4 } });
  });
});
