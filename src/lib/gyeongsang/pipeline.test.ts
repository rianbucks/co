import { describe, expect, it, vi } from "vitest";
import type { RateLimiter } from "../rate-limit";
import type { AiClient, AiRequest } from "../judge/ai-client";
import { MAX_AUDIO_BYTES } from "../judge/audio";
import { USER_TEXT } from "../judge/prompt";
import { GS_MOCK_MODEL_OUTPUT, gsMockAiClient } from "./mock";
import { buildGsModelOutputSchema } from "./model-output";
import { judgeGyeongsang, type GsJudgeDeps, type GsJudgeInput } from "./pipeline";
import { buildGsSystemInstruction } from "./prompt";
import { GS_QUESTIONS, GS_QUESTION_TEXTS } from "./questions";

const WAV_HEADER = [..."RIFF"].map((c) => c.charCodeAt(0)).concat(
  [0x24, 0, 0, 0],
  [..."WAVEfmt "].map((c) => c.charCodeAt(0)),
);

function wavFile(size = 64): File {
  const content = new Uint8Array(size);
  content.set(WAV_HEADER);
  return new File([content], "recording.wav", { type: "audio/wav" });
}

const MOCK_TEXT = JSON.stringify(GS_MOCK_MODEL_OUTPUT);
const allowAll: RateLimiter = { check: async () => ({ allowed: true }) };
const fixedIssue = () => ({
  id: "g_000000000001",
  certificateNo: "제2026-경상-000001호",
  issuedAt: "2026-11-20T14:03:00+09:00",
});

function makeDeps(overrides: Partial<GsJudgeDeps> = {}): GsJudgeDeps {
  return { ai: gsMockAiClient, rateLimiter: allowAll, issue: fixedIssue, log: () => {}, ...overrides };
}

