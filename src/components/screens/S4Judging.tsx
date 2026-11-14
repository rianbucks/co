'use client';

import { useState, useEffect, useRef } from 'react';
import { JudgeResult } from '@/lib/judge/contract';

interface S4JudgingProps {
  audioBlob: Blob;
  onSuccess: (result: JudgeResult) => void;
  onRetry: () => void;
  onReset: () => void;
}

interface StepItem {
  id: number;
  label: string;
  desc: string;
}

const JUDGING_STEPS: StepItem[] = [
  { id: 1, label: '구술 서류 접수 완료', desc: '40초 음성 데이터 무결성 및 컨테이너 규격 확인' },
  { id: 2, label: '어휘 및 음운 분석', desc: '지역 고유 어휘, 받침 축약 및 음운 변이 계측' },
  { id: 3, label: '어미 및 억양 대조', desc: '종결어미 패턴 대조 및 고저 억양 곡선 산출' },
  { id: 4, label: '전문 감정위원 심의 합의', desc: '6개 권역 확률 및 농도 등급 최종 확정' },
];

export default function S4Judging({ audioBlob, onSuccess, onRetry, onReset }: S4JudgingProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0); // 0 ~ 3
  const [secElapsed, setSecElapsed] = useState(0);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string; canRetry: boolean } | null>(null);

  const hasCalledApiRef = useRef(false);

  // 단계별 진행 애니메이션 연출 (시간 경과 기반)
  useEffect(() => {
    const timer = setInterval(() => {
      setSecElapsed((prev) => {
        const next = prev + 1;
        if (next >= 2 && next < 6) setCurrentStepIndex(1);
        else if (next >= 6 && next < 12) setCurrentStepIndex(2);
        else if (next >= 12) setCurrentStepIndex(3);

        // 30초 초과 시 타임아웃 처리
        if (next >= 30 && !hasCalledApiRef.current) {
          setErrorInfo({
            title: '심사 소요 시간 초과',
            message: '감정 심사 대기 시간이 30초를 경과하였습니다. 네트워크 연결 상태를 확인 후 다시 시도해 주십시오.',
            canRetry: true,
          });
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 실제 API 호출 (한 번만 실행)
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

        console.log('[S4Judging] POST /api/judge 요청 발송...');
        const res = await fetch('/api/judge', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        console.log('[S4Judging] POST /api/judge 응답 수신:', data);

        if (!res.ok) {
          // 명세 6장 오류 문구 매핑
          const errorCode = data.error;
          const reason = data.reason;

          if (errorCode === 'rejected') {
            if (reason === 'noisy') {
              setErrorInfo({
                title: '감정 반려 (소음 과다)',
                message: '주변 소음으로 인해 감정이 불가합니다. 조용한 환경에서 재신청 바랍니다.',
                canRetry: false,
              });
            } else {
              // too_short, no_speech
              setErrorInfo({
                title: '감정 반려 (음성 미확인)',
                message: '말소리가 명확히 확인되지 않아 감정이 반려되었습니다. 마이크에 가까이 대고 다시 녹음해 주십시오.',
                canRetry: false,
              });
            }
          } else if (errorCode === 'rate_limited') {
            setErrorInfo({
              title: '접수 마감',
              message: '금일 감정 접수가 마감되었습니다. 내일 다시 이용하여 주십시오.',
              canRetry: false,
            });
          } else if (errorCode === 'too_large') {
            setErrorInfo({
              title: '규격 초과',
              message: '음성 파일 크기가 2MB를 초과하여 심사할 수 없습니다.',
              canRetry: false,
            });
          } else {
            // ai_error, server_error
            setErrorInfo({
              title: '심사위원 부재',
              message: '감정위원이 자리를 비웠거나 일시적인 장애가 발생했습니다.',
              canRetry: true,
            });
          }
          return;
        }

        // 성공 시 살짝 여유를 두고 결과 화면으로 전환
        setTimeout(() => {
          onSuccess(data as JudgeResult);
        }, 600);
      } catch (err) {
        console.error('[S4Judging] API 호출 예외:', err);
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
    <div className="flex flex-col gap-4 p-4 text-stone-900">
      <div className="border border-stone-400 bg-white p-4 shadow-xs">
        {/* 상단 타이틀 */}
        <div className="border-b border-stone-300 pb-2 text-center">
          <div className="text-[11px] font-semibold text-stone-600">감정 절차 제4단계</div>
          <h2 className="text-lg font-bold tracking-tight text-stone-900">
            방언 감정위원회 심사 진행 중
          </h2>
          <p className="mt-1 text-xs text-stone-600">
            접수된 음성 데이터를 토대로 4대 지표 정밀 감정을 진행하고 있습니다.
          </p>
        </div>

        {/* 심사 진행 스텝 목록 */}
        <div className="my-5 space-y-3">
          {JUDGING_STEPS.map((step, idx) => {
            const isDone = currentStepIndex > idx;
            const isCurrent = currentStepIndex === idx;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 rounded border p-3 transition-all ${
                  isCurrent
                    ? 'border-stone-800 bg-stone-50 shadow-xs ring-1 ring-stone-800'
                    : isDone
                    ? 'border-stone-300 bg-stone-100/60 text-stone-600'
                    : 'border-dashed border-stone-200 bg-stone-50/40 text-stone-400'
                }`}
              >
                {/* 단계 번호 / 인디케이터 */}
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-200 text-stone-500'
                  }`}
                >
                  {isDone ? '✓' : step.id}
                </div>

                {/* 텍스트 */}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        isCurrent ? 'text-stone-900' : isDone ? 'text-stone-700' : 'text-stone-400'
                      }`}
                    >
                      {step.label}
                    </span>
                    {isCurrent && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                        <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-amber-600" />
                        심사 중...
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 하단 스피너 및 경과 시간 */}
        {!errorInfo && (
          <div className="rounded border border-stone-200 bg-stone-50 p-3 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-stone-700">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
              <span>실시간 심사 진행 중 ({secElapsed}초 경과 / 최대 30초)</span>
            </div>
            <p className="mt-1 text-[10px] text-stone-500">
              인공지능 다차원 억양 분석으로 인해 최대 10~25초가 소요될 수 있습니다.
            </p>
          </div>
        )}

        {/* 에러 상태 카드 */}
        {errorInfo && (
          <div className="rounded border border-red-300 bg-red-50 p-3.5 text-xs text-red-900">
            <div className="flex items-center gap-1.5 font-bold text-red-800">
              <span>⚠️</span>
              <span>{errorInfo.title}</span>
            </div>
            <p className="mt-1.5 leading-relaxed text-red-700">
              {errorInfo.message}
            </p>

            <div className="mt-3 flex gap-2">
              {errorInfo.canRetry ? (
                <button
                  onClick={onRetry}
                  className="flex-1 rounded bg-stone-900 py-2 font-bold text-white hover:bg-stone-800"
                >
                  재시도
                </button>
              ) : (
                <button
                  onClick={onReset}
                  className="flex-1 rounded bg-stone-900 py-2 font-bold text-white hover:bg-stone-800"
                >
                  처음부터 다시 녹음하기
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-stone-500">
        심사 도중 창을 닫거나 새로고침하면 접수가 취소될 수 있습니다.
      </p>
    </div>
  );
}
