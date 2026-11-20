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
  /**
   * 문항 순서대로의 받아쓰기. 모델이 문항 수만큼의 문자열 배열로 주지 않았으면 null이다.
   * 이때 형식 오류로 실패시키지 않고 전체 받아쓰기와 근거 목록으로 보여 준다.
   */
  question_transcripts: string[] | null;
  regions: RegionProbabilities;
  scores: PartScores;
  /** question은 1~문항 수의 정수가 아니면 null이다. */
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
 * Gemini 구조화 출력에 넘기는 JSON 스키마. 문항별 받아쓰기의 길이와 근거의 문항 번호 범위는 문항 수로 정한다.
 * 공식 문서(Structured outputs)의 지원 목록에 있는 키워드만 쓴다(minItems, maxItems 포함).
 * 문서 권고대로 모든 필드를 required로 두고, 비울 수 있는 필드는 type에 "null"을 넣는다.
 */
export function buildModelOutputSchema(questionCount: number): Record<string, unknown> {
  return {
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
      question_transcripts: {
        type: ["array", "null"],
        description: `문항 순서대로 각 문항의 답을 들린 발음 그대로 적은 받아쓰기 ${questionCount}개. 답하지 않은 문항은 빈 문자열`,
        items: { type: "string" },
        minItems: questionCount,
        maxItems: questionCount,
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
            question: {
              type: "integer",
              minimum: 1,
              maximum: questionCount,
              description: "근거 구절이 나온 문항 번호",
            },
            type: { type: "string", enum: [...PART_KEYS] },
            quote: { type: "string", description: "그 문항의 question_transcripts에 그대로 있는 구절" },
            note: { type: "string", description: "근거 설명" },
          },
          required: ["question", "type", "quote", "note"],
        },
      },
    },
    required: [
      "audio_quality",
      "flags",
      "transcript",
      "question_transcripts",
      "regions",
      "scores",
      "evidence",
    ],
  };
}

const score = z.number().int().min(0).max(100);

const rawOutputSchema = z.object({
  audio_quality: z.enum(AUDIO_QUALITIES),
  flags: z.array(z.enum(FLAGS)),
  transcript: z.string().nullish(),
  // 문항별 받아쓰기와 근거의 문항 번호는 형식이 달라도 실패시키지 않는다(아래에서 따로 읽는다).
  question_transcripts: z.unknown().optional(),
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
    .array(
      z.object({
        question: z.unknown().optional(),
        type: z.enum(PART_KEYS),
        quote: z.string(),
        note: z.string(),
      }),
    )
    .nullish(),
});

/** 문항 수만큼의 문자열 배열이면 그대로, 아니면 null(전체 받아쓰기로 대신한다). */
function readQuestionTranscripts(value: unknown, questionCount: number): string[] | null {
  if (!Array.isArray(value) || value.length !== questionCount) return null;
  if (!value.every((item): item is string => typeof item === "string")) return null;
  return value;
}

/** 1~문항 수의 정수면 그대로, 아니면 null. */
function readQuestionNumber(value: unknown, questionCount: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= questionCount
    ? value
    : null;
}

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
 * 문항별 받아쓰기(question_transcripts)는 문항 수만큼의 문자열 배열이 아니면 null로 두고 실패시키지 않는다.
 */
export function parseModelOutput(text: string, questionCount: number): ParseResult {
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
    value: {
      audio_quality: "ok",
      flags: raw.flags,
      transcript,
      question_transcripts: readQuestionTranscripts(raw.question_transcripts, questionCount),
      regions,
      scores,
      evidence: evidence.map((item) => ({
        question: readQuestionNumber(item.question, questionCount),
        type: item.type,
        quote: item.quote,
        note: item.note,
      })),
    },
  };
}
