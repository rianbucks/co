'use client';

import {
  GENERAL_QUESTIONS,
  SECONDS_PER_QUESTION,
  countQuestionKinds,
  hasConvertQuestions,
} from '@/lib/judge/questions';

interface S1IntroProps {
  onNext: () => void;
  /** 감정 없이 농도 랭킹(S7)을 본다. */
  onViewRanking: () => void;
  /** 있으면 '경상 정밀 감정 받기' 버튼을 보여 준다. */
  onStartGyeongsang?: () => void;
}

const REGIONS = ['서울·경기', '강원', '충청', '경상', '전라', '제주'];

/** 문항 수를 '네 가지', '여섯 문항'처럼 고유어로 쓴다. */
const NATIVE_NUMBERS = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
const nativeNumber = (count: number) => NATIVE_NUMBERS[count] ?? String(count);

const QUESTION_COUNT = GENERAL_QUESTIONS.length;
const KIND_COUNTS = countQuestionKinds(GENERAL_QUESTIONS);
/** 바꿔 말하기 문항이 섞인 세트(set-b)인지. 상황극만 있는 세트(set-a)는 이전 문구를 그대로 쓴다. */
const MIXED = hasConvertQuestions(GENERAL_QUESTIONS);

const INTRO_DESCRIPTION = MIXED
  ? `${nativeNumber(QUESTION_COUNT)} 문항을 평소 말투로 녹음해 주세요. 주어진 문장을 내 말투로 바꿔 말하고 일상 상황에 답하면, 녹음된 말소리에서 방언의 특징을 살펴 권역과 농도 결과를 안내합니다.`
  : `${nativeNumber(QUESTION_COUNT)} 가지 일상 질문에 평소 말투로 답해 주세요. 녹음된 말소리에서 방언의 특징을 살펴 권역과 농도 결과를 안내합니다.`;

const STEPS = [
  MIXED
    ? {
        title: `${nativeNumber(QUESTION_COUNT)} 문항 녹음하기`,
        detail: `문장 ${KIND_COUNTS.convert}개를 평소 말투로 바꿔 말하고 상황 ${KIND_COUNTS.question}개에 답합니다. 문항마다 최대 ${SECONDS_PER_QUESTION}초입니다.`,
      }
    : {
        title: `${nativeNumber(QUESTION_COUNT)} 가지 질문에 답하기`,
        detail: `문항마다 최대 ${SECONDS_PER_QUESTION}초, 평소 말투로 답합니다.`,
      },
  { title: '말소리 특징 살펴보기', detail: '어휘, 어미, 음운, 억양을 함께 확인합니다.' },
  { title: '결과 확인하기', detail: '권역별 결과와 농도 점수를 확인하고 저장합니다.' },
];

export default function S1Intro({ onNext, onViewRanking, onStartGyeongsang }: S1IntroProps) {
  return (
    <div className="intro-page mx-auto w-full max-w-6xl px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
      <header className="intro-masthead">
        <div className="intro-wordmark">
          <span className="intro-seal" aria-hidden="true">C/O</span>
          <div>
            <p className="intro-brand">원산지증명서</p>
            <p className="intro-brand-subtitle">사투리 음성 감정</p>
          </div>
        </div>
        <p className="intro-edition">구술 감정 안내 <span>제 1 호</span></p>
      </header>

      <div className="intro-layout">
        <section className="intro-copy">
          <p className="intro-eyebrow">방언 감정 안내</p>
          <h1>
            말소리에서
            <br />
            <span>방언 특징을 살펴봅니다</span>
          </h1>
          <p className="intro-description">{INTRO_DESCRIPTION}</p>

          <div className="intro-regions">
            <h2>감정 가능 지역</h2>
            <ul>
              {REGIONS.map((region) => <li key={region}>{region}</li>)}
            </ul>
          </div>
        </section>

        <aside className="intro-record" aria-label="감정 절차와 신청">
          <div className="intro-record-heading">
            <div>
              <p>감정 절차</p>
              <h2>신청부터 결과까지</h2>
            </div>
            <span aria-hidden="true">C/O</span>
          </div>

          <ol className="intro-steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="intro-step-number">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="intro-actions">
            <p className="intro-time">예상 시간 약 1분 <span>설치·가입 불필요</span></p>
            <button onClick={onNext} className="intro-primary-action">감정 신청</button>
            <button onClick={onViewRanking} className="intro-secondary-action">농도 랭킹 보기</button>
            {onStartGyeongsang && (
              <button onClick={onStartGyeongsang} className="intro-secondary-action">
                경상 정밀 감정 받기
              </button>
            )}
            <p className="intro-privacy">녹음 음성은 판정 처리 후 서버에 보관하지 않습니다.</p>
          </div>
        </aside>
      </div>

      <footer className="intro-footer">
        <span>원산지증명서</span>
        <span>방언 음성 감정 안내</span>
        <span>대한민국 6개 권역</span>
      </footer>
    </div>
  );
}
