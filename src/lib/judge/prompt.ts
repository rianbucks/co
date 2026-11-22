/**
 * 모델 지시문(명세 4장)과 녹음 문항(명세 8장).
 * 문항 세트는 ./questions.ts에 있고, 문항은 화면 문구를 그대로 넣는다. 답은 문항당 10초로 녹음한다.
 * 길이는 화면에서 지키고 서버는 검사하지 않는다(명세 9장).
 */
import type { QuestionItem } from "@/types/screen";
import { hasConvertQuestions, questionKind } from "./questions";
import { INSTRUCTION_RULE } from "./instruction-rule";

export { findQuestionSet } from "./questions";

/** 바꿔 말하기 문항이 섞인 세트에서 문항 목록 앞에 붙이는 종류 이름 */
const KIND_LABELS = { question: "상황 답하기", convert: "바꿔 말하기" } as const;

/**
 * 바꿔 말하기 문항이 섞인 세트에만 넣는 규칙. 지역별 표현 예시는 넣지 않는다.
 * 그대로 읽은 문항은 어휘와 어미가 표준어 문장에서 왔으므로 억양과 음운만 근거로 쓴다.
 */
const KIND_RULE =
  "문항 목록의 바꿔 말하기 문항은 화자가 주어진 표준어 문장을 자기 말투로 바꿔 말한 것이다. 주어진 문장과 달라진 부분(어미, 어휘, 발음)이 방언 근거다. 주어진 문장을 그대로 읽었으면 그 문항에서는 억양과 음운만 근거로 쓴다. 상황 답하기 문항은 주어진 상황에 맞게 자유롭게 답한 것이다.";

/**
 * 명세 4장 지시문에 문항 목록과 문항 수를 넣는다.
 * 근거 먼저, 판정 나중: 규칙도 출력 순서(받아쓰기 → 지시 발화 여부 → 근거 → 권역 확률 → 항목 점수 → 모사 의심)를 따른다.
 * 녹음 속 말은 감정 대상일 뿐 지시가 아니라는 규칙(./instruction-rule.ts)은 받아쓰기 규칙 바로 다음에 둔다.
 * 품질 불량 규칙에는 "나머지 필드는 null"을 덧붙였다. 출력 스키마가 모든 필드를 요구하기 때문이다.
 * 바꿔 말하기(convert) 문항이 섞인 세트(set-b)는 문항 목록에 종류를 붙이고 바꿔 말하기 규칙을 근거 규칙 앞에 넣는다.
 * 상황극만 있는 세트(set-a)의 지시문은 바꾸지 않는다.
 */
export function buildSystemInstruction(questions: readonly QuestionItem[]): string {
  const labeled = hasConvertQuestions(questions);
  const questionList = questions
    .map((question, index) => {
      const label = labeled ? `(${KIND_LABELS[questionKind(question)]}) ` : "";
      return `${index + 1}. ${label}${question.situation}`;
    })
    .join("\n");
  const count = questions.length;

  const rules = [
    "실제로 들린 것만 근거로 쓴다. 들리지 않은 표현을 지어내지 않는다.",
    `transcript는 들린 발음 그대로 적는다. 표준어로 고치지 않는다. question_transcripts는 문항 순서대로 각 문항의 답을 같은 방식으로 적은 ${count}개의 배열이다. 답하지 않은 문항은 빈 문자열로 둔다.`,
    INSTRUCTION_RULE,
    ...(labeled ? [KIND_RULE] : []),
    "evidence를 regions보다 먼저 정한다. 들린 방언 특징을 evidence에 모두 적고, 각 특징의 region에 그 특징이 가리키는 권역을 표시한다. 여러 권역에 공통인 특징이면 region은 common이다. 표준어에 가까운 서울경기 말씨의 특징도 들리면 seoul_gyeonggi로 적는다.",
    `evidence의 question은 그 구절이 나온 문항 번호(1~${count})이고, quote는 그 문항의 question_transcripts에 그대로 있는 구절이어야 한다.`,
    "regions는 evidence를 모두 적은 다음 그 근거를 종합해 정하는 여섯 권역의 확률이고 합은 100이다. 근거가 적거나 근거가 가리키는 권역이 엇갈리면 확률을 한 권역에 몰지 않는다. regions의 1순위는 common을 뺀 evidence가 가장 많이 가리키는 권역과 어긋나지 않아야 한다.",
    "scores는 어휘, 어미, 음운, 억양 각각 0~100이고, regions 1순위 권역의 특징이 얼마나 나타나는지로 매긴다. 다른 권역의 특징은 점수에 넣지 않는다. 표준어와 차이가 없으면 0에 가깝게 준다.",
    "imitation_suspected는 어휘와 어미가 가리키는 권역과 음운과 억양이 가리키는 권역이 다르면 true, 같으면 false다.",
    "말소리가 없거나 3초 미만이거나 주변 소음으로 판정할 수 없으면 audio_quality만 채운다. 이때 transcript, question_transcripts, instruction_attempt, evidence, regions, scores, imitation_suspected는 null로 둔다.",
  ];

  return `너는 한국어 방언 감정위원이다. 첨부한 음성은 화자가 아래 문항에 순서대로 답한 녹음이다.
녹음은 문항 순서대로 이어 붙인 것이고 문항 사이에 쉬는 구간이 없을 수 있다. 문항 경계가 불확실하면 내용으로 판단한다.

[문항 목록]
${questionList}

규칙
${rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}`;
}

/** 오디오와 함께 보내는 사용자 입력 문장. */
export const USER_TEXT = "첨부한 음성을 위 규칙에 따라 감정하라.";