function makeInput(overrides: Partial<GsJudgeInput> = {}): GsJudgeInput {
  return { audio: wavFile(), clientIp: "203.0.113.7", ...overrides };
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

describe("judgeGyeongsang: 성공", () => {
  it("가짜 클라이언트로 실제 후처리를 거친 200 정밀 감정 결과를 낸다", async () => {
    const response = await judgeGyeongsang(makeInput(), makeDeps());

    expect(response).toEqual({
      status: 200,
      body: {
        ...fixedIssue(),
        subregions: { gyeongbuk: 64, gyeongnam: 36 },
        intensity: {
          score: 69,
          grade: 4,
          gradeName: "지역 말투가 뚜렷하게 들려요",
          parts: { vocabulary: 55, endings: 80, phonology: 65, intonation: 70 },
        },
        evidence: GS_MOCK_MODEL_OUTPUT.evidence.map((item) => ({ ...item })),
        transcript: GS_MOCK_MODEL_OUTPUT.transcript,
        segments: GS_QUESTIONS.map((question, index) => ({
          question: index + 1,
          kind: question.kind,
          prompt: GS_QUESTION_TEXTS[index],
          transcript: GS_MOCK_MODEL_OUTPUT.question_transcripts[index],
        })),
      },
    });
  });

  it("AI에 오디오, 경상 전용 지시문, 경상 전용 스키마를 넘기고 첫 시도 제한 시간은 25초다", async () => {
    const { ai, requests } = scriptedAi(MOCK_TEXT);
    const audio = wavFile(128);

    await judgeGyeongsang(makeInput({ audio }), makeDeps({ ai }));

    expect(requests).toEqual([
      {
        systemInstruction: buildGsSystemInstruction(GS_QUESTIONS),
        userText: USER_TEXT,
        audio: new Uint8Array(await audio.arrayBuffer()),
        mimeType: "audio/wav",
        responseSchema: buildGsModelOutputSchema(6),
        timeoutMs: 25_000,
        useFallbackModel: false,
      },
    ]);
  });

  it("기본 발급 정보는 g_ id와 경상 문서번호다", async () => {
    const response = await judgeGyeongsang(makeInput(), makeDeps({ issue: undefined }));
    expect(response.status).toBe(200);
    if (response.status !== 200 || !("subregions" in response.body)) throw new Error("unreachable");
    expect(response.body.id).toMatch(/^g_[0-9a-f]{12}$/);
    expect(response.body.certificateNo).toMatch(/^제\d{4}-경상-\d{6}호$/);
  });
});

describe("judgeGyeongsang: 서버 검사", () => {
  it.each([
    ["파일이 없음", null],
    ["파일이 아닌 문자열", "audio"],
  ])("%s이면 AI와 호출 제한을 거치지 않고 400 invalid_audio", async (_, audio) => {
    const check = vi.fn(allowAll.check);
    const { ai, requests } = scriptedAi();
    const response = await judgeGyeongsang(makeInput({ audio }), makeDeps({ ai, rateLimiter: { check } }));
    expect(response).toEqual({ status: 400, body: { error: "invalid_audio" } });
    expect(requests).toHaveLength(0);
    expect(check).not.toHaveBeenCalled();
  });

  it("2MB를 넘으면 413 too_large, 정확히 2MB면 받는다", async () => {
    expect(await judgeGyeongsang(makeInput({ audio: wavFile(MAX_AUDIO_BYTES + 1) }), makeDeps())).toEqual({
      status: 413,
      body: { error: "too_large" },
    });
    expect((await judgeGyeongsang(makeInput({ audio: wavFile(MAX_AUDIO_BYTES) }), makeDeps())).status).toBe(200);
  });

  it("지원하지 않는 형식이면 400 invalid_audio", async () => {
    const text = new File(["hello"], "a.txt", { type: "text/plain" });
    expect(await judgeGyeongsang(makeInput({ audio: text }), makeDeps())).toEqual({
      status: 400,
      body: { error: "invalid_audio" },
    });
  });
});

describe("judgeGyeongsang: 호출 제한", () => {
  it("받은 제한기에 요청자 IP를 넘기고, 한도를 넘으면 AI를 부르지 않고 429 rate_limited", async () => {
    const check = vi.fn<RateLimiter["check"]>(async () => ({ allowed: false, scope: "ip" }));
    const { ai, requests } = scriptedAi();
    const response = await judgeGyeongsang(makeInput(), makeDeps({ ai, rateLimiter: { check } }));
    expect(response).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(check).toHaveBeenCalledWith({ ip: "203.0.113.7" });
    expect(requests).toHaveLength(0);
  });
});

describe("judgeGyeongsang: 반려", () => {
  it.each(["too_short", "no_speech", "noisy"] as const)("품질 불량(%s)이면 422 rejected", async (quality) => {
    const { ai } = scriptedAi(JSON.stringify({ audio_quality: quality }));
    expect(await judgeGyeongsang(makeInput(), makeDeps({ ai }))).toEqual({
      status: 422,
      body: { error: "rejected", reason: quality },
    });
  });

  it("경상 방언으로 보기 어렵다고 표시하면 422 rejected, reason은 not_gyeongsang", async () => {
    const output = {
      audio_quality: "ok",
      transcript: "오랜만이야 잘 지냈어?",
      question_transcripts: null,
      not_gyeongsang: true,
      subregions: null,
      scores: null,
      evidence: null,
    };
    const { ai, requests } = scriptedAi(JSON.stringify(output));
    expect(await judgeGyeongsang(makeInput(), makeDeps({ ai }))).toEqual({
      status: 422,
      body: { error: "rejected", reason: "not_gyeongsang" },
    });
    expect(requests).toHaveLength(1);
  });
});

describe("judgeGyeongsang: AI 실패와 재시도(일반 감정과 같은 규칙)", () => {
  it("호출이 실패하면 재시도 1번을 대체 모델로 보낸다", async () => {
    const { ai, requests } = scriptedAi(new Error("503 UNAVAILABLE"), MOCK_TEXT);
    expect((await judgeGyeongsang(makeInput(), makeDeps({ ai }))).status).toBe(200);
    expect(requests.map((request) => request.useFallbackModel)).toEqual([false, true]);
  });

  it("일반 감정 형식의 출력은 형식 오류로 보고 재시도한다", async () => {
    const generalShape = { ...GS_MOCK_MODEL_OUTPUT, subregions: undefined, regions: { gyeongsang: 100 } };
    const { ai, requests } = scriptedAi(JSON.stringify(generalShape), MOCK_TEXT);
    expect((await judgeGyeongsang(makeInput(), makeDeps({ ai }))).status).toBe(200);
    expect(requests).toHaveLength(2);
  });

  it("두 번 모두 실패하면 502 ai_error", async () => {
    const { ai, requests } = scriptedAi(new Error("timeout"), "{}");
    expect(await judgeGyeongsang(makeInput(), makeDeps({ ai }))).toEqual({ status: 502, body: { error: "ai_error" } });
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
    await judgeGyeongsang(makeInput(), makeDeps({ ai, now: () => clock }));
    expect(timeouts).toEqual([25_000, 15_000]);
  });

  it("로그에는 받아쓰기와 모델 출력을 남기지 않는다", async () => {
    const leaked = { ...GS_MOCK_MODEL_OUTPUT, subregions: { gyeongbuk: 999, gyeongnam: 0 } };
    const { ai } = scriptedAi(JSON.stringify(leaked), JSON.stringify(leaked));
    const logged: unknown[] = [];

    await judgeGyeongsang(makeInput(), makeDeps({ ai, log: (event, detail) => logged.push({ event, detail }) }));

    expect(logged).toEqual([
      { event: "ai_invalid_output", detail: { attempt: 1, model: "primary", problem: "schema_mismatch" } },
      { event: "ai_invalid_output", detail: { attempt: 2, model: "fallback", problem: "schema_mismatch" } },
    ]);
    expect(JSON.stringify(logged)).not.toContain(GS_MOCK_MODEL_OUTPUT.transcript);
  });
});

describe("judgeGyeongsang: 정밀 랭킹 등록 자격 기록", () => {
  it("성공하면 id, 경상 농도, 경북권 비율만 기록한다(신고 원산지와 받아쓰기는 없다)", async () => {
    const recordJudgment = vi.fn<NonNullable<GsJudgeDeps["recordJudgment"]>>(async () => {});
    const response = await judgeGyeongsang(makeInput(), makeDeps({ recordJudgment }));
    expect(response.status).toBe(200);
    expect(recordJudgment).toHaveBeenCalledTimes(1);
    expect(recordJudgment).toHaveBeenCalledWith({
      id: "g_000000000001",
      intensity: 69,
      gyeongbuk: 64,
    });
  });

  it("녹음 내용으로는 등록을 막지 않는다: 모델이 이전 형식으로 flags를 붙여도 기록에 남기지 않는다", async () => {
    const recordJudgment = vi.fn<NonNullable<GsJudgeDeps["recordJudgment"]>>(async () => {});
    const { ai } = scriptedAi(JSON.stringify({ ...GS_MOCK_MODEL_OUTPUT, flags: ["personal_info"] }));
    await judgeGyeongsang(makeInput(), makeDeps({ ai, recordJudgment }));
    expect(recordJudgment).toHaveBeenCalledWith({ id: "g_000000000001", intensity: 69, gyeongbuk: 64 });
  });

  it("품질 불량, 경상 방언 미확인, AI 실패, 호출 제한이면 기록하지 않는다", async () => {
    const recordJudgment = vi.fn<NonNullable<GsJudgeDeps["recordJudgment"]>>(async () => {});
    const notGyeongsang = JSON.stringify({ audio_quality: "ok", not_gyeongsang: true });
    for (const ai of [
      scriptedAi(JSON.stringify({ audio_quality: "noisy" })).ai,
      scriptedAi(notGyeongsang).ai,
      scriptedAi(new Error("1"), new Error("2")).ai,
    ]) {
      await judgeGyeongsang(makeInput(), makeDeps({ ai, recordJudgment }));
    }
    const blocked: RateLimiter = { check: async () => ({ allowed: false, scope: "global" }) };
    await judgeGyeongsang(makeInput(), makeDeps({ rateLimiter: blocked, recordJudgment }));
    expect(recordJudgment).not.toHaveBeenCalled();
  });

  it("기록에 실패해도 정밀 감정 결과는 200으로 돌려주고 로그만 남긴다", async () => {
    const events: string[] = [];
    const response = await judgeGyeongsang(
      makeInput(),
      makeDeps({
        recordJudgment: async () => {
          throw new Error("Upstash down");
        },
        log: (event) => events.push(event),
      }),
    );
    expect(response.status).toBe(200);
    expect(events).toEqual(["judgment_record_failed"]);
  });
});
