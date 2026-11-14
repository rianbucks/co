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
      alert('음성 처리 방침 및 절차 안내에 동의해 주셔야 진행이 가능합니다.');
      return;
    }

    setMicState('requesting');
    setErrorMessage('');

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('현재 브라우저에서는 음성 녹음 기능을 지원하지 않습니다. (HTTPS 환경 필요)');
      }

      // 마이크 권한 확인
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 확인 후 스트림 임시 정지 (S3에서 실제 녹음 시 다시 획득)
      stream.getTracks().forEach((track) => track.stop());

      setMicState('idle');
      onNext();
    } catch (err) {
      console.error('마이크 권한 획득 실패:', err);
      setMicState('denied');
      setErrorMessage(
        err instanceof Error && err.name === 'NotAllowedError'
          ? '마이크 사용 권한이 거부되었습니다. 주소창 좌측의 권한/자물쇠 아이콘을 눌러 마이크 권한을 [허용]으로 변경 후 다시 시도해 주십시오.'
          : '마이크 장치에 접근할 수 없습니다. 장치 연결 상태 및 브라우저 설정을 확인해 주십시오.'
      );
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-stone-900">
      <div className="border border-stone-400 bg-white p-4 shadow-xs">
        <div className="border-b border-stone-300 pb-2">
          <div className="text-[11px] font-semibold text-stone-600">감정 절차 제2단계</div>
          <h2 className="text-lg font-bold tracking-tight text-stone-900">
            신청인 사전 고지 및 동의서
          </h2>
        </div>

        {/* 1. 절차 고지 */}
        <div className="mt-3 space-y-3 text-xs leading-relaxed text-stone-700">
          <div className="rounded bg-stone-50 p-3 border border-stone-200">
            <h3 className="font-bold text-stone-900">[제1조] 감정 진행 절차</h3>
            <p className="mt-1">
              신청인은 제시되는 4개 문항에 대해 상황극 형식으로 각 10초간 음성을 구술 녹음합니다.
              문항 간 일시정지가 가능하며, 총 40초의 단일 음성 데이터가 서버로 전송됩니다.
            </p>
          </div>

          {/* 2. 개인정보 및 음성 처리 방침 */}
          <div className="rounded bg-stone-50 p-3 border border-stone-200">
            <h3 className="font-bold text-stone-900">[제2조] 음성 데이터 처리 및 파기 원칙</h3>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>
                <span className="font-semibold text-stone-900">일회성 판정 후 즉시 파기:</span> 수집된 녹음 음성은 AI(Google Gemini)를 통한 방언 판정 처리에만 즉각 활용되며, 판정 완료 즉시 메모리에서 폐기됩니다.
              </li>
              <li>
                <span className="font-semibold text-stone-900">서버 및 DB 미저장:</span> 기본 감정 단계에서는 신청인의 음성 원본을 영구 저장하지 않습니다.
              </li>
              <li>
                <span className="font-semibold text-stone-900">랭킹 등록 시 선택적 저장:</span> 향후 전국 방언 랭킹에 본인 결과를 공개 등록하고자 할 때만 별도의 추가 동의 절차를 거칩니다.
              </li>
            </ul>
          </div>

          {/* 3. 장치 권한 안내 */}
          <div className="rounded bg-stone-50 p-3 border border-stone-200">
            <h3 className="font-bold text-stone-900">[제3조] 마이크 장비 사용 승인</h3>
            <p className="mt-1">
              음성 구술 녹음을 위하여 본 단말기의 마이크(Audio Capture) 권한 승인이 요구됩니다.
            </p>
          </div>
        </div>

        {/* 동의 체크박스 */}
        <div className="mt-4 border-t border-stone-300 pt-3">
          <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold text-stone-900">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-stone-400 text-stone-900 focus:ring-stone-800"
            />
            <span>
              [필수] 본인은 상기 음성 데이터 처리 방침 및 마이크 권한 사용 절차를 모두 확인하였으며 이에 동의합니다.
            </span>
          </label>
        </div>

        {/* 에러 메시지 (권한 거부 시) */}
        {errorMessage && (
          <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <p className="font-bold">⚠️ 마이크 접근 제한 안내</p>
            <p className="mt-1 leading-relaxed">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* 버튼 영역 */}
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          className="w-1/3 rounded border border-stone-400 bg-white py-3 text-xs font-bold text-stone-700 shadow-xs hover:bg-stone-50"
        >
          이전 단계
        </button>
        <button
          onClick={handleRequestMicAndProceed}
          disabled={!agreed || micState === 'requesting'}
          className={`flex-1 rounded py-3 text-xs font-bold text-white shadow-xs transition ${
            agreed && micState !== 'requesting'
              ? 'bg-stone-900 hover:bg-stone-800 active:scale-[0.99]'
              : 'cursor-not-allowed bg-stone-400'
          }`}
        >
          {micState === 'requesting' ? '권한 확인 중...' : '마이크 승인 및 녹음실 입장'}
        </button>
      </div>
    </div>
  );
}
