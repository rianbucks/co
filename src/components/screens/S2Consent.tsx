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
    <div className="p-5 sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 items-stretch">
        
        {/* Left Column: Guidelines & Principles */}
        <div className="flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-7">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-xl text-indigo-400">
                🎙️
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  사투리 감정 절차 및 개인정보 고지
                </h2>
                <p className="text-xs text-zinc-400">안전하고 정확한 감정을 위해 아래 사항을 안내해 드립니다.</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-start gap-3.5 rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
                <span className="text-lg">⏱️</span>
                <div>
                  <div className="text-xs font-bold text-zinc-200">상황극 4문항 구술 (총 40초)</div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    화면에 제시되는 4가지 상황극에 맞춰, 평소 친한 친구나 가족에게 말하듯 편안한 사투리 어조로 답변합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
                <span className="text-lg">🛡️</span>
                <div>
                  <div className="text-xs font-bold text-zinc-200">Google Gemini 음성 분석 안내</div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    녹음 음성은 판정을 위해 Google Gemini AI 서비스로 전송됩니다. 프로젝트 서버와 데이터베이스에는 음성 파일을 지속 저장하지 않습니다.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <span className="text-lg">ℹ️</span>
                <div>
                  <div className="text-xs font-bold text-amber-200">Gemini 이용 등급에 따른 데이터 처리</div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                    Gemini API 무료 등급에서는 전송한 콘텐츠가 Google 제품 개선에 사용될 수 있습니다. 공개 서비스 운영 전에는 유료 등급과 데이터 처리 조건을 확인해 주십시오.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
                <span className="text-lg">🏆</span>
                <div>
                  <div className="text-xs font-bold text-zinc-200">전국 랭킹 등록은 선택 사항</div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    판정 완료 후 본인의 농도 결과를 랭킹에 공개하고자 할 때만 별도의 추가 저장 동의를 받습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-800/60 pt-4 text-[11px] text-zinc-400">
            * 브라우저 마이크는 판정 녹음 목적으로만 1회성으로 사용됩니다.
          </div>
        </div>

        {/* Right Column: Consent & Action */}
        <div className="flex flex-col justify-between gap-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-xl sm:p-8 lg:col-span-5">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">
              마이크 장비 사용 및 안내 동의
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              아래 항목을 확인하시고 동의 체크박스를 눌러주세요.
            </p>

            <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-black/40 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded-md accent-white"
                />
                <span className="text-xs leading-relaxed text-zinc-200">
                  <span className="font-bold text-white">[필수]</span> 녹음 음성이 판정을 위해 Google Gemini AI 서비스로 전송되며, 프로젝트 서버에 지속 저장되지 않는다는 안내를 확인하고 동의합니다.
                </span>
              </label>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-300">
                <div className="font-semibold">⚠️ 마이크 권한 확인 필요</div>
                <p className="mt-1 text-[11px] leading-relaxed text-red-400">{errorMessage}</p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={handleRequestMicAndProceed}
              disabled={!agreed || micState === 'requesting'}
              className={`flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-bold transition active:scale-[0.98] ${
                agreed && micState !== 'requesting'
                  ? 'bg-white text-black shadow-xl shadow-white/10 hover:bg-zinc-200'
                  : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
              }`}
            >
              <span>{micState === 'requesting' ? '마이크 연결 중...' : '마이크 허용하고 녹음실 입장'}</span>
              <span>→</span>
            </button>

            <button
              onClick={onPrev}
              className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700 active:scale-95"
            >
              이전 화면으로
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
