'use client';

import { useState, useEffect, useRef } from 'react';
import { JudgeResult } from '@/lib/judge/contract';

interface S4JudgingProps {
  audioBlob: Blob;
  onSuccess: (result: JudgeResult) => void;
  onRetry: () => void;
  onReset: () => void;
  /** 오류로 멈췄는지 알린다(머리글에 '분석 중단'을 보여 주는 데 쓴다). */
  onFailedChange?: (failed: boolean) => void;
}

const JUDGING_STEPS = [
  { id: 1, label: '녹음 상태 확인' },
  { id: 2, label: '어휘와 발음 살펴보기' },
  { id: 3, label: '어미와 억양 살펴보기' },
  { id: 4, label: '결과 정리' },
];

/** 같은 녹음을 다시 보내도 결과가 같은 오류. 재시도 대신 다시 녹음으로 안내한다. */
const RERECORD_ERRORS = new Map<string, { title: string; message: string }>([
  [
    'invalid_audio',
    {
      title: '감정 반려 (녹음 파일 확인 불가)',
      message: '녹음 파일을 확인할 수 없습니다. 처음부터 다시 녹음해 주십시오.',
    },
  ],
  [
    'too_large',
    {
      title: '감정 반려 (파일 용량 초과)',
      message: '녹음 파일이 접수 한도(2MB)를 넘었습니다. 처음부터 다시 녹음해 주십시오.',
    },
  ],
  [
    'invalid_request',
    {
      title: '감정 반려 (신청 정보 오류)',
      message: '감정 신청 정보를 확인할 수 없습니다. 처음부터 다시 녹음해 주십시오.',
    },
  ],
]);

export default function S4Judging({ audioBlob, onSuccess, onRetry, onReset, onFailedChange }: S4JudgingProps) {
  const [secElapsed, setSecElapsed] = useState(0);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string; canRetry: boolean } | null>(null);
  const failed = errorInfo !== null;

  const requestCompletedRef = useRef(false);
  const timedOutRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const errorPanelRef = useRef<HTMLDivElement | null>(null);
  const currentStepIndex = secElapsed >= 12 ? 3 : secElapsed >= 6 ? 2 : secElapsed >= 2 ? 1 : 0;

  // 경과 시간 타이머. 오류가 나면 정리되어 경과 시간과 단계 진행이 그 자리에서 멈춘다.
  useEffect(() => {
    if (failed) return;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 1;
      setSecElapsed(elapsed);
      if (elapsed >= 30 && !requestCompletedRef.current && !timedOutRef.current) {
        timedOutRef.current = true;
        abortControllerRef.current?.abort();
        setErrorInfo({
          title: '심사 소요 시간 초과',
          message: '대기 시간이 30초를 경과했습니다. 네트워크를 확인 후 다시 시도해 주십시오.',
          canRetry: true,
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [failed]);

  // 오류 안내는 화면 맨 위에 있다. 녹음 화면에서 내려와 있던 스크롤 위치와 상관없이 보이게 한다.
  useEffect(() => {
    if (failed) errorPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [failed]);

  useEffect(() => {
    onFailedChange?.(failed);
  }, [failed, onFailedChange]);

  useEffect(() => {
    let resultTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    abortControllerRef.current = controller;

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
          signal: controller.signal,
        });

        const data = await res.json();
        if (controller.signal.aborted) return;

        if (!res.ok) {
          const errorCode = data.error;
          const reason = data.reason;
          const rerecordError = RERECORD_ERRORS.get(errorCode);

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
          } else if (rerecordError) {
            setErrorInfo({ ...rerecordError, canRetry: false });
          } else {
            setErrorInfo({
              title: '일시적 오류',
              message: '감정위원이 자리를 비웠거나 일시적인 장애가 발생했습니다.',
              canRetry: true,
            });
          }
          return;
        }

        resultTimer = setTimeout(() => {
          onSuccess(data as JudgeResult);
        }, 700);
      } catch (err) {
        if (timedOutRef.current || (err instanceof DOMException && err.name === 'AbortError')) return;
        console.error('API 에러:', err);
        setErrorInfo({
          title: '통신 오류',
          message: '심사 서버와 통신할 수 없습니다. 잠시 후 다시 시도해 주십시오.',
          canRetry: true,
        });
      } finally {
        requestCompletedRef.current = true;
      }
    };

    const startTimer = setTimeout(callJudgeApi, 0);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(resultTimer);
      controller.abort();
    };
  }, [audioBlob, onSuccess]);

  return (
    <div className="screen-glass p-5 sm:p-7 lg:p-10">
      {/* Error Notice: 오류가 나면 화면 맨 위에 안내와 버튼을 둔다 */}
      {errorInfo && (
        <div
          ref={errorPanelRef}
          role="alert"
          className="mb-6 scroll-mt-24 rounded-3xl border border-red-500/40 bg-red-500/10 p-5 shadow-2xl shadow-red-500/5 backdrop-blur-xl sm:p-6 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:p-7"
        >
          <div>
            <div className="text-base font-bold text-red-200 sm:text-lg">{errorInfo.title}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-red-300/90">{errorInfo.message}</p>
          </div>
          <button
            onClick={errorInfo.canRetry ? onRetry : onReset}
            className="mt-4 w-full shrink-0 rounded-full bg-white py-3.5 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98] lg:mt-0 lg:w-auto lg:px-10"
          >
            {errorInfo.canRetry ? '재시도' : '처음부터 다시 녹음하기'}
          </button>
        </div>
      )}

      {!errorInfo && (
        <section data-enter="1" className="judging-panel">
          <div className="judging-title"><span aria-hidden="true" className="judging-spinner" /><h2>말투를 분석하고 있어요</h2></div>
          <p>경과 시간 {secElapsed}초 · 최대 30초</p>
          <ol>
            {JUDGING_STEPS.map((step, index) => (
              <li key={step.id} aria-current={index === currentStepIndex ? 'step' : undefined}>
                <span aria-hidden="true">{index < currentStepIndex ? '✓' : step.id}</span>
                {step.label}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
