'use client';

import { useCallback, useEffect, useState } from 'react';
import S2Consent from '@/components/screens/S2Consent';
import S3Recorder from '@/components/screens/S3Recorder';
import S4Judging, { type JudgingStep } from '@/components/screens/S4Judging';
import { SUBREGION_NAMES, type GyeongsangResult } from '@/lib/gyeongsang/contract';
import { ORIGIN_NAMES, ORIGIN_SUBREGION, type OriginKey } from '@/lib/gyeongsang/origin';
import { GS_QUESTIONS, GS_QUESTION_SET_ID } from '@/lib/gyeongsang/questions';
import GsCertificate from './GsCertificate';
import GsOrigin from './GsOrigin';
import GsResult from './GsResult';

/** 안내(S2 재사용) → 원산지 신고 → 녹음(S3 재사용) → 심사(S4 재사용) → 정밀 결과 → 정밀 감정서 */
const GS_STEPS = ['intro', 'origin', 'record', 'judging', 'result', 'certificate'] as const;
type GsStep = (typeof GS_STEPS)[number];

const STEP_LABELS: Record<GsStep, string> = {
  intro: '안내',
  origin: '원산지 신고',
  record: '녹음',
  judging: '분석 중',
  result: '정밀 결과',
  certificate: '정밀 감정서',
};

const GS_JUDGING_STEPS: readonly JudgingStep[] = [
  { id: 1, label: '구술 서류 접수', desc: '녹음 데이터 컨테이너 및 40초 무결성 검증' },
  { id: 2, label: '경상 방언 특징 계측', desc: '어휘, 어미, 음운 변이의 경상 방언 특징 계측' },
  { id: 3, label: '경북권·경남권 성분 대조', desc: '종결어미 패턴과 억양 곡선의 하위 권역 대조' },
  { id: 4, label: '정밀 감정위원 심의 합의', desc: '성분 비율 및 경상 농도 등급 최종 확정' },
];

/** 머리글에 보여 줄 정밀 감정의 진행 상태. */
export interface GsFlowStatus {
  label: string;
  /** 심사가 오류로 멈춤 */
  stopped: boolean;
  /** 녹음이나 심사 중(다른 탭으로 가면 작업을 잃는다) */
  busy: boolean;
}

export const INITIAL_GS_STATUS: GsFlowStatus = { label: STEP_LABELS.intro, stopped: false, busy: false };

interface GyeongsangFlowProps {
  /** 안내 화면에서 '이전 화면으로'를 누르면 일반 감정 탭으로 돌아간다. */
  onExit: () => void;
  onStatusChange?: (status: GsFlowStatus) => void;
}

function FlowBanner({ step, origin }: { step: GsStep; origin: OriginKey | null }) {
  const index = GS_STEPS.indexOf(step);
  return (
    <div className="break-keep px-5 pt-5 sm:px-7 sm:pt-7 lg:px-10 lg:pt-8">
      <div className="glass-panel px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-sm font-semibold text-amber-100">경상 방언 정밀 감정</p>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              {index + 1}/{GS_STEPS.length} · {STEP_LABELS[step]}
            </p>
          </div>
          {origin && (
            <span className="shrink-0 whitespace-nowrap rounded-lg border border-amber-100/25 bg-amber-100/[0.08] px-2.5 py-1 text-xs font-semibold text-amber-50">
              신고 원산지 {ORIGIN_NAMES[origin]} · {SUBREGION_NAMES[ORIGIN_SUBREGION[origin]]}
            </span>
          )}
        </div>
        <div className="mt-2.5 grid grid-cols-6 gap-1" aria-hidden="true">
          {GS_STEPS.map((item, itemIndex) => (
            <span key={item} className={`h-1 rounded-full ${itemIndex <= index ? 'bg-amber-200/80' : 'bg-white/10'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 경상 정밀 감정 탭의 흐름. 신고 원산지와 결과는 이 컴포넌트 안에만 두고 서버로 보내지 않는다.
 * 녹음은 set-gs 문항으로, 심사는 questionSetId=set-gs로 요청한다.
 */
export default function GyeongsangFlow({ onExit, onStatusChange }: GyeongsangFlowProps) {
  const [step, setStep] = useState<GsStep>('intro');
  const [origin, setOrigin] = useState<OriginKey | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [result, setResult] = useState<GyeongsangResult | null>(null);
  const [judgingFailed, setJudgingFailed] = useState(false);
  /** 심사 요청 번호. 재시도하면 늘려서 심사 화면을 새로 그린다(같은 녹음을 다시 보낸다). */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const stopped = step === 'judging' && judgingFailed;
    onStatusChange?.({
      label: stopped ? '분석 중단' : STEP_LABELS[step],
      stopped,
      busy: step === 'record' || step === 'judging',
    });
  }, [step, judgingFailed, onStatusChange]);

  // 단계가 바뀌면 화면 맨 위부터 보여 준다(아래쪽 버튼을 누르고 넘어오는 경우가 많다).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const restart = useCallback(() => {
    setAudioBlob(null);
    setResult(null);
    setJudgingFailed(false);
    setStep('intro');
  }, []);

  const handleRecordingComplete = useCallback((blob: Blob) => {
    setAudioBlob(blob);
    setJudgingFailed(false);
    setAttempt((value) => value + 1);
    setStep('judging');
  }, []);

  const handleJudgingSuccess = useCallback((judged: GyeongsangResult) => {
    setResult(judged);
    setStep('result');
  }, []);

  const handleRetry = useCallback(() => {
    setJudgingFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  return (
    <div>
      <FlowBanner step={step} origin={step === 'intro' ? null : origin} />

      {step === 'intro' && <S2Consent onNext={() => setStep('origin')} onPrev={onExit} />}

      {step === 'origin' && (
        <GsOrigin
          selected={origin}
          onSelect={setOrigin}
          onNext={() => {
            if (origin) setStep('record');
          }}
          onPrev={() => setStep('intro')}
        />
      )}

      {step === 'record' && (
        <S3Recorder questions={GS_QUESTIONS} onComplete={handleRecordingComplete} onResetAll={restart} />
      )}

      {step === 'judging' && audioBlob && (
        <S4Judging<GyeongsangResult>
          key={attempt}
          audioBlob={audioBlob}
          questionSetId={GS_QUESTION_SET_ID}
          steps={GS_JUDGING_STEPS}
          onSuccess={handleJudgingSuccess}
          onRetry={handleRetry}
          onReset={restart}
          onFailedChange={setJudgingFailed}
        />
      )}

      {step === 'result' && result && origin && (
        <GsResult
          result={result}
          origin={origin}
          onGoToCertificate={() => setStep('certificate')}
          onRestart={restart}
        />
      )}

      {step === 'certificate' && result && origin && (
        <GsCertificate result={result} origin={origin} onBack={() => setStep('result')} onRestart={restart} />
      )}
    </div>
  );
}
