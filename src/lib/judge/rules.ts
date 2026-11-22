import type { Grade, PartKey, RegionKey } from "./contract";

/** 권역 이름(명세 1장). 판정 지역 label은 "{이름} 방언"이다. */
export const REGION_NAMES: Record<RegionKey, string> = {
  seoul_gyeonggi: "서울경기",
  gangwon: "강원",
  chungcheong: "충청",
  gyeongsang: "경상",
  jeolla: "전라",
  jeju: "제주",
};

export const MIXED_LABEL = "혼합 방언";

/** 1순위와 2순위 확률 차이가 이 값보다 작으면 혼합 방언(명세 4장). */
export const MIXED_THRESHOLD = 10;

/**
 * 농도 가중치(명세 4장: 어휘 0.15, 어미 0.2, 음운 0.25, 억양 0.4).
 * 흉내 내기 쉬운 어휘와 어미보다 음운과 억양에 무게를 둔다.
 * 부동소수점 오차를 피하려고 정수 백분율로 둔다. 합은 100이어야 한다.
 * 가중치는 검증 결과로 조정한다.
 */
export const INTENSITY_WEIGHTS: Record<PartKey, number> = {
  vocabulary: 15,
  endings: 20,
  phonology: 25,
  intonation: 40,
};

/** 등급표(명세 4장). */
export const GRADE_TABLE: ReadonlyArray<{
  grade: Grade;
  min: number;
  max: number;
  name: string;
}> = [
  { grade: 1, min: 80, max: 100, name: "무형문화재 지정 검토 대상" },
  { grade: 2, min: 60, max: 79, name: "자막 필요" },
  { grade: 3, min: 40, max: 59, name: "본인만 표준어라고 생각함" },
  { grade: 4, min: 20, max: 39, name: "고향 친구 전화 받으면 돌아옴" },
  { grade: 5, min: 0, max: 19, name: "서울 사람인 척하는 중" },
];

/** 1순위 권역을 가리키는 근거가 이 개수보다 적으면 판정 유보(명세 4장). */
export const UNCERTAIN_MIN_TOP_EVIDENCE = 2;

/** 판정 유보 문구의 앞부분과 괄호 부분. 화면은 좁으면 괄호 부분을 한 덩어리로 다음 줄에 둔다. */
export const UNCERTAIN_PREFIX = "판정 유보";
export function uncertainDetail(top: RegionKey): string {
  return `(추정: ${REGION_NAMES[top]} 방언)`;
}

/** 판정 유보일 때 판정 지역 대신 보여 주는 문구. 예: 판정 유보 (추정: 경상 방언) */
export function uncertainLabel(top: RegionKey): string {
  return `${UNCERTAIN_PREFIX} ${uncertainDetail(top)}`;
}

/**
 * 결과 화면, 감정서, 랭킹의 내 결과에 보여 주는 판정 지역.
 * 판정 유보면 '판정 유보 (추정: ○○ 방언)', 아니면 혼합 방언이나 '{권역} 방언'이다.
 * uncertain이 없는 이전 응답은 유보가 아닌 것으로 본다. 화면에서도 쓰므로 서버 전용 코드를 넣지 않는다.
 */
export function regionVerdictLabel(region: {
  top: RegionKey;
  label: string;
  mixed: boolean;
  uncertain?: boolean;
}): string {
  if (region.uncertain) return uncertainLabel(region.top);
  return region.mixed ? MIXED_LABEL : region.label;
}

/** 서울경기가 1순위이고 농도가 이 값보다 낮으면 소견에 '출신지 은폐 의심'을 붙인다(명세 4장). */
export const CONCEALMENT_SCORE_LIMIT = 20;
