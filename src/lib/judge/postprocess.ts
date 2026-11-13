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
} from "./contract";
import type { AcceptedModelOutput } from "./model-output";
import { CONCEALMENT_NOTE, OPINION_BY_GRADE } from "./opinions";
import {
  CONCEALMENT_SCORE_LIMIT,
  GRADE_TABLE,
  INTENSITY_WEIGHTS,
  MIXED_LABEL,
  MIXED_THRESHOLD,
  REGION_NAMES,
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
 * 근거 검증: quote가 transcript에 그대로 있는 근거만 남긴다(명세 4장). 지어낸 근거를 걸러낸다.
 * 빈 인용은 어디에나 포함되므로 버린다. 남긴 근거의 quote는 정규화한 값으로 바꾼다.
 */
export function verifyEvidence(evidence: readonly Evidence[], transcript: string): Evidence[] {
  const haystack = normalizeQuoteText(transcript);
  const kept: Evidence[] = [];
  for (const item of evidence) {
    const quote = normalizeQuoteText(item.quote);
    if (quote.length > 0 && haystack.includes(quote)) {
      kept.push({ ...item, quote });
    }
  }
  return kept;
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
 * 소견: 등급별 문구를 고른다.
 * 서울경기가 1순위이고 농도가 20 미만이면 끝에 '출신지 은폐 의심.'을 붙인다(명세 4장).
 */
export function selectOpinion(input: { grade: Grade; top: RegionKey; score: number }): string {
  const base = OPINION_BY_GRADE[input.grade];
  const concealed = input.top === "seoul_gyeonggi" && input.score < CONCEALMENT_SCORE_LIMIT;
  return concealed ? `${base} ${CONCEALMENT_NOTE}` : base;
}

/** 감정서 발급 정보. 후처리와 분리해서 받는다(시간과 난수는 순수 함수 밖에서 만든다). */
export interface IssueInfo {
  id: string;
  certificateNo: string;
  issuedAt: string;
}

/** 품질이 ok인 모델 출력으로 감정 결과 JSON을 만든다. */
export function buildJudgeResult(output: AcceptedModelOutput, issue: IssueInfo): JudgeResult {
  const probabilities = normalizeProbabilities(output.regions);
  if (!probabilities) {
    throw new RangeError("권역 확률 합이 0이다. parseModelOutput에서 걸러졌어야 한다");
  }

  const region = decideRegion(probabilities);
  const score = computeIntensity(output.scores);
  const { grade, gradeName } = gradeFor(score);

  return {
    id: issue.id,
    certificateNo: issue.certificateNo,
    issuedAt: issue.issuedAt,
    region: { ...region, probabilities },
    intensity: { score, grade, gradeName, parts: { ...output.scores } },
    evidence: verifyEvidence(output.evidence, output.transcript),
    opinion: selectOpinion({ grade, top: region.top, score }),
    transcript: output.transcript,
  };
}
