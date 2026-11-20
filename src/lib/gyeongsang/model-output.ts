/**
 * 경상 정밀 감정의 모델 출력 형식(명세 12장). 일반 감정의 형식(../judge/model-output.ts)은 그대로 두고,
 * 품질, flags, 문항별 받아쓰기를 읽는 방식만 같이 쓴다.
 */
import { z } from "zod";
import { PART_KEYS, type PartScores, type RejectReason } from "../judge/contract";
import {
  AUDIO_QUALITIES,
  FLAGS,
  readQuestionNumber,
  readQuestionTranscripts,
  type Flag,
  type OutputProblem,
} from "../judge/model-output";
import {
  SUBREGION_AREAS,
  SUBREGION_KEYS,
  SUBREGION_NAMES,
  type GsEvidence,
  type SubregionRatios,
} from "./contract";

/** 검증을 통과한 정밀 감정 출력. */
export type GsAcceptedOutput = {
  audio_quality: "ok";
  flags: Flag[];
  not_gyeongsang: false;
  transcript: string;
  /** 문항 수만큼의 문자열 배열이 아니면 null(전체 받아쓰기로 근거를 검증한다) */
  question_transcripts: string[] | null;
  subregions: SubregionRatios;
  scores: PartScores;
  /** question은 1~문항 수의 정수가 아니면 null이다. */
  evidence: GsEvidence[];
};
/** 모델이 경상 방언으로 보기 어렵다고 표시한 출력. 나머지 필드는 쓰지 않는다. */
export type GsNotGyeongsangOutput = { audio_quality: "ok"; flags: Flag[]; not_gyeongsang: true };
export type GsRejectedOutput = { audio_quality: RejectReason; flags: Flag[] };
export type GsModelOutput = GsAcceptedOutput | GsNotGyeongsangOutput | GsRejectedOutput;

const scoreProperty = (description: string) => ({
  type: "integer",
  minimum: 0,
  maximum: 100,
  description,
});

/**
 * Gemini 구조화 출력에 넘기는 JSON 스키마. 일반 감정과 같은 규칙으로 쓴다:
 * 공식 문서의 지원 목록에 있는 키워드만 쓰고, 모든 필드를 required로 두며, 비울 수 있는 필드는 type에 "null"을 넣는다.
 * 받아쓰기를 먼저 쓰고 나서 경상 방언 여부와 성분을 정하도록 속성 순서를 둔다.
 */
export function buildGsModelOutputSchema(questionCount: number): Record<string, unknown> {
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
      not_gyeongsang: {
        type: ["boolean", "null"],
        description: "녹음에서 경상 방언의 특징을 확인하기 어려우면 true, 확인되면 false",
      },
      subregions: {
        type: ["object", "null"],
        description: "들린 경상 방언의 특징이 경북권과 경남권 중 어느 쪽에 가까운지의 비율. 합은 100",
        properties: Object.fromEntries(
          SUBREGION_KEYS.map((key) => [
            key,
            scoreProperty(`${SUBREGION_NAMES[key]}(${SUBREGION_AREAS[key]})`),
          ]),
        ),
        required: [...SUBREGION_KEYS],
      },
      scores: {
        type: ["object", "null"],
        description: "경상 방언의 특징이 나타나는 정도. 표준어와 차이가 없으면 0에 가깝게",
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
            quote: { type: "string", description: "그 문항의 question_transcripts에 그대로 있는 구절" },
            note: {
              type: "string",
              description: "어떤 경상 방언 특징인지, 경북권과 경남권 중 어느 쪽에 가까운지",
            },
          },
          required: ["question", "quote", "note"],
        },
      },
    },
    required: [
      "audio_quality",
      "flags",
      "transcript",
      "question_transcripts",
      "not_gyeongsang",
      "subregions",
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
  // 문항별 받아쓰기, 근거의 문항 번호, 경상 방언 여부는 형식이 달라도 실패시키지 않는다(아래에서 따로 읽는다).
  question_transcripts: z.unknown().optional(),
  not_gyeongsang: z.unknown().optional(),
  subregions: z.object({ gyeongbuk: score, gyeongnam: score }).nullish(),
  scores: z
    .object({ vocabulary: score, endings: score, phonology: score, intonation: score })
    .nullish(),
  evidence: z
    .array(z.object({ question: z.unknown().optional(), quote: z.string(), note: z.string() }))
    .nullish(),
});

export type GsParseResult =
  | { ok: true; value: GsModelOutput }
  | { ok: false; problem: OutputProblem };

/**
 * 모델이 돌려준 JSON 텍스트를 검증한다. 실패하면 형식 오류로 보고 재시도 대상이 된다.
 * - 품질이 ok가 아니면 audio_quality와 flags만 쓴다.
 * - not_gyeongsang이 true면 나머지 필드는 보지 않는다. true가 아닌 값(false, null, 없음, 다른 형식)은 false로 읽는다.
 * - 그 밖에는 transcript, subregions, scores, evidence가 모두 있어야 하고 성분 비율 합이 0보다 커야 한다.
 */
export function parseGsModelOutput(text: string, questionCount: number): GsParseResult {
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
  if (raw.not_gyeongsang === true) {
    return { ok: true, value: { audio_quality: "ok", flags: raw.flags, not_gyeongsang: true } };
  }

  const { transcript, subregions, scores, evidence } = raw;
  if (transcript == null || subregions == null || scores == null || evidence == null) {
    return { ok: false, problem: "missing_fields" };
  }
  if (subregions.gyeongbuk + subregions.gyeongnam === 0) {
    return { ok: false, problem: "zero_probabilities" };
  }

  return {
    ok: true,
    value: {
      audio_quality: "ok",
      flags: raw.flags,
      not_gyeongsang: false,
      transcript,
      question_transcripts: readQuestionTranscripts(raw.question_transcripts, questionCount),
      subregions,
      scores,
      evidence: evidence.map((item) => ({
        question: readQuestionNumber(item.question, questionCount),
        quote: item.quote,
        note: item.note,
      })),
    },
  };
}
