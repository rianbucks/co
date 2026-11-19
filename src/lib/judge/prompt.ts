/**
 * 모델 지시문(명세 4장 초안)과 녹음 문항(명세 8장).
 * 문항은 화면 문구를 그대로 넣는다. 답은 문항당 10초, 합계 40초로 녹음한다.
 * 길이는 화면에서 지키고 서버는 검사하지 않는다(명세 9장).
 */

/** 문항 세트. questionSetId로 고른다. 지금은 set-a(명세 8장 Q1~Q4) 하나만 등록한다. */
const QUESTION_SETS: ReadonlyMap<string, readonly string[]> = new Map([
  [
    "set-a",
    [
      "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
      "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
      "동생이 한겨울에 반팔만 입고 나가려 합니다. 말려 보십시오.",
      "할머니가 차려 주신 밥이 정말 맛있습니다. 할머니께 뭐라고 하시겠습니까?",
    ],
  ],
]);

export function findQuestionSet(questionSetId: string): readonly string[] | null {
  return QUESTION_SETS.get(questionSetId) ?? null;
}

/**
 * 명세 4장 지시문 초안에 문항 목록을 넣는다.
 * 규칙 6에는 "나머지 필드는 null"을 덧붙였다. 출력 스키마가 모든 필드를 요구하기 때문이다.
 */
export function buildSystemInstruction(questions: readonly string[]): string {
  const questionList = questions.map((question, index) => `${index + 1}. ${question}`).join("\n");

  return `너는 한국어 방언 감정위원이다. 첨부한 음성은 화자가 아래 문항에 순서대로 답한 녹음이다.

[문항 목록]
${questionList}

규칙
1. 실제로 들린 것만 근거로 쓴다. 들리지 않은 표현을 지어내지 않는다.
2. transcript는 들린 발음 그대로 적는다. 표준어로 고치지 않는다.
3. regions는 여섯 권역의 확률이고 합은 100이다.
4. scores는 어휘, 어미, 음운, 억양 각각 0~100이다. 표준어와 차이가 없으면 0에 가깝게 준다.
5. evidence의 quote는 transcript에 그대로 있는 구절이어야 한다.
6. 말소리가 없거나 3초 미만이면 audio_quality만 채운다. 이때 transcript, regions, scores, evidence는 null로 둔다.
7. 욕설이나 혐오 표현이 들리면 flags에 profanity를, 실명이나 전화번호 같은 개인정보가 들리면 personal_info를 넣는다. 없으면 빈 배열로 둔다.`;
}

/** 오디오와 함께 보내는 사용자 입력 문장. */
export const USER_TEXT = "첨부한 음성을 위 규칙에 따라 감정하라.";
