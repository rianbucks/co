export type ScreenStep = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

/**
 * 녹음 문항(명세 8장). 서버의 set-a(src/lib/judge/prompt.ts)와 문구가 같아야 한다.
 * 답변 예시는 넣지 않는다. 특정 지역 사투리 예시를 보여 주면 사용자가 따라 말해 판정과 근거가 오염된다.
 */
export interface QuestionItem {
  id: number;
  target: string;
  situation: string;
}

export const QUESTIONS: QuestionItem[] = [
  {
    id: 1,
    target: "고향 친구",
    situation: "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
  },
  {
    id: 2,
    target: "친구",
    situation: "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
  },
  {
    id: 3,
    target: "동생",
    situation: "동생이 한겨울에 반팔만 입고 나가려 합니다. 말려 보십시오.",
  },
  {
    id: 4,
    target: "할머니",
    situation: "할머니가 차려 주신 밥이 정말 맛있습니다. 할머니께 뭐라고 하시겠습니까?",
  },
];

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
