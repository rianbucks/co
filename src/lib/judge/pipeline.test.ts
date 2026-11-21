import { describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "../rate-limit";
import type { AiClient, AiRequest } from "./ai-client";
import { MAX_AUDIO_BYTES } from "./audio";
import type { JudgeResult } from "./contract";
import { SET_A_MODEL_OUTPUT_EXAMPLE, SPEC_MODEL_OUTPUT_EXAMPLE, mockAiClientFor } from "./mock";
import { buildModelOutputSchema } from "./model-output";
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
  return { ai: mockAiClientFor("set-b"), rateLimiter: allowAll, issue: fixedIssue, log: () => {}, ...overrides };
}

function makeInput(overrides: Partial<JudgeInput> = {}): JudgeInput {
  // 기본 세트 set-b(문항 6개)로 녹음한 요청
  return { audio: wavFile(), questionSetId: "set-b", clientIp: "203.0.113.7", ...overrides };
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
  it("MOCK 클라이언트(4장 출력 예시, set-b)로 실제 후처리를 거친 200 결과를 낸다", async () => {
    const response = await judge(makeInput(), makeDeps());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...fixedIssue(),
      region: {
        top: "gyeongsang",
        label: "경상 방언",
        mixed: false,
        uncertain: false,
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
      imitationSuspected: false,
      evidence: SPEC_MODEL_OUTPUT_EXAMPLE.evidence,
      opinion: "어미 사용이 현저하여 표준어 전환이 곤란한 것으로 사료됨.",
      transcript: SPEC_MODEL_OUTPUT_EXAMPLE.transcript,
      segments: findQuestionSet("set-b")!.map((item, index) => ({
        question: index + 1,
        kind: item.kind,
        prompt: item.situation,
        transcript: SPEC_MODEL_OUTPUT_EXAMPLE.question_transcripts[index],
      })),
    });
  });

  it("set-a로 녹음하면 set-a 문항 4개로 감정한다(NEXT_PUBLIC_QUESTION_SET=set-a로 되돌린 경우)", async () => {
    const { ai, requests } = scriptedAi(JSON.stringify(SET_A_MODEL_OUTPUT_EXAMPLE));

    const response = await judge(makeInput({ questionSetId: "set-a" }), makeDeps({ ai }));

    expect(requests[0]).toMatchObject({
      systemInstruction: buildSystemInstruction(findQuestionSet("set-a")!),
      responseSchema: buildModelOutputSchema(4),
    });
    expect(response.status).toBe(200);
    const body = response.body as JudgeResult;
    expect(body.segments.map((segment) => [segment.question, segment.kind])).toEqual([
      [1, "question"],
      [2, "question"],
      [3, "question"],
      [4, "question"],
    ]);
    expect(body.evidence).toEqual(SET_A_MODEL_OUTPUT_EXAMPLE.evidence);
  });

  it("AI에 오디오, 지시문, 문항, 스키마를 넘기고 첫 시도 제한 시간은 25초다", async () => {
    const { ai, requests } = scriptedAi(SPEC_OUTPUT_TEXT);
    const audio = wavFile(128);

    await judge(makeInput({ audio }), makeDeps({ ai }));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      systemInstruction: buildSystemInstruction(findQuestionSet("set-b")!),
      userText: USER_TEXT,
      audio: new Uint8Array(await audio.arrayBuffer()),
      mimeType: "audio/wav",
      responseSchema: buildModelOutputSchema(6),
      timeoutMs: 25_000,
      useFallbackModel: false,
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
    ["등록되지 않은 ID", "set-c"],
    ["경상 정밀 감정 ID(라우트에서 따로 처리)", "set-gs"],
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
  it("호출이 실패하면 재시도 1번을 대체 모델로 보낸다", async () => {
    const { ai, requests } = scriptedAi(new Error("503 UNAVAILABLE"), SPEC_OUTPUT_TEXT);
    const response = await judge(makeInput(), makeDeps({ ai }));
    expect(response.status).toBe(200);
    expect(requests.map((request) => request.useFallbackModel)).toEqual([false, true]);
  });

  it("형식 오류여도 재시도 1번을 대체 모델로 보낸다", async () => {
    const { ai, requests } = scriptedAi("not json", SPEC_OUTPUT_TEXT);
    const response = await judge(makeInput(), makeDeps({ ai }));
    expect(response.status).toBe(200);
    expect(requests.map((request) => request.useFallbackModel)).toEqual([false, true]);
  });

  it("두 번 모두 실패하면 더 부르지 않고 502 ai_error", async () => {
    const { ai, requests } = scriptedAi(new Error("timeout"), "{}");
    expect(await judge(makeInput(), makeDeps({ ai }))).toEqual({
      status: 502,
      body: { error: "ai_error" },
    });
    expect(requests).toHaveLength(2);
  });

  it("재시도는 전체 40초 중 남은 시간만 쓴다", async () => {
    let clock = 0;
    const timeouts: number[] = [];
    const ai: AiClient = {
      async generate(request) {
        timeouts.push(request.timeoutMs);
        clock += 25_000;
        throw new Error("timeout");
      },
    };

    await judge(makeInput(), makeDeps({ ai, now: () => clock }));

    expect(timeouts).toEqual([25_000, 15_000]);
  });

  it("남은 시간이 1초보다 적으면 재시도하지 않는다", async () => {
    let clock = 0;
    const events: string[] = [];
    const ai: AiClient = {
      async generate() {
        // 첫 시도가 제한(25초)을 넘겨 끝나 전체 40초 중 0.5초만 남은 경우
        clock += 39_500;
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
      {
        event: "ai_invalid_output",
        detail: { attempt: 1, model: "primary", problem: "schema_mismatch" },
      },
      {
        event: "ai_invalid_output",
        detail: { attempt: 2, model: "fallback", problem: "schema_mismatch" },
      },
    ]);
    expect(JSON.stringify(logged)).not.toContain(SPEC_MODEL_OUTPUT_EXAMPLE.transcript);
  });
});

