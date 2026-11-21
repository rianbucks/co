'use client';

import { useState, useEffect, useRef } from 'react';
import { JudgeResult } from '@/lib/judge/contract';
import { GENERAL_QUESTION_SET_ID } from '@/lib/judge/questions';

/** 심사 단계 표시. 경과 시간(2초, 6초, 12초)에 따라 4단계를 차례로 보여 준다. */
export interface JudgingStep {
  id: number;
  label: string;
  desc: string;
}

/** T는 성공 응답의 형식이다. 기본은 일반 감정 결과(JudgeResult). */
interface S4JudgingProps<T> {
  audioBlob: Blob;
  onSuccess: (result: T) => void;
  onRetry: () => void;
  onReset: () => void;
  /** 오류로 멈췄는지 알린다(머리글에 '분석 중단'을 보여 주는 데 쓴다). */
  onFailedChange?: (failed: boolean) => void;
  /**
   * 요청의 questionSetId. 없으면 일반 감정 세트(기본 set-b, NEXT_PUBLIC_QUESTION_SET=set-a면 set-a).
   * 경상 정밀 감정은 set-gs를 넘긴다.
   */
  questionSetId?: string;
  /** 심사 단계 문구(4개). 없으면 일반 감정의 단계 */
  steps?: readonly JudgingStep[];
}

const JUDGING_STEPS: readonly JudgingStep[] = [
  { id: 1, label: '녹음 상태 확인', desc: '음성이 잘 들어왔는지 확인합니다.' },
  { id: 2, label: '어휘와 발음 살펴보기', desc: '지역에서 자주 쓰는 말과 발음 특징을 확인합니다.' },
  { id: 3, label: '어미와 억양 살펴보기', desc: '문장 끝 표현과 말의 높낮이를 확인합니다.' },
  { id: 4, label: '결과 정리', desc: '권역별 결과와 농도 점수를 정리합니다.' },
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

export default function S4Judging<T = JudgeResult>({
  audioBlob,
  onSuccess,
  onRetry,
  onReset,
  onFailedChange,
  questionSetId = GENERAL_QUESTION_SET_ID,
  steps = JUDGING_STEPS,
}: S4JudgingProps<T>) {
  const [secElapsed, setSecElapsed] = useState(0);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string; canRetry: boolean } | null>(null);
  const failed = errorInfo !== null;

  const hasCalledApiRef = useRef(false);
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
    if (hasCalledApiRef.current) return;
    hasCalledApiRef.current = true;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const callJudgeApi = async () => {
      try {
        const ext = audioBlob.type.includes('webm') ? 'webm' : 'm4a';
        const file = new File([audioBlob], `voice-submission.${ext}`, { type: audioBlob.type });

        const formData = new FormData();
        formData.append('audio', file);
        formData.append('questionSetId', questionSetId);

        const res = await fetch('/api/judge', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        const data = await res.json();
        if (timedOutRef.current) return;

        if (!res.ok) {
          const errorCode = data.error;
          const reason = data.reason;
          const rerecordError = RERECORD_ERRORS.get(errorCode);

          if (errorCode === 'rejected') {
            if (reason === 'not_gyeongsang') {
              // 경상 정밀 감정(set-gs)에서만 온다.
              setErrorInfo({
                title: '정밀 감정 불가 (경상 방언 미확인)',
                message: '경상 방언이 확인되지 않아 정밀 감정이 불가합니다. 평소 말투로 다시 녹음하시거나 일반 감정을 이용해 주십시오.',
                canRetry: false,
              });
            } else if (reason === 'noisy') {
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

        setTimeout(() => {
          onSuccess(data as T);
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

    callJudgeApi();
  }, [audioBlob, onSuccess, questionSetId]);

  return (
    <div className="screen-glass p-5 sm:p-7 lg:p-10">
      {/* Error Notice: 오류가 나면 화면 맨 위에 안내와 버튼을 둔다 */}
      {errorInfo && (
        <div
          ref={errorPanelRef}
          role="alert"
          className="mb-6 scroll-mt-36 rounded-3xl border border-red-500/40 bg-red-500/10 p-5 shadow-2xl shadow-red-500/5 backdrop-blur-xl sm:p-6 lg:flex lg:items-center lg:justify-between lg:gap-8 lg:p-7"
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 items-center">

        {/* Plain status and elapsed time */}
        <div className="flex flex-col justify-center rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-8 shadow-2xl backdrop-blur-xl sm:p-10 lg:col-span-5">
          <div className="flex items-center gap-4">
            <div className="judging-indicator" aria-hidden="true">
              {failed ? <span>!</span> : <span className="judging-spinner" />}
            </div>
            <div>
              <p className="text-xs text-zinc-500">판정 상태</p>
              <h2 className="mt-1 text-xl font-medium text-white">
                {failed ? '심사 중단' : '음성 감정 진행 중'}
              </h2>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-zinc-400">
            {failed
              ? '심사가 중단되었습니다. 위의 안내에 따라 다시 진행해 주십시오.'
              : '녹음에서 확인된 어휘와 발음, 어미와 억양을 살펴보고 있습니다.'}
          </p>

          {!errorInfo && (
            <p className="mt-6 border-t border-zinc-800 pt-4 text-sm text-zinc-400">
              처리 시간 <strong className="ml-2 font-semibold text-white">{secElapsed}초</strong>
              <span className="ml-2 text-zinc-500">최대 30초</span>
            </p>
          )}
        </div>

        {/* Right Column: Step Timeline & Details */}
        <div className="flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-xl sm:p-8 lg:col-span-7">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">
              실시간 분석 단계
            </h3>

            <div className="mt-4 space-y-3">
              {steps.map((step, idx) => {
                const isDone = currentStepIndex > idx;
                const isCurrent = currentStepIndex === idx;

                return (
                  <div
                    key={step.id}
                    className={`flex items-start gap-4 rounded-2xl border p-4 transition-all ${
                      isCurrent
                        ? 'border-indigo-500/50 bg-indigo-500/10 shadow-lg shadow-indigo-500/5'
                        : isDone
                        ? 'border-zinc-800/60 bg-zinc-900/40 text-zinc-400'
                        : 'border-zinc-900 bg-black/30 text-zinc-600'
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isDone
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : isCurrent
                          ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
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
                        {isCurrent && !failed && (
                          <span className="flex items-center gap-2 text-xs font-medium text-indigo-300">
                            <span className="judging-live-dot" />
                            진행 중
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
