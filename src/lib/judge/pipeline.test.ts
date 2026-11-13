import { describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "../rate-limit";
import type { AiClient, AiRequest } from "./ai-client";
import { MAX_AUDIO_BYTES } from "./audio";
import { SPEC_MODEL_OUTPUT_EXAMPLE, mockAiClient } from "./mock";
import { MODEL_OUTPUT_JSON_SCHEMA } from "./model-output";
import { OPINION_BY_GRADE } from "./opinions";
import { judge, type JudgeDeps, type JudgeInput } from "./pipeline";
import { buildSystemInstruction, findQuestionSet, USER_TEXT } from "./prompt";

const WAV_HEADER = [..."RIFF"].map((c) => c.charCodeAt(0)).concat(
  [0x24, 0, 0, 0],
  [..."WAVEfmt "].map((c) => c.charCodeAt(0)),
);

function wavFile(size = 64): File {
  const content = new Uint8Array(size);
  content.set(WAV_HEADER);
  return new File([content], "recording.wav", { type: "audio/wav" });
}

const SPEC_OUTPUT_TEXT = JSON.stringify(SPEC_MODEL_OUTPUT_EXAMPLE);
const allowAll: RateLimiter = { check: async () => ({ allowed: true }) };
const fixedIssue = () => ({
  id: "j_000000000001",
  certificateNo: "제2026-000001호",
  issuedAt: "2026-11-15T14:03:00+09:00",
});

function makeDeps(overrides: Partial<JudgeDeps> = {}): JudgeDeps {
  return { ai: mockAiClient, rateLimiter: allowAll, issue: fixedIssue, log: () => {}, ...overrides };
}

function makeInput(overrides: Partial<JudgeInput> = {}): JudgeInput {
  return { audio: wavFile(), questionSetId: "set-a", clientIp: "203.0.113.7", ...overrides };
}

/** 정해 둔 순서대로 응답하거나 예외를 던지는 가짜 AI. 받은 요청을 기록한다. */
function scriptedAi(...steps: Array<string | Error>) {
  const requests: AiRequest[] = [];
  const ai: AiClient = {
    async generate(request) {
      requests.push(request);
      const step = steps[requests.length - 1];
      if (step === undefined) throw new Error("예상보다 많이 호출됐다");
      if (step instanceof Error) throw step;
      return step;
    },
  };
  return { ai, requests };
}

describe("judge: 성공", () => {
  it("MOCK 클라이언트(4장 출력 예시)로 실제 후처리를 거친 200 결과를 낸다", async () => {
    const response = await judge(makeInput(), makeDeps());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...fixedIssue(),
      region: {
        top: "gyeongsang",
        label: "경상 방언",
        mixed: false,
        probabilities: {
          seoul_gyeonggi: 4,
          gangwon: 3,
          chungcheong: 3,
          gyeongsang: 84,
          jeolla: 4,
          jeju: 2,
        },
      },
      intensity: {
        score: 68,
        grade: 4,
        gradeName: "자막 필요",
        parts: { vocabulary: 40, endings: 85, phonology: 60, intonation: 75 },
      },
      evidence: [
        { type: "endings", quote: "했다 아이가", note: "경상 방언의 확인 표현" },
        { type: "phonology", quote: "뭇나", note: "'먹었나'의 축약" },
      ],
      opinion: OPINION_BY_GRADE[4],
      transcript: "아 그거 내가 했다 아이가, 니 밥 뭇나",
    });
  });

  it("AI에 오디오, 지시문, 문항, 스키마를 넘기고 첫 시도 제한 시간은 20초다", async () => {
    const { ai, requests } = scriptedAi(SPEC_OUTPUT_TEXT);
    const audio = wavFile(128);

    await judge(makeInput({ audio }), makeDeps({ ai }));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      systemInstruction: buildSystemInstruction(findQuestionSet("set-a")!),
      userText: USER_TEXT,
      audio: new Uint8Array(await audio.arrayBuffer()),
      mimeType: "audio/wav",
      responseSchema: MODEL_OUTPUT_JSON_SCHEMA,
      timeoutMs: 20_000,
    });
  });

  it("파일이 정확히 2MB면 받는다", async () => {
    const response = await judge(makeInput({ audio: wavFile(MAX_AUDIO_BYTES) }), makeDeps());
    expect(response.status).toBe(200);
  });
});

