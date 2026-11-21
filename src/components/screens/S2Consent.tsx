'use client';

import { useState } from 'react';

interface S2ConsentProps {
  onNext: () => void;
  onPrev: () => void;
}

export default function S2Consent({ onNext, onPrev }: S2ConsentProps) {
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
        <div><dt>녹음 시간</dt><dd>문항당 최대 10초예요. 답을 마치면 다음으로 넘어갈 수 있어요.</dd></div>
        <div><dt>음성 처리</dt><dd>녹음 음성은 판정을 위해 Google Gemini로 전송돼요. 판정 후 이 서비스의 서버에는 음성을 저장하지 않아요.</dd></div>
        <div><dt>랭킹 공개</dt><dd>등록을 선택한 경우에만 닉네임과 감정 결과를 저장하고 공개해요.</dd></div>
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
