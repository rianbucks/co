/**
 * 경상 정밀 감정의 녹음 문항(문항 세트 set-gs). 녹음 화면(S3)과 서버 지시문이 이 파일 하나를 함께 쓴다.
 *
 * 지금 문구는 임시 문구다. 확정 문구를 받으면 이 파일의 target과 situation만 고친다.
 * 문항 수(4개)와 문항당 10초는 일반 감정(set-a)과 같다.
 * 답변 예시는 넣지 않는다. 특정 지역 사투리 예시를 보여 주면 사용자가 따라 말해 판정과 근거가 오염된다.
 *
 * 화면에서도 가져다 쓰므로 서버 전용 모듈(node:*)을 가져오지 않는다.
 */
import type { QuestionItem } from "@/types/screen";

/** POST /api/judge의 questionSetId. 이 값이면 경상 정밀 감정으로 처리한다. */
export const GS_QUESTION_SET_ID = "set-gs";

export const GS_QUESTIONS: readonly QuestionItem[] = [
  {
    id: 1,
    target: "어머니",
    situation: "어머니께서 전화로 언제 집에 오느냐고 물으십니다. 대답해 드리십시오.",
  },
  {
    id: 2,
    target: "친구",
    situation: "친구가 내 과자를 말도 없이 다 먹어 버렸습니다. 따져 물어보십시오.",
  },
  {
    id: 3,
    target: "후배",
    situation: "후배가 무거운 짐을 들고 계단을 오르고 있습니다. 같이 들어 주겠다고 말해 보십시오.",
  },
  {
    id: 4,
    target: "시장 상인",
    situation: "시장에서 사과를 사려고 합니다. 상인께 값을 물어보고 깎아 달라고 해 보십시오.",
  },
];

/** 지시문과 문항별 받아쓰기(segments)에 쓰는 문항 문구. 문항 순서다. */
export const GS_QUESTION_TEXTS: readonly string[] = GS_QUESTIONS.map((question) => question.situation);
