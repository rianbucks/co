/**
 * 경상 정밀 감정의 모델 지시문(명세 12장). 일반 감정의 지시문(../judge/prompt.ts)은 그대로 둔다.
 *
 * 문항 구성은 일반 감정의 set-b와 같다(바꿔 말하기 4문항 다음에 상황 질문 2문항). 문항 앞에 종류를 붙이고,
 * 바꿔 말하기 문항은 주어진 문장과 달라진 부분을 근거로 쓰게 한다. 다른 사람의 흉내를 인용한 문항(5번)은
 * 화자가 고쳐 말한 문장만, 어른에게 하는 문항(6번)은 높임 어미가 방언형인지 본다.
 *
 * 일반 감정 지시문과 달리 경북권과 경남권을 가르는 말꼴 몇 가지를 참고 기준으로 넣는다. 모델이 예시에 맞춰 듣거나
 * 지어내지 않도록 '참고 예시이고, 들린 것만 근거로 쓴다. 예시에 없는 표현도 근거가 될 수 있다'를 함께 적는다.
 */
import { INSTRUCTION_RULE } from "../judge/instruction-rule";
import { SCORING_RULE } from "../judge/scoring-rule";
import { questionKind, questionText } from "../judge/questions";
import type { QuestionItem } from "@/types/screen";

/** 문항 목록 앞에 붙이는 종류 이름(일반 감정 set-b와 같다) */
const KIND_LABELS = { question: "상황 답하기", convert: "바꿔 말하기" } as const;

/** 바꿔 말하기 규칙(일반 감정 set-b와 같은 뜻). 그대로 읽은 문항은 어휘와 어미가 주어진 문장에서 왔다. */
const CONVERT_RULE =
  "문항 목록의 바꿔 말하기 문항은 화자가 주어진 표준어 문장을 자기 말투로 바꿔 말한 것이다. 주어진 문장과 달라진 부분(어미, 어휘, 발음)이 근거다. 주어진 문장을 그대로 읽었으면 그 문항에서는 억양과 음운만 근거로 쓴다. 상황 답하기 문항은 주어진 상황에 맞게 자유롭게 답한 것이다.";

/** 경북권과 경남권을 가르는 참고 기준. 들린 것만 근거로 쓴다는 문장과 함께 넣는다. */
const REFERENCE_GUIDE = [
  "참고 기준",
  "아래는 참고 예시이고, 들린 것만 근거로 쓴다. 예시에 없는 표현도 근거가 될 수 있다.",
  '- "~라고 하다", "그렇게 하다"를 "카"로 줄이는 말꼴(뭐라카노, 와카노, 그캤다)은 대구·경북 쪽, "하"나 "라"로 말하는 꼴(뭐라하노, 와그라노, 그랬다)은 부산·경남 쪽에서 흔하다.',
  '- "~아이가"는 양쪽이 모두 쓰므로 구분 근거로 쓰지 않는다.',
].join("\n");

/** 문항 번호 목록을 '5번', '5번과 6번'처럼 쓴다. */
function questionNumbers(numbers: readonly number[]): string {
  return numbers.map((number) => `${number}번`).join("과 ");
}

/** 문항 목록과 문항 수를 넣어 지시문을 만든다. questions는 화면 문구 그대로다(./questions.ts). */
export function buildGsSystemInstruction(questions: readonly QuestionItem[]): string {
  const labeled = questions.some((question) => questionKind(question) === "convert");
  const questionList = questions
    .map((question, index) => {
      const label = labeled ? `(${KIND_LABELS[questionKind(question)]}) ` : "";
      return `${index + 1}. ${label}${questionText(question)}`;
    })
    .join("\n");
  const count = questions.length;
  const quoted = questions.flatMap((question, index) => (question.quote ? [index + 1] : []));
  const toElder = questions.flatMap((question, index) => (question.toElder ? [index + 1] : []));

  const rules = [
    "실제로 들린 것만 근거로 쓴다. 들리지 않은 표현을 지어내지 않는다. 이 녹음에서 들린 어휘, 어미, 음운, 억양으로만 판단한다.",
    `transcript는 들린 발음 그대로 적는다. 표준어로 고치지 않는다. question_transcripts는 문항 순서대로 각 문항의 답을 같은 방식으로 적은 ${count}개의 배열이다. 답하지 않은 문항은 빈 문자열로 둔다.`,
    INSTRUCTION_RULE,
    ...(labeled ? [CONVERT_RULE] : []),
    ...(quoted.length > 0
      ? [
          `${questionNumbers(quoted)} 문항의 따옴표 안 문장은 다른 사람이 흉내 낸 말이고 화자의 말이 아니다. 화자가 고쳐 말한 문장만 근거로 쓴다. 화자가 흉내 문장을 그대로 따라 읽은 부분은 근거에서 뺀다.`,
        ]
      : []),
    ...(toElder.length > 0
      ? [
          `${questionNumbers(toElder)} 문항은 어른에게 하는 말이다. 높임 어미가 경상 방언형인지 표준어 존댓말인지 본다.`,
        ]
      : []),
    "not_gyeongsang은 경상 방언의 특징이 들리지 않거나 다른 지역 방언으로 들려 경상 방언으로 보기 어려우면 true, 경상 방언의 특징이 들리면 false다. true면 subregions, scores, evidence는 null로 둔다.",
    "subregions는 들린 경상 방언의 특징이 경북권(대구·경북)과 경남권(부산·울산·경남) 중 어느 쪽에 가까운지의 비율이고 합은 100이다. 아래 참고 기준을 함께 본다.",
    `scores는 어휘, 어미, 음운, 억양 각각 0~100이고, 경상 방언의 특징이 얼마나 나타나는지로 매긴다. 다른 지역 방언의 특징은 점수에 넣지 않는다. 표준어와 차이가 없으면 0에 가깝게 준다. ${SCORING_RULE}`,
    `evidence의 question은 그 구절이 나온 문항 번호(1~${count})이고, quote는 그 문항의 question_transcripts에 그대로 있는 구절이어야 한다. note에는 그 구절이 어떤 경상 방언 특징인지와 경북권, 경남권 중 어느 쪽에 가까운지를 적는다.`,
    "말소리가 없거나 3초 미만이거나 주변 소음으로 판정할 수 없으면 audio_quality만 채운다. 이때 transcript, question_transcripts, instruction_attempt, not_gyeongsang, subregions, scores, evidence는 null로 둔다.",
  ];

  return `너는 경상 방언 정밀 감정위원이다. 첨부한 음성은 화자가 아래 문항에 순서대로 답한 녹음이다.
이 감정은 화자의 경상 방언이 경북권(대구·경북)과 경남권(부산·울산·경남) 중 어느 쪽의 특징을 얼마나 띠는지와 경상 방언의 농도를 가린다.
녹음은 문항 순서대로 이어 붙인 것이고 문항 사이에 쉬는 구간이 없을 수 있다. 문항 경계가 불확실하면 내용으로 판단한다.

[문항 목록]
${questionList}

규칙
${rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}

${REFERENCE_GUIDE}`;
}
