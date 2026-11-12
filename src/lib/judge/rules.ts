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
 * 농도 가중치(명세 4장: 어휘 0.2, 어미 0.3, 음운 0.2, 억양 0.3).
 * 부동소수점 오차를 피하려고 정수 백분율로 둔다. 합은 100이어야 한다.
 * 가중치는 검증 결과로 조정한다.
 */
export const INTENSITY_WEIGHTS: Record<PartKey, number> = {
  vocabulary: 20,
  endings: 30,
  phonology: 20,
  intonation: 30,
};

/** 등급표(명세 4장). */
export const GRADE_TABLE: ReadonlyArray<{
  grade: Grade;
  min: number;
  max: number;
  name: string;
}> = [
  { grade: 1, min: 0, max: 19, name: "서울 사람인 척하는 중" },
  { grade: 2, min: 20, max: 39, name: "고향 친구 전화 받으면 돌아옴" },
  { grade: 3, min: 40, max: 59, name: "본인만 표준어라고 생각함" },
  { grade: 4, min: 60, max: 79, name: "자막 필요" },
  { grade: 5, min: 80, max: 100, name: "무형문화재 지정 검토 대상" },
];

/** 서울경기가 1순위이고 농도가 이 값보다 낮으면 소견에 '출신지 은폐 의심'을 붙인다(명세 4장). */
export const CONCEALMENT_SCORE_LIMIT = 20;
