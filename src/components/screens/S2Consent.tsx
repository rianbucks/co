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
    <div className="flex flex-col gap-6 p-5 sm:p-7">
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-xl text-indigo-400">
            🎙️
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
              마이크 사용 및 안내
            </h2>
            <p className="text-xs text-zinc-400">원활한 감정을 위해 아래 내용을 확인해 주세요.</p>
          </div>
        </div>

        {/* Grouped Info List (iOS Settings Style) */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-start gap-3 rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5">
            <span className="text-base">⏱️</span>
            <div>
              <div className="text-xs font-semibold text-zinc-200">상황극 4문항 구술 (각 10초)</div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                일상 상황에 맞춰 친한 친구나 가족에게 말하듯 편안하게 녹음합니다.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5">
            <span className="text-base">🛡️</span>
            <div>
              <div className="text-xs font-semibold text-zinc-200">음성 즉시 폐기 (서버 미저장)</div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                수집된 음성은 AI 분석 후 즉시 메모리에서 삭제되며 서버에 보관되지 않습니다.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5">
            <span className="text-base">🏆</span>
            <div>
              <div className="text-xs font-semibold text-zinc-200">랭킹 등록은 선택 사항</div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                전국 사투리 랭킹에 본인 음성을 공개할 경우에만 별도로 추가 동의를 받습니다.
              </p>
            </div>
          </div>
        </div>

        {/* iOS Toggle/Checkbox style */}
        <div className="mt-6 border-t border-zinc-800/80 pt-4">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-zinc-800/40 p-3 transition hover:bg-zinc-800/60">
            <span className="text-xs font-medium text-zinc-200">
              안내 사항을 모두 확인하였으며 마이크 사용에 동의합니다
            </span>
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-5 w-5 rounded-md accent-white"
            />
          </label>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300">
            <div className="font-semibold">⚠️ 마이크 권한 확인 필요</div>
            <p className="mt-1 leading-relaxed text-[11px] text-red-400">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onPrev}
          className="w-1/3 rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3.5 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700/60 active:scale-95"
        >
          이전
        </button>
        <button
          onClick={handleRequestMicAndProceed}
          disabled={!agreed || micState === 'requesting'}
          className={`flex-1 rounded-full py-3.5 text-xs font-bold transition active:scale-95 ${
            agreed && micState !== 'requesting'
              ? 'bg-white text-black shadow-lg shadow-white/10 hover:bg-zinc-200'
              : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
          }`}
        >
          {micState === 'requesting' ? '마이크 연결 중...' : '마이크 허용하고 녹음실 입장'}
        </button>
      </div>
    </div>
  );
}
