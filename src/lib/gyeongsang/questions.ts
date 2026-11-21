/**
 * 경상 정밀 감정의 녹음 문항(문항 세트 set-gs). 녹음 화면(S3)과 서버 지시문이 이 파일 하나를 함께 쓴다.
 *
 * 확정 문구다(11/21). 일반 감정의 기본 세트(set-b)와 같은 구성이다: 바꿔 말하기 4문항 다음에 상황 질문 2문항,
 * 문항당 10초, 합계 60초.
 * 5번의 따옴표 안 문장은 서울 친구가 일부러 틀리게 흉내 낸 사투리다. 화면에 그대로 '친구의 어설픈 흉내' 인용
 * 상자로 보여 주고, 지시문은 화자가 고쳐 말한 문장만 근거로 쓰게 한다. 다른 문항에는 사투리 예시를 넣지 않는다.
 * 사투리 예시를 보여 주면 사용자가 따라 말해 판정과 근거가 오염되기 때문이다.
 *
 * 화면에서도 가져다 쓰므로 서버 전용 모듈(node:*)을 가져오지 않는다.
 */
import { questionText } from "@/lib/judge/questions";
import type { QuestionItem } from "@/types/screen";

/** POST /api/judge의 questionSetId. 이 값이면 경상 정밀 감정으로 처리한다. */
export const GS_QUESTION_SET_ID = "set-gs";

export const GS_QUESTIONS: readonly QuestionItem[] = [
  { id: 1, kind: "convert", target: "고향 친구", situation: "너 왜 그렇게 하는데? 그렇게 하면 안 된다니까." },
  { id: 2, kind: "convert", target: "고향 친구", situation: "걔가 뭐라고 했는데? 진짜 그렇게 말했어?" },
  { id: 3, kind: "convert", target: "고향 친구", situation: "아, 어떡하지? 큰일 났네. 이제 어떻게 해?" },
  { id: 4, kind: "convert", target: "고향 친구", situation: "오늘 진짜 힘들다. 너는 안 힘들어? 좀 쉬었다 하자." },
  {
    id: 5,
    kind: "question",
    target: "서울 친구",
    situation: "서울에서 온 친구가 사투리를 흉내 낸다며 이렇게 말합니다.",
    quote: { label: "친구의 어설픈 흉내", text: "니 지금 뭐 하나? 내랑 같이 밥 먹으러 가노?" },
    followUp: "제대로 된 사투리로 고쳐서 다시 말해 주십시오.",
  },
  {
    id: 6,
    kind: "question",
    target: "깐깐한 집주인",
    situation:
      "한겨울 아침, 보일러가 고장 나서 방이 얼음장 같습니다. 깐깐한 집주인에게 전화해서 당장 고쳐 달라고 말해 보십시오.",
    toElder: true,
  },
];

/** 지시문과 문항별 받아쓰기(segments)에 쓰는 문항 문구 전체(인용과 요청 문구 포함). 문항 순서다. */
export const GS_QUESTION_TEXTS: readonly string[] = GS_QUESTIONS.map(questionText);
