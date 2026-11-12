import { z } from "zod";
import {
  PART_KEYS,
  REGION_KEYS,
  REJECT_REASONS,
  type Evidence,
  type PartScores,
  type RegionProbabilities,
  type RejectReason,
} from "./contract";
import { REGION_NAMES } from "./rules";

/** 모델 출력 형식(명세 4장). */
export const AUDIO_QUALITIES = ["ok", ...REJECT_REASONS] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];

export const FLAGS = ["profanity", "personal_info"] as const;
export type Flag = (typeof FLAGS)[number];

/** 검증을 통과한 모델 출력. 품질이 ok가 아니면 audio_quality와 flags만 쓴다. */
export type AcceptedModelOutput = {
  audio_quality: "ok";
  flags: Flag[];
  transcript: string;
  regions: RegionProbabilities;
  scores: PartScores;
  evidence: Evidence[];
};
export type RejectedModelOutput = { audio_quality: RejectReason; flags: Flag[] };
export type ModelOutput = AcceptedModelOutput | RejectedModelOutput;

const scoreProperty = (description: string) => ({
  type: "integer",
  minimum: 0,
  maximum: 100,
  description,
});

/**
 * Gemini 구조화 출력에 넘기는 JSON 스키마.
 * 공식 문서(Structured outputs)의 지원 목록에 있는 키워드만 쓴다.
 * 문서 권고대로 모든 필드를 required로 두고, 비울 수 있는 필드는 type에 "null"을 넣는다.
 */
export const MODEL_OUTPUT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    audio_quality: {
      type: "string",
      enum: [...AUDIO_QUALITIES],
      description:
        "ok: 판정 가능, too_short: 말소리가 3초 미만, no_speech: 말소리 없음, noisy: 주변 소음으로 판정 불가",
    },
    flags: {
      type: "array",
      items: { type: "string", enum: [...FLAGS] },
      description:
        "욕설이나 혐오 표현이 들리면 profanity, 실명이나 전화번호 같은 개인정보가 들리면 personal_info. 없으면 빈 배열",
    },
    transcript: {
      type: ["string", "null"],
      description: "들린 발음 그대로 적은 받아쓰기. 표준어로 고치지 않는다",
    },
    regions: {
      type: ["object", "null"],
      description: "여섯 권역의 확률. 합은 100",
      properties: Object.fromEntries(
        REGION_KEYS.map((key) => [key, scoreProperty(REGION_NAMES[key])]),
      ),
      required: [...REGION_KEYS],
    },
    scores: {
      type: ["object", "null"],
      description: "표준어와의 차이. 차이가 없으면 0에 가깝게",
      properties: {
        vocabulary: scoreProperty("어휘"),
        endings: scoreProperty("어미"),
        phonology: scoreProperty("음운"),
        intonation: scoreProperty("억양"),
      },
      required: [...PART_KEYS],
    },
    evidence: {
      type: ["array", "null"],
      description: "판정 근거",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: [...PART_KEYS] },
          quote: { type: "string", description: "transcript에 그대로 있는 구절" },
          note: { type: "string", description: "근거 설명" },
        },
        required: ["type", "quote", "note"],
      },
    },
  },
  required: ["audio_quality", "flags", "transcript", "regions", "scores", "evidence"],
};

const score = z.number().int().min(0).max(100);

const rawOutputSchema = z.object({
  audio_quality: z.enum(AUDIO_QUALITIES),
  flags: z.array(z.enum(FLAGS)),
  transcript: z.string().nullish(),
  regions: z
    .object({
      seoul_gyeonggi: score,
      gangwon: score,
      chungcheong: score,
      gyeongsang: score,
      jeolla: score,
      jeju: score,
    })
    .nullish(),
  scores: z
    .object({ vocabulary: score, endings: score, phonology: score, intonation: score })
    .nullish(),
  evidence: z
    .array(z.object({ type: z.enum(PART_KEYS), quote: z.string(), note: z.string() }))
    .nullish(),
});

/** 형식 오류의 종류. 로그에만 쓴다(출력 내용은 남기지 않는다). */
export type OutputProblem =
  | "invalid_json"
  | "schema_mismatch"
  | "missing_fields"
  | "zero_probabilities";

export type ParseResult =
  | { ok: true; value: ModelOutput }
  | { ok: false; problem: OutputProblem };

/**
 * 모델이 돌려준 JSON 텍스트를 검증한다. 실패하면 형식 오류로 보고 재시도 대상이 된다.
 * 품질이 ok면 transcript, regions, scores, evidence가 모두 있어야 하고 확률 합이 0보다 커야 한다.
 */
export function parseModelOutput(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, problem: "invalid_json" };
  }

  const parsed = rawOutputSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, problem: "schema_mismatch" };
  }

  const raw = parsed.data;
  if (raw.audio_quality !== "ok") {
    return { ok: true, value: { audio_quality: raw.audio_quality, flags: raw.flags } };
  }

  const { transcript, regions, scores, evidence } = raw;
  if (transcript == null || regions == null || scores == null || evidence == null) {
    return { ok: false, problem: "missing_fields" };
  }

  const total = REGION_KEYS.reduce((sum, key) => sum + regions[key], 0);
  if (total === 0) {
    return { ok: false, problem: "zero_probabilities" };
  }

  return {
    ok: true,
    value: { audio_quality: "ok", flags: raw.flags, transcript, regions, scores, evidence },
  };
}