describe("judge: 랭킹 등록 자격 기록", () => {
  it("성공하면 id, 농도, 1순위 권역, 등급, 판정 유보 여부만 기록한다", async () => {
    const recordJudgment = vi.fn<NonNullable<JudgeDeps["recordJudgment"]>>(async () => {});

    const response = await judge(makeInput(), makeDeps({ recordJudgment }));

    expect(response.status).toBe(200);
    expect(recordJudgment).toHaveBeenCalledTimes(1);
    expect(recordJudgment).toHaveBeenCalledWith({
      id: "j_000000000001",
      intensity: 68,
      region: "gyeongsang",
      grade: 4,
      uncertain: false,
    });
  });

  it("모사 의심이면 낮춘 농도와 등급을 기록한다(랭킹에 흉내 점수가 그대로 오르지 않는다)", async () => {
    const recordJudgment = vi.fn<NonNullable<JudgeDeps["recordJudgment"]>>(async () => {});
    const { ai } = scriptedAi(
      JSON.stringify({
        ...SPEC_MODEL_OUTPUT_EXAMPLE,
        scores: { vocabulary: 90, endings: 90, phonology: 30, intonation: 20 },
        imitation_suspected: true,
      }),
    );

    const response = await judge(makeInput(), makeDeps({ ai, recordJudgment }));

    expect(response.body).toMatchObject({ imitationSuspected: true, intensity: { score: 24, grade: 2 } });
    expect(recordJudgment).toHaveBeenCalledWith(expect.objectContaining({ intensity: 24, grade: 2 }));
  });

  it("근거가 1순위 권역을 뒷받침하지 못하면 판정 유보로 기록한다(랭킹 등록을 막는다)", async () => {
    const recordJudgment = vi.fn<NonNullable<JudgeDeps["recordJudgment"]>>(async () => {});
    const { ai } = scriptedAi(
      JSON.stringify({
        ...SPEC_MODEL_OUTPUT_EXAMPLE,
        evidence: SPEC_MODEL_OUTPUT_EXAMPLE.evidence.map((item) => ({ ...item, region: "jeolla" })),
      }),
    );

    const response = await judge(makeInput(), makeDeps({ ai, recordJudgment }));

    expect(response.body).toMatchObject({ region: { top: "gyeongsang", uncertain: true } });
    expect(recordJudgment).toHaveBeenCalledWith(
      expect.objectContaining({ region: "gyeongsang", uncertain: true }),
    );
  });

  it("녹음 내용으로는 등록을 막지 않는다: 모델이 이전 형식으로 flags를 붙여도 기록에 남기지 않는다", async () => {
    const recordJudgment = vi.fn<NonNullable<JudgeDeps["recordJudgment"]>>(async () => {});
    const { ai } = scriptedAi(JSON.stringify({ ...SPEC_MODEL_OUTPUT_EXAMPLE, flags: ["profanity"] }));

    const response = await judge(makeInput(), makeDeps({ ai, recordJudgment }));

    expect(response.status).toBe(200);
    expect(recordJudgment).toHaveBeenCalledWith({
      id: "j_000000000001",
      intensity: 68,
      region: "gyeongsang",
      grade: 4,
      uncertain: false,
    });
  });

  it("품질 불량, AI 실패, 호출 제한이면 기록하지 않는다", async () => {
    const recordJudgment = vi.fn<NonNullable<JudgeDeps["recordJudgment"]>>(async () => {});
    const rejected = JSON.stringify({
      audio_quality: "too_short",
      transcript: null,
      regions: null,
      scores: null,
      evidence: null,
    });

    await judge(makeInput(), makeDeps({ ai: scriptedAi(rejected).ai, recordJudgment }));
    await judge(
      makeInput(),
      makeDeps({ ai: scriptedAi(new Error("1"), new Error("2")).ai, recordJudgment }),
    );
    await judge(
      makeInput(),
      makeDeps({
        rateLimiter: { check: async () => ({ allowed: false, scope: "global" }) },
        recordJudgment,
      }),
    );

    expect(recordJudgment).not.toHaveBeenCalled();
  });

  it("기록에 실패해도 감정 결과는 200으로 돌려주고 로그만 남긴다", async () => {
    const events: Array<{ event: string; detail: Record<string, unknown> }> = [];

    const response = await judge(
      makeInput(),
      makeDeps({
        recordJudgment: async () => {
          throw new Error("Upstash returned HTTP 503");
        },
        log: (event, detail) => events.push({ event, detail }),
      }),
    );

    expect(response.status).toBe(200);
    expect(events).toEqual([
      {
        event: "judgment_record_failed",
        detail: { name: "Error", message: "Upstash returned HTTP 503" },
      },
    ]);
  });
});
