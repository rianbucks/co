'use client';

import { useState } from 'react';
import Header from '@/components/common/Header';
import S1Intro from '@/components/screens/S1Intro';
import S2Consent from '@/components/screens/S2Consent';
import S3Recorder from '@/components/screens/S3Recorder';
import S4Judging from '@/components/screens/S4Judging';
import S5Result from '@/components/screens/S5Result';
import { ScreenStep } from '@/types/screen';
import { JudgeResult } from '@/lib/judge/contract';

export default function Home() {
  const [step, setStep] = useState<ScreenStep>('S1');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);

  const getStepLabel = (s: ScreenStep) => {
    switch (s) {
      case 'S1':
        return '시작';
      case 'S2':
        return '안내';
      case 'S3':
        return '녹음';
      case 'S4':
        return '분석 중';
      case 'S5':
        return '결과';
      default:
        return '';
    }
  };

  const handleRecordingComplete = (blob: Blob) => {
    setAudioBlob(blob);
    setStep('S4');
  };

  const handleJudgingSuccess = (result: JudgeResult) => {
    setJudgeResult(result);
    setStep('S5');
  };

  const handleResetAll = () => {
    setAudioBlob(null);
    setJudgeResult(null);
    setStep('S1');
  };

  return (
    <div className="relative min-h-screen w-full bg-black text-zinc-100 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Desktop Ambient Background Orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[160px]" />
        <div className="absolute top-1/3 left-1/4 h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[150px]" />
        <div className="absolute bottom-10 right-1/4 h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[150px]" />
      </div>

      {/* Main Responsive Wrapper: Mobile (full-width) / Desktop (max-w-5xl/6xl 2-column) */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-md lg:max-w-5xl xl:max-w-6xl flex-col justify-between border-x border-zinc-800/60 bg-zinc-950/70 shadow-2xl backdrop-blur-2xl transition-all duration-300">
        <div>
          {/* iOS Frosted Header */}
          <Header
            currentStep={getStepLabel(step)}
            onHomeClick={handleResetAll}
          />

          {/* Main Screens */}
          <main className="w-full">
            {step === 'S1' && (
              <S1Intro onNext={() => setStep('S2')} />
            )}

            {step === 'S2' && (
              <S2Consent
                onNext={() => setStep('S3')}
                onPrev={() => setStep('S1')}
              />
            )}

            {step === 'S3' && (
              <S3Recorder
                onComplete={handleRecordingComplete}
                onResetAll={handleResetAll}
              />
            )}

            {step === 'S4' && audioBlob && (
              <S4Judging
                audioBlob={audioBlob}
                onSuccess={handleJudgingSuccess}
                onRetry={() => {
                  setStep('S3');
                  setTimeout(() => setStep('S4'), 50);
                }}
                onReset={handleResetAll}
              />
            )}

            {step === 'S5' && judgeResult && (
              <S5Result
                result={judgeResult}
                onResetAll={handleResetAll}
              />
            )}
          </main>
        </div>

        {/* Minimal Clean Footer */}
        <footer className="border-t border-zinc-900/80 px-6 py-5 text-center text-xs text-zinc-400">
          <div>원산지증명서 (C/O) · Voice Dialect Analysis System</div>
        </footer>
      </div>
    </div>
  );
}
