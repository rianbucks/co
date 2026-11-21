/**
 * 판정 후처리(명세 4장). 모두 순수 함수다.
 * 모델에게는 관찰만 맡기고 최종 숫자는 여기서 계산한다.
 */
import {
  PART_KEYS,
  REGION_KEYS,
  type Evidence,
  type Grade,
  type JudgeResult,
  type PartKey,
  type PartScores,
  type RegionKey,
  type RegionProbabilities,
  type JudgeSegment,
  type Segment,
} from "./contract";
import type { QuestionItem } from "@/types/screen";
import type { AcceptedModelOutput } from "./model-output";
import { questionKind } from "./questions";
import { CONCEALMENT_NOTE, IMITATION_NOTE, OPINIONS } from "./opinions";
import {
  CONCEALMENT_SCORE_LIMIT,
  GRADE_TABLE,
  INTENSITY_WEIGHTS,
  MIXED_LABEL,
  MIXED_THRESHOLD,
  REGION_NAMES,
  UNCERTAIN_MIN_TOP_EVIDENCE,
} from "./rules";

/**
 * 권역 확률 합을 100으로 맞춘다. 비율대로 나눈 뒤 최대 잔여법으로 정수 합 100을 만든다.
 * 나머지가 같으면 REGION_KEYS 순서가 앞선 권역에 1을 더 준다.
 * 입력은 0 이상의 정수여야 하며, 합이 0이면 맞출 수 없으므로 null을 돌려준다.
 */
export function normalizeProbabilities(raw: RegionProbabilities): RegionProbabilities | null {
  for (const key of REGION_KEYS) {
    if (!Number.isInteger(raw[key]) || raw[key] < 0) {
      throw new RangeError(`권역 확률은 0 이상의 정수여야 한다: ${key}=${raw[key]}`);
    }
  }

  const total = REGION_KEYS.reduce((sum, key) => sum + raw[key], 0);
  if (total === 0) return null;
  if (total === 100) return { ...raw };

  const shares = REGION_KEYS.map((key, order) => {
    const scaled = raw[key] * 100;
    return { key, order, value: Math.floor(scaled / total), remainder: scaled % total };
  });

  let left = 100 - shares.reduce((sum, share) => sum + share.value, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.order - b.order,
  );
  for (const share of byRemainder) {
    if (left === 0) break;
    share.value += 1;
    left -= 1;
  }

  return Object.fromEntries(shares.map((share) => [share.key, share.value])) as RegionProbabilities;
}