describe("judge: 서버 검사", () => {
  it.each([
    ["audio 없음", null],
    ["audio가 파일이 아닌 문자열", "not a file"],
  ])("%s → 400 invalid_audio", async (_name, audio) => {
    const { ai, requests } = scriptedAi();
    const response = await judge(makeInput({ audio }), makeDeps({ ai }));
    expect(response).toEqual({ status: 400, body: { error: "invalid_audio" } });
    expect(requests).toHaveLength(0);
  });

  it("2MB를 1바이트라도 넘으면 413 too_large", async () => {
    const response = await judge(makeInput({ audio: wavFile(MAX_AUDIO_BYTES + 1) }), makeDeps());
    expect(response).toEqual({ status: 413, body: { error: "too_large" } });
  });

  it("지원하지 않는 형식이면 400 invalid_audio", async () => {
    const audio = new File(["hello, this is not audio"], "note.webm", { type: "audio/webm" });
    expect(await judge(makeInput({ audio }), makeDeps())).toEqual({
      status: 400,
      body: { error: "invalid_audio" },
    });
  });

  it.each([
    ["없음", null],
    ["등록되지 않은 ID", "set-b"],
    ["파일", new File(["set-a"], "id.txt")],
  ])("questionSetId가 %s → 400 invalid_request", async (_name, questionSetId) => {
    const { ai, requests } = scriptedAi();
    const response = await judge(makeInput({ questionSetId }), makeDeps({ ai }));
    expect(response).toEqual({ status: 400, body: { error: "invalid_request" } });
    expect(requests).toHaveLength(0);
  });

  it("검사 순서는 크기 → 형식 → questionSetId다", async () => {
    const tooLarge = await judge(
      makeInput({ audio: wavFile(MAX_AUDIO_BYTES + 1), questionSetId: null }),
      makeDeps(),
    );
    expect(tooLarge.status).toBe(413);

    const notAudio = await judge(
      makeInput({ audio: new File(["text"], "a.txt"), questionSetId: null }),
      makeDeps(),
    );
    expect(notAudio.body).toEqual({ error: "invalid_audio" });
  });
});

describe("judge: 호출 제한", () => {
  it("한도를 넘으면 AI를 부르지 않고 429 rate_limited", async () => {
    const { ai, requests } = scriptedAi();
    const check = vi.fn<RateLimiter["check"]>(async () => ({ allowed: false, scope: "ip" }));

    const response = await judge(makeInput(), makeDeps({ ai, rateLimiter: { check } }));

    expect(response).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(check).toHaveBeenCalledWith({ ip: "203.0.113.7" });
    expect(requests).toHaveLength(0);
  });
});

describe("judge: 품질 불량", () => {
  it.each(["too_short", "no_speech", "noisy"] as const)(
    "audio_quality가 %s면 422 rejected와 reason",
    async (quality) => {
      const output = JSON.stringify({
        audio_quality: quality,
        flags: [],
        transcript: null,
        regions: null,
        scores: null,
        evidence: null,
      });
      const { ai } = scriptedAi(output);
      expect(await judge(makeInput(), makeDeps({ ai }))).toEqual({
        status: 422,
        body: { error: "rejected", reason: quality },
      });
    },
  );
});

describe("judge: AI 실패와 재시도", () => {
  it("호출이 실패하면 1번 다시 시도한다", async () => {
    const { ai, requests } = scriptedAi(new Error("503 UNAVAILABLE"), SPEC_OUTPUT_TEXT);
    const response = await judge(makeInput(), makeDeps({ ai }));
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  it("형식 오류여도 1번 다시 시도한다", async () => {
    const { ai, requests } = scriptedAi("not json", SPEC_OUTPUT_TEXT);
    const response = await judge(makeInput(), makeDeps({ ai }));
    expect(response.status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  it("두 번 모두 실패하면 더 부르지 않고 502 ai_error", async () => {
    const { ai, requests } = scriptedAi(new Error("timeout"), "{}");
    expect(await judge(makeInput(), makeDeps({ ai }))).toEqual({
      status: 502,
      body: { error: "ai_error" },
    });
    expect(requests).toHaveLength(2);
  });

  it("재시도는 전체 25초 중 남은 시간만 쓴다", async () => {
    let clock = 0;
    const timeouts: number[] = [];
    const ai: AiClient = {
      async generate(request) {
        timeouts.push(request.timeoutMs);
        clock += 20_000;
        throw new Error("timeout");
      },
    };

    await judge(makeInput(), makeDeps({ ai, now: () => clock }));

    expect(timeouts).toEqual([20_000, 5_000]);
  });

  it("남은 시간이 1초보다 적으면 재시도하지 않는다", async () => {
    let clock = 0;
    const events: string[] = [];
    const ai: AiClient = {
      async generate() {
        clock += 24_500;
        throw new Error("timeout");
      },
    };

    const response = await judge(
      makeInput(),
      makeDeps({ ai, now: () => clock, log: (event) => events.push(event) }),
    );

    expect(response.status).toBe(502);
    expect(events).toEqual(["ai_call_failed", "ai_retry_skipped"]);
  });

  it("로그에는 받아쓰기와 모델 출력을 남기지 않는다", async () => {
    const leaked = { ...SPEC_MODEL_OUTPUT_EXAMPLE, scores: { vocabulary: 999 } };
    const { ai } = scriptedAi(JSON.stringify(leaked), JSON.stringify(leaked));
    const logged: unknown[] = [];

    await judge(makeInput(), makeDeps({ ai, log: (event, detail) => logged.push({ event, detail }) }));

    expect(logged).toEqual([
      { event: "ai_invalid_output", detail: { attempt: 1, problem: "schema_mismatch" } },
      { event: "ai_invalid_output", detail: { attempt: 2, problem: "schema_mismatch" } },
    ]);
    expect(JSON.stringify(logged)).not.toContain(SPEC_MODEL_OUTPUT_EXAMPLE.transcript);
  });
});
