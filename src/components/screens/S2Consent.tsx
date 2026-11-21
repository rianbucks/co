'use client';

import { useState } from 'react';

import {
  GENERAL_QUESTIONS,
  convertTarget,
  countQuestionKinds,
  hasConvertQuestions,
  recordingSeconds,
} from '@/lib/judge/questions';
import type { QuestionItem } from '@/types/screen';

/**
 * 절차 안내 01: 녹음할 문항의 구성과 녹음 길이.
 * 바꿔 말하기 문항이 섞인 세트(일반 감정 set-b, 경상 정밀 감정 set-gs)와 상황극만 있는 세트(set-a)의 문구가 다르다.
 */
function recordingGuide(questions: readonly QuestionItem[]): { title: string; detail: string } {
  const counts = countQuestionKinds(questions);
  const seconds = recordingSeconds(questions);
  if (hasConvertQuestions(questions)) {
    return {
      title: `바꿔 말하기 ${counts.convert}문항, 상황극 ${counts.question}문항 구술 (총 ${seconds}초)`,
      detail: `먼저 화면에 나오는 문장 ${counts.convert}개를 ${convertTarget(questions)}에게 말하듯 평소 말투로 바꿔 말합니다. 글자 그대로 읽지 않으셔도 됩니다. 이어지는 상황극 ${counts.question}개에는 상황에 맞게 자유롭게 답변합니다.`,
    };
  }
  return {
    title: `상황극 ${questions.length}문항 구술 (총 ${seconds}초)`,
    detail: `화면에 제시되는 ${questions.length}가지 상황극에 맞춰, 평소 친한 친구나 가족에게 말하듯 편안한 평소 말투로 답변합니다.`,
  };
}

interface S2ConsentProps {
  onNext: () => void;
  questions?: readonly QuestionItem[];
  onPrev: () => void;
}

export default function S2Consent({ onNext, onPrev, questions = GENERAL_QUESTIONS }: S2ConsentProps) {
  const guide = recordingGuide(questions);
  const [agreed, setAgreed] = useState(false);
  const [micState, setMicState] = useState<'idle' | 'requesting' | 'denied'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleRequestMicAndProceed = async () => {
    if (!agreed) {
      alert('안내 사항을 확인하고 동의를 체크해 주십시오.');
      return;
    }

    setMicState('requesting');
    setErrorMessage('');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('현재 브라우저 환경에서 마이크 녹음을 지원하지 않습니다. (HTTPS 환경 필요)');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      setMicState('idle');
      onNext();
    } catch (err) {
      console.error('마이크 권한 실패:', err);
      setMicState('denied');
      setErrorMessage(
        err instanceof Error && err.name === 'NotAllowedError'
          ? '마이크 접근 권한이 거부되었습니다. 브라우저 주소창 설정에서 마이크를 [허용]으로 변경해 주십시오.'
          : '마이크 장치에 접근할 수 없습니다. 장치 연결 상태를 확인해 주십시오.'
      );
    }
  };

  return (
    <section className="consent-screen">
      <h1 data-enter="1">녹음하기 전에</h1>
      <dl data-enter="2" className="consent-list">
        <div><dt>녹음 시간</dt><dd>{guide.title}. {guide.detail}</dd></div>
        <div><dt>음성 처리</dt><dd>녹음 음성은 판정을 위해 Google Gemini로 전송돼요. 판정 후 이 서비스의 서버에는 음성을 저장하지 않아요.</dd></div>
        <div><dt>랭킹 공개</dt><dd>등록을 선택한 경우에만 닉네임과 감정 결과를 저장하고 공개해요. 경상 정밀 랭킹은 신고 원산지와 경북권 비율도 함께 공개해요.</dd></div>
      </dl>
      <label data-enter="3" className="consent-check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        음성 전송과 처리에 동의해요 (필수)
      </label>
      {errorMessage && <p role="alert" className="consent-error">{errorMessage}</p>}
      <div data-enter="4" className="flow-actions">
        <button onClick={onPrev} className="secondary-action-button">뒤로</button>
        <button onClick={handleRequestMicAndProceed} disabled={!agreed || micState === 'requesting'} className="intro-primary-action">
          {micState === 'requesting' ? '연결 중…' : '마이크 허용하고 계속'}
        </button>
      </div>
    </section>
  );
}
