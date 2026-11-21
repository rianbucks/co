import type { QuestionKind } from '@/lib/judge/contract';

export type ScreenStep = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';

/**
 * 녹음 문항 하나(명세 8장). 일반 감정 문항 세트는 src/lib/judge/questions.ts, 경상 정밀 감정은
 * src/lib/gyeongsang/questions.ts에 있고 녹음 화면(S3)과 서버 지시문이 같은 값을 쓴다.
 * 답변 예시는 넣지 않는다. 특정 지역 사투리 예시를 보여 주면 사용자가 따라 말해 판정과 근거가 오염된다.
 */
export interface QuestionItem {
  id: number;
  /** 대화 상대 */
  target: string;
  /** question이면 상황 문구, convert면 바꿔 말할 표준어 문장 */
  situation: string;
  /** 문항 종류. 없으면 question */
  kind?: QuestionKind;
  /**
   * 상황 문구 다음에 인용 상자로 보여 주는 다른 사람의 말(예: 정밀 감정 5번의 서울 친구가 흉내 낸 문장).
   * 화자의 말이 아니며, label은 상자의 표지다.
   */
  quote?: { label: string; text: string };
  /** 인용 상자 다음에 보여 주는 요청 문구 */
  followUp?: string;
  /** 어른에게 하는 말이면 true. 지시문이 높임 어미를 보게 한다. */
  toElder?: boolean;
}

export const REGION_KOREAN_NAMES: Record<string, string> = {
  seoul_gyeonggi: "서울·경기",
  gangwon: "강원",
  chungcheong: "충청",
  gyeongsang: "경상",
  jeolla: "전라",
  jeju: "제주",
};

export const PART_KOREAN_NAMES: Record<string, string> = {
  vocabulary: "어휘",
  endings: "어미",
  phonology: "음운",
  intonation: "억양",
};