/** 근거 비교용 정규화: 유니코드 NFC, 연속 공백을 한 칸으로, 앞뒤 공백 제거. */
export function normalizeQuoteText(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/**
 * 근거 검증(명세 4장): 지어낸 근거를 걸러낸다.
 * - 문항별 받아쓰기가 있으면 quote가 그 근거의 문항(question) 받아쓰기에 그대로 있어야 남긴다.
 *   문항 번호가 없거나 범위를 벗어나면 확인할 수 없으므로 버린다.
 * - 문항별 받아쓰기가 없으면(null) quote가 전체 받아쓰기에 있으면 남기고,
 *   문항은 확인하지 않았으므로 question을 null로 둔다.
 * 빈 인용은 어디에나 포함되므로 버린다. 남긴 근거의 quote는 정규화한 값으로 바꾼다.
 */
export function verifyEvidence(
  evidence: readonly Evidence[],
  transcript: string,
  questionTranscripts: readonly string[] | null = null,
): Evidence[] {
  const fullText = normalizeQuoteText(transcript);
  const questionTexts = questionTranscripts?.map(normalizeQuoteText) ?? null;
  const kept: Evidence[] = [];
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
 * 문항별 받아쓰기(명세 7장). 문항 문구는 문항 세트에서 가져오고 받아쓰기는 공백을 정리한다.
 * 문항별 받아쓰기가 없거나 문항 수와 다르면 빈 배열이다.
 */
export function buildSegments(
  questions: readonly string[],
  questionTranscripts: readonly string[] | null,
): Segment[] {
  if (!questionTranscripts || questionTranscripts.length !== questions.length) return [];
  return questions.map((prompt, index) => ({
    question: index + 1,
    prompt,
    transcript: normalizeQuoteText(questionTranscripts[index]),
  }));
}

/**
 * 농도 점수: 항목 점수의 가중 합을 반올림한 정수(명세 4장).
 * 가중치는 정수 백분율이라 정수 연산만으로 계산한다. 0.5는 올린다.
 */
export function computeIntensity(
  parts: PartScores,
  weights: Record<PartKey, number> = INTENSITY_WEIGHTS,
): number {
  const weightTotal = PART_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (weightTotal !== 100) {
    throw new RangeError(`농도 가중치의 합은 100이어야 한다: ${weightTotal}`);
  }
  for (const key of PART_KEYS) {
    if (!Number.isInteger(parts[key]) || parts[key] < 0 || parts[key] > 100) {
      throw new RangeError(`항목 점수는 0~100 정수여야 한다: ${key}=${parts[key]}`);
    }
  }

  const weighted = PART_KEYS.reduce((sum, key) => sum + parts[key] * weights[key], 0);
  return Math.floor((weighted + 50) / 100);
}

/** 등급 매핑(명세 4장 등급표). */
export function gradeFor(score: number): { grade: Grade; gradeName: string } {
  const row = Number.isInteger(score)
    ? GRADE_TABLE.find((entry) => score >= entry.min && score <= entry.max)
    : undefined;
  if (!row) {
    throw new RangeError(`농도는 0~100 정수여야 한다: ${score}`);
  }
  return { grade: row.grade, gradeName: row.name };
}

/**
 * 판정 지역: 확률 1순위 권역(명세 4장).
 * 1순위와 2순위 차이가 10 미만이면 label을 '혼합 방언'으로 하고 top은 1순위를 그대로 둔다.
 * 확률이 같으면 REGION_KEYS 순서가 앞선 권역이 위다.
 */
export function decideRegion(probabilities: RegionProbabilities): {
  top: RegionKey;
  label: string;
  mixed: boolean;
} {
  const ranked = [...REGION_KEYS].sort((a, b) => probabilities[b] - probabilities[a]);
  const [top, second] = ranked;
  const mixed = probabilities[top] - probabilities[second] < MIXED_THRESHOLD;
  return { top, label: mixed ? MIXED_LABEL : `${REGION_NAMES[top]} 방언`, mixed };
}

/**
 * 판정 유보 확인(명세 4장): 근거로 1순위 권역을 뒷받침하지 못하면 true.
 * 검증을 통과한 근거 중 1순위 권역을 가리키는 것이 2개 미만이거나,
 * 다른 권역을 가리키는 것이 1순위 권역을 가리키는 것보다 많으면 유보한다.
 * 여러 권역에 공통인 근거(common)와 권역을 알 수 없는 근거(null)는 어느 쪽에도 세지 않는다.
 */
export function isRegionUncertain(top: RegionKey, evidence: readonly Evidence[]): boolean {
  let topCount = 0;
  let otherCount = 0;
  for (const item of evidence) {
    if (item.region === top) topCount += 1;
    else if (item.region !== null && item.region !== "common") otherCount += 1;
  }
  return topCount < UNCERTAIN_MIN_TOP_EVIDENCE || otherCount > topCount;
}

/** 네 항목 중 점수가 가장 높은 항목. 같으면 어휘, 어미, 음운, 억양 순으로 앞선 항목. */
export function dominantPart(parts: PartScores): PartKey {
  let best: PartKey = PART_KEYS[0];
  for (const key of PART_KEYS) {
    if (parts[key] > parts[best]) best = key;
  }
  return best;
}

/**
 * 소견: 등급과 가장 높은 항목으로 문구를 고른다. 같은 녹음이면 같은 문구가 나온다.
 * 서울경기가 1순위이고 농도가 20 미만이면 끝에 '출신지 은폐 의심.'을 붙인다(명세 4장).
 */
export function selectOpinion(input: {
  grade: Grade;
  top: RegionKey;
  score: number;
  parts: PartScores;
  /** 모사 의심이면 소견 맨 끝에 '타 지역 방언 모사 의심.'을 붙인다. */
  imitationSuspected?: boolean;
}): string {
  const notes = [OPINIONS[input.grade][dominantPart(input.parts)]];
  if (input.top === "seoul_gyeonggi" && input.score < CONCEALMENT_SCORE_LIMIT) notes.push(CONCEALMENT_NOTE);
  if (input.imitationSuspected) notes.push(IMITATION_NOTE);
  return notes.join(" ");
}

/** 모사 의심일 때의 농도: 계산값의 절반. 0.5는 올린다(명세 4장). 예: 57 → 29 */
export function halveIntensity(score: number): number {
  return Math.floor((score + 1) / 2);
}

/** 감정서 발급 정보. 후처리와 분리해서 받는다(시간과 난수는 순수 함수 밖에서 만든다). */
export interface IssueInfo {
  id: string;
  certificateNo: string;
  issuedAt: string;
}

/**
 * 품질이 ok인 모델 출력으로 감정 결과 JSON을 만든다. questions는 녹음한 문항 세트(문항 순서)다.
 * 문항별 받아쓰기가 문항 수만큼 있으면 근거를 문항별로 검증하고 segments를 채운다.
 * 없으면 기존처럼 전체 받아쓰기로 검증하고 segments는 빈 배열이다.
 * 검증을 통과한 근거가 1순위 권역을 뒷받침하지 못하면 region.uncertain을 true로 둔다.
 */
export function buildJudgeResult(
  output: AcceptedModelOutput,
  issue: IssueInfo,
  questions: readonly QuestionItem[],
): JudgeResult {
  const probabilities = normalizeProbabilities(output.regions);
  if (!probabilities) {
    throw new RangeError("권역 확률 합이 0이다. parseModelOutput에서 걸러졌어야 한다");
  }

  const region = decideRegion(probabilities);
  // 모사 의심이면 계산한 농도를 절반으로 낮추고, 등급과 소견도 낮춘 점수로 정한다.
  const imitationSuspected = output.imitation_suspected;
  const computed = computeIntensity(output.scores);
  const score = imitationSuspected ? halveIntensity(computed) : computed;
  const { grade, gradeName } = gradeFor(score);
  const questionTranscripts =
    output.question_transcripts?.length === questions.length ? output.question_transcripts : null;
  // 판정 유보는 받아쓰기로 검증을 통과한 근거로만 센다.
  const evidence = verifyEvidence(output.evidence, output.transcript, questionTranscripts);

  return {
    id: issue.id,
    certificateNo: issue.certificateNo,
    issuedAt: issue.issuedAt,
    region: { ...region, uncertain: isRegionUncertain(region.top, evidence), probabilities },
    intensity: { score, grade, gradeName, parts: { ...output.scores } },
    imitationSuspected,
    evidence,
    opinion: selectOpinion({ grade, top: region.top, score, parts: output.scores, imitationSuspected }),
    transcript: output.transcript,
    segments: buildJudgeSegments(questions, questionTranscripts),
  };
}

/** 일반 감정의 문항별 받아쓰기: 문항 번호, 문항 종류, 문항 문구, 받아쓰기. 없으면 빈 배열이다. */
export function buildJudgeSegments(
  questions: readonly QuestionItem[],
  questionTranscripts: readonly string[] | null,
): JudgeSegment[] {
  const segments = buildSegments(
    questions.map((question) => question.situation),
    questionTranscripts,
  );
  return segments.map((segment, index) => ({
    question: segment.question,
    kind: questionKind(questions[index]),
    prompt: segment.prompt,
    transcript: segment.transcript,
  }));
}
