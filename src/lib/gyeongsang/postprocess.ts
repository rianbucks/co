/**
 * 경상 정밀 감정의 후처리(명세 12장). 모두 순수 함수다.
 * 농도 계산, 등급표, 문항별 받아쓰기, 인용 정규화는 일반 감정의 함수를 그대로 쓴다.
 */
import {
  buildJudgeSegments,
  computeIntensity,
  gradeFor,
  normalizeQuoteText,
  type IssueInfo,
} from "../judge/postprocess";
import type { QuestionItem } from "@/types/screen";
import { SUBREGION_KEYS, type GsEvidence, type GyeongsangResult, type SubregionRatios } from "./contract";
import type { GsAcceptedOutput } from "./model-output";

/**
 * 성분 비율의 합을 100으로 맞춘다(권역 확률과 같은 방식). 비율대로 나눈 뒤 최대 잔여법으로 정수 합 100을 만들고,
 * 나머지가 같으면 경북권에 1을 더 준다. 입력은 0 이상의 정수여야 하며, 합이 0이면 null이다.
 */
export function normalizeSubregions(raw: SubregionRatios): SubregionRatios | null {
  for (const key of SUBREGION_KEYS) {
    if (!Number.isInteger(raw[key]) || raw[key] < 0) {
      throw new RangeError(`성분 비율은 0 이상의 정수여야 한다: ${key}=${raw[key]}`);
    }
  }

  const total = raw.gyeongbuk + raw.gyeongnam;
  if (total === 0) return null;
  if (total === 100) return { ...raw };

  const shares = SUBREGION_KEYS.map((key, order) => {
    const scaled = raw[key] * 100;
    return { key, order, value: Math.floor(scaled / total), remainder: scaled % total };
  });
  let left = 100 - shares.reduce((sum, share) => sum + share.value, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (const share of byRemainder) {
    if (left === 0) break;
    share.value += 1;
    left -= 1;
  }
  return { gyeongbuk: shares[0].value, gyeongnam: shares[1].value };
}

/**
 * 근거 검증: 받아쓰기에 없는 인용은 버린다(일반 감정과 같은 규칙).
 * - 문항별 받아쓰기가 있으면 quote가 그 근거의 문항 받아쓰기에 그대로 있어야 남긴다.
 *   문항 번호가 없거나 범위를 벗어나면 확인할 수 없으므로 버린다.
 * - 문항별 받아쓰기가 없으면(null) 전체 받아쓰기에 있으면 남기고 question을 null로 둔다.
 * 빈 인용은 버린다. 남긴 근거의 quote는 정규화한 값으로 바꾼다.
 */
export function verifyGsEvidence(
  evidence: readonly GsEvidence[],
  transcript: string,
  questionTranscripts: readonly string[] | null,
): GsEvidence[] {
  const fullText = normalizeQuoteText(transcript);
  const questionTexts = questionTranscripts?.map(normalizeQuoteText) ?? null;
  const kept: GsEvidence[] = [];
  for (const item of evidence) {
    const quote = normalizeQuoteText(item.quote);
    if (quote.length === 0) continue;

    if (questionTexts) {
      const question = item.question;
      const inRange =
        question !== null && Number.isInteger(question) && question >= 1 && question <= questionTexts.length;
      if (inRange && questionTexts[question - 1].includes(quote)) kept.push({ ...item, quote });
    } else if (fullText.includes(quote)) {
      kept.push({ ...item, question: null, quote });
    }
  }
  return kept;
}

/**
 * 경상 방언으로 확인된 모델 출력으로 정밀 감정 결과를 만든다. questions는 녹음한 문항(문항 순서)이고 문항 수는 정해져 있지 않다.
 * 농도는 경상 방언 특징 기준의 항목 점수에 일반 감정과 같은 가중치를 매긴 값이고, 등급표도 같다.
 */
export function buildGyeongsangResult(
  output: GsAcceptedOutput,
  issue: IssueInfo,
  questions: readonly QuestionItem[],
): GyeongsangResult {
  const subregions = normalizeSubregions(output.subregions);
  if (!subregions) {
    throw new RangeError("성분 비율 합이 0이다. parseGsModelOutput에서 걸러졌어야 한다");
  }

  const score = computeIntensity(output.scores);
  const { grade, gradeName } = gradeFor(score);
  const questionTranscripts =
    output.question_transcripts?.length === questions.length ? output.question_transcripts : null;

  return {
    id: issue.id,
    certificateNo: issue.certificateNo,
    issuedAt: issue.issuedAt,
    subregions,
    intensity: { score, grade, gradeName, parts: { ...output.scores } },
    evidence: verifyGsEvidence(output.evidence, output.transcript, questionTranscripts),
    transcript: output.transcript,
    segments: buildJudgeSegments(questions, questionTranscripts),
  };
}
