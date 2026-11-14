'use client';

import { useState } from 'react';
import Header from '@/components/common/Header';
import S1Intro from '@/components/screens/S1Intro';
import S2Consent from '@/components/screens/S2Consent';
import S3Recorder from '@/components/screens/S3Recorder';
import { ScreenStep } from '@/types/screen';

export default function Home() {
  const [step, setStep] = useState<ScreenStep>('S1');

  const getStepLabel = (s: ScreenStep) => {
    switch (s) {
      case 'S1':
        return '1단계: 감정신청';
      case 'S2':
        return '2단계: 안내및동의';
      case 'S3':
        return '3단계: 구술녹음';
      default:
        return '';
    }
  };

  return (
    <div className="flex min-h-screen w-full justify-center bg-stone-200">
      <main className="flex min-h-screen w-full max-w-[430px] flex-col justify-between border-x border-stone-300 bg-stone-100 shadow-lg">
        <div>
          {/* 공공기관 서식 헤더 */}
          <Header currentStep={getStepLabel(step)} />

          {/* 화면 단계별 컴포넌트 */}
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
            <S3Recorder onResetAll={() => setStep('S1')} />
          )}
        </div>

        {/* 하단 공공서식 푸터 */}
        <footer className="border-t border-stone-300 bg-stone-200/80 px-4 py-3 text-center text-[10px] text-stone-500">
          <div>국립방언품질평가원 행정정보망 · 원산지증명서(C/O) 시스템</div>
          <div className="mt-0.5 font-mono text-stone-400">
            2026 바보톤 출품작 [주제: 쓸데없이 진지한 방언 검정소]
          </div>
        </footer>
      </main>
    </div>
  );
}
