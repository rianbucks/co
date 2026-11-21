/**
 * 일반 감정의 녹음 문항 세트(명세 8장). 녹음 화면(S3), 서버 지시문, 문항별 받아쓰기가 이 파일을 함께 쓴다.
 * 문항은 화면 문구를 그대로 지시문에 넣는다. 경상 정밀 감정(set-gs)은 src/lib/gyeongsang/questions.ts에 따로 있다.
 *
 * 문항 종류
 * - question: 상황을 보고 자유롭게 답한다. situation은 상황 문구다.
 * - convert: 주어진 표준어 문장을 평소 말투로 바꿔 말한다. situation은 바꿔 말할 문장이다.
 *
 * 답변 예시는 넣지 않는다. 특정 지역 사투리 예시를 보여 주면 사용자가 따라 말해 판정과 근거가 오염된다.
 * 화면에서도 가져다 쓰므로 서버 전용 모듈(node:*)을 가져오지 않는다.
 */
import type { QuestionItem } from "@/types/screen";
import type { QuestionKind } from "./contract";

/** 문항당 녹음 시간(초). 녹음 길이는 화면에서 지키고 서버는 검사하지 않는다(명세 9장). */
export const SECONDS_PER_QUESTION = 10;

/** 이전 구성: 상황극 4문항(합계 40초). NEXT_PUBLIC_QUESTION_SET=set-a로 되돌릴 수 있다. */
const SET_A: readonly QuestionItem[] = [
  {
    id: 1,
    kind: "question",
    target: "고향 친구",
    situation: "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
  },
  {
    id: 2,
    kind: "question",
    target: "친구",
    situation: "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
  },
  {
    id: 3,
    kind: "question",
    target: "동생",
    situation: "동생이 한겨울에 반팔만 입고 나가려 합니다. 말려 보십시오.",
  },
  {
    id: 4,
    kind: "question",
    target: "할머니",
    situation: "할머니가 차려 주신 밥이 정말 맛있습니다. 할머니께 뭐라고 하시겠습니까?",
  },
];

/** 기본 구성: 바꿔 말하기 4문항 다음에 상황극 2문항(합계 60초). */
const SET_B: readonly QuestionItem[] = [
  { id: 1, kind: "convert", target: "고향 친구", situation: "너 어디야? 왜 이렇게 안 와? 언제 올 거야?" },
  { id: 2, kind: "convert", target: "고향 친구", situation: "너 왜 그래? 무슨 일 있어? 괜찮아?" },
  { id: 3, kind: "convert", target: "고향 친구", situation: "뭐라고? 잘 안 들려. 다시 말해 봐." },
  { id: 4, kind: "convert", target: "고향 친구", situation: "아니야, 그게 아니고. 내 말 좀 들어 봐." },
  {
    id: 5,
    kind: "question",
    target: "고향 친구",
    situation: "오랜만에 고향 친구에게서 전화가 왔습니다. 받자마자 뭐라고 하시겠습니까?",
  },
  {
    id: 6,
    kind: "question",
    target: "친구",
    situation: "친구가 약속에 한 시간 늦게 와서는 웃고 있습니다. 한마디 해 주십시오.",
  },
];

/** 일반 감정 문항 세트. questionSetId로 고른다. */
export const GENERAL_QUESTION_SETS = { "set-a": SET_A, "set-b": SET_B } as const;
export type GeneralQuestionSetId = keyof typeof GENERAL_QUESTION_SETS;
export const GENERAL_QUESTION_SET_IDS = Object.keys(GENERAL_QUESTION_SETS) as GeneralQuestionSetId[];

/** 일반 감정의 기본 세트 */
export const DEFAULT_QUESTION_SET_ID: GeneralQuestionSetId = "set-b";

export function isGeneralQuestionSetId(value: unknown): value is GeneralQuestionSetId {
  return typeof value === "string" && Object.hasOwn(GENERAL_QUESTION_SETS, value);
}

/** 등록된 일반 감정 세트의 문항(문항 순서). 모르는 ID면 null. set-gs는 여기 없다. */
export function findQuestionSet(questionSetId: string): readonly QuestionItem[] | null {
  return isGeneralQuestionSetId(questionSetId) ? GENERAL_QUESTION_SETS[questionSetId] : null;
}

/** NEXT_PUBLIC_QUESTION_SET 값으로 일반 감정 세트를 고른다. 비었거나 모르는 값이면 기본 세트(set-b). */
export function resolveGeneralQuestionSetId(value: string | undefined): GeneralQuestionSetId {
  const trimmed = value?.trim();
  return isGeneralQuestionSetId(trimmed) ? trimmed : DEFAULT_QUESTION_SET_ID;
}

/**
 * 화면이 녹음하고 서버에 보내는 일반 감정 세트. NEXT_PUBLIC_QUESTION_SET=set-a면 이전 구성으로 되돌린다.
 * 이 값은 빌드할 때 번들에 들어가므로 바꾼 뒤에는 다시 빌드(배포)해야 한다.
 * 빌드 때 값으로 바뀌도록 process.env.NEXT_PUBLIC_QUESTION_SET을 그대로 쓴다.
 */
export const GENERAL_QUESTION_SET_ID: GeneralQuestionSetId = resolveGeneralQuestionSetId(
  process.env.NEXT_PUBLIC_QUESTION_SET,
);
export const GENERAL_QUESTIONS: readonly QuestionItem[] = GENERAL_QUESTION_SETS[GENERAL_QUESTION_SET_ID];

export function questionKind(question: Pick<QuestionItem, "kind">): QuestionKind {
  return question.kind ?? "question";
}

/** 바꿔 말하기 문항이 섞인 세트인지. 섞여 있으면 화면과 지시문이 문항 종류를 함께 보여 준다. */
export function hasConvertQuestions(questions: readonly QuestionItem[]): boolean {
  return questions.some((question) => questionKind(question) === "convert");
}

/** 문항 종류별 개수 */
export function countQuestionKinds(questions: readonly QuestionItem[]): Record<QuestionKind, number> {
  const counts: Record<QuestionKind, number> = { question: 0, convert: 0 };
  for (const question of questions) counts[questionKind(question)] += 1;
  return counts;
}

/** 바꿔 말하기 문항의 대화 상대(첫 번째 바꿔 말하기 문항). 없으면 null */
export function convertTarget(questions: readonly QuestionItem[]): string | null {
  return questions.find((question) => questionKind(question) === "convert")?.target ?? null;
}

/** 녹음 길이(초): 문항 수 × 10초 */
export function recordingSeconds(questions: readonly QuestionItem[]): number {
  return questions.length * SECONDS_PER_QUESTION;
}
