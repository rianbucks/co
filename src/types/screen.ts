export type ScreenStep = 'S1' | 'S2' | 'S3';

export interface QuestionItem {
  id: number;
  target: string;
  situation: string;
  hint?: string;
}

export const QUESTIONS: QuestionItem[] = [
  {
    id: 1,
    target: "고향 친구",
    situation: "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
    hint: "예: 어~ 와? 무슨 일이고? / 야 잘 지냈나?",
  },
  {
    id: 2,
    target: "친구",
    situation: "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
    hint: "예: 니 지금 제정신이가? / 거진 다 왔다고 하더니 인제 오나!",
  },
  {
    id: 3,
    target: "동생",
    situation: "동생이 한겨울에 반팔만 입고 나가려 합니다. 말려 보십시오.",
    hint: "예: 미칫나, 얼어 죽으려고 환장했나? 퍼뜩 옷 입어라!",
  },
  {
    id: 4,
    target: "할머니",
    situation: "할머니가 차려 주신 밥이 정말 맛있습니다. 할머니께 뭐라고 하시겠습니까?",
    hint: "예: 할매 밥 억수로 맛있네예, 한 그릇 더 주이소!",
  },
];
