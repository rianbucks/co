'use client';

import { useState, useEffect, useRef } from 'react';
import { JudgeResult } from '@/lib/judge/contract';

interface S4JudgingProps {
  audioBlob: Blob;
  onSuccess: (result: JudgeResult) => void;
  onRetry: () => void;
  onReset: () => void;
}

const JUDGING_STEPS = [
  { id: 1, label: '구술 서류 접수', desc: '녹음 데이터 컨테이너 및 무결성 검증' },
  { id: 2, label: '어휘 및 음운 분석', desc: '지역 고유 어휘, 받침 축약 및 음운 변이 계측' },
  { id: 3, label: '어미 및 억양 대조', desc: '종결어미 패턴 대조 및 고저 억양 곡선 산출' },
  { id: 4, label: '전문 감정위원 심의 합의', desc: '6대 권역 확률 및 농도 등급 최종 확정' },
];

export default function S4Judging({ audioBlob, onSuccess, onRetry, onReset }: S4JudgingProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [secElapsed, setSecElapsed] = useState(0);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string; canRetry: boolean } | null>(null);

  const hasCalledApiRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecElapsed((prev) => {
        const next = prev + 1;
        if (next >= 2 && next < 6) setCurrentStepIndex(1);
        else if (next >= 6 && next < 12) setCurrentStepIndex(2);
        else if (next >= 12) setCurrentStepIndex(3);

        if (next >= 30 && !hasCalledApiRef.current) {
          setErrorInfo({
            title: '심사 소요 시간 초과',
            message: '대기 시간이 30초를 경과했습니다. 네트워크를 확인 후 다시 시도해 주십시오.',
            canRetry: true,
          });
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (hasCalledApiRef.current) return;
    hasCalledApiRef.current = true;

    const callJudgeApi = async () => {
      try {
        const ext = audioBlob.type.includes('webm') ? 'webm' : 'm4a';
        const file = new File([audioBlob], `voice-submission.${ext}`, { type: audioBlob.type });

        const formData = new FormData();
        formData.append('audio', file);
        formData.append('questionSetId', 'set-a');

        const res = await fetch('/api/judge', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          const errorCode = data.error;
          const reason = data.reason;

          if (errorCode === 'rejected') {
            if (reason === 'noisy') {
              setErrorInfo({
                title: '감정 반려 (소음 과다)',
                message: '주변 소음으로 인해 감정이 불가합니다. 조용한 환경에서 다시 녹음해 주십시오.',
                canRetry: false,
              });
            } else {
              setErrorInfo({
                title: '감정 반려 (음성 미확인)',
                message: '말소리가 명확히 확인되지 않았습니다. 마이크에 가까이 대고 다시 녹음해 주십시오.',
                canRetry: false,
              });
            }
          } else if (errorCode === 'rate_limited') {
            setErrorInfo({
              title: '접수 마감',
              message: '금일 감정 접수가 마감되었습니다. 내일 다시 이용해 주십시오.',
              canRetry: false,
            });
          } else {
            setErrorInfo({
              title: '일시적 오류',
              message: '감정위원이 자리를 비웠거나 일시적인 장애가 발생했습니다.',
              canRetry: true,
            });
          }
          return;
        }

        setTimeout(() => {
          onSuccess(data as JudgeResult);
        }, 700);
      } catch (err) {
        console.error('API 에러:', err);
        setErrorInfo({
          title: '통신 오류',
          message: '심사 서버와 통신할 수 없습니다. 잠시 후 다시 시도해 주십시오.',
          canRetry: true,
        });
      }
    };

    callJudgeApi();
  }, [audioBlob, onSuccess]);

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-7">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        {/* Apple Intelligence Style Glowing Aura */}
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
          <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-tr from-indigo-500/30 via-purple-500/30 to-pink-500/30 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-black/60 shadow-inner">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          </div>
        </div>

        <div className="mt-4 text-center">
          <h2 className="text-xl font-bold tracking-tight text-white">
            AI 감정위원회 심사 진행 중
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            음성 억양과 어휘 데이터를 4단계로 다각도 분석하고 있습니다.
          </p>
        </div>

        {/* Step Timeline */}
        <div className="mt-6 space-y-2.5">
          {JUDGING_STEPS.map((step, idx) => {
            const isDone = currentStepIndex > idx;
            const isCurrent = currentStepIndex === idx;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 transition-all ${
                  isCurrent
                    ? 'border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/5'
                    : isDone
                    ? 'border-zinc-800/60 bg-zinc-900/40 text-zinc-400'
                    : 'border-zinc-900 bg-black/30 text-zinc-600'
                }`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isCurrent
                      ? 'bg-indigo-500 text-white'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {isDone ? '✓' : step.id}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${isCurrent ? 'text-white' : isDone ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {step.label}
                    </span>
                    {isCurrent && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-400">
                        <span className="h-1.5 w-1.5 animate-ping rounded-full bg-indigo-400" />
                        분석 중
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Elapsed Timer bar */}
        {!errorInfo && (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-zinc-800/40 px-4 py-2.5 text-xs text-zinc-400">
            <span>소요 시간</span>
            <span className="font-mono font-bold text-white">{secElapsed}초</span>
            <span>/ 최대 30초</span>
          </div>
        )}

        {/* Error State */}
        {errorInfo && (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-300">
            <div className="font-bold">⚠️ {errorInfo.title}</div>
            <p className="mt-1 leading-relaxed text-[11px] text-red-400">{errorInfo.message}</p>
            <div className="mt-3">
              {errorInfo.canRetry ? (
                <button
                  onClick={onRetry}
                  className="w-full rounded-full bg-white py-2.5 text-xs font-bold text-black hover:bg-zinc-200"
                >
                  재시도
                </button>
              ) : (
                <button
                  onClick={onReset}
                  className="w-full rounded-full bg-white py-2.5 text-xs font-bold text-black hover:bg-zinc-200"
                >
                  처음부터 다시 녹음하기
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
