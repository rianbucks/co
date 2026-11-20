'use client';

import { useEffect, useState } from 'react';
import Header, { type HeaderTab } from '@/components/common/Header';
import GyeongsangFlow, { INITIAL_GS_STATUS, type GsFlowStatus } from '@/components/gyeongsang/GyeongsangFlow';
import S1Intro from '@/components/screens/S1Intro';
import S2Consent from '@/components/screens/S2Consent';
import S3Recorder from '@/components/screens/S3Recorder';
import S4Judging from '@/components/screens/S4Judging';
import S5Result from '@/components/screens/S5Result';
import S6Certificate from '@/components/screens/S6Certificate';
import S7Ranking from '@/components/screens/S7Ranking';
import { ScreenStep } from '@/types/screen';
import { JudgeResult } from '@/lib/judge/contract';

export default function Home() {
  const [step, setStep] = useState<ScreenStep>('S1');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  /** 지금 감정 결과로 등록한 랭킹 항목 id. 새 감정을 받거나 처음으로 돌아가면 지운다. */
  const [rankingEntryId, setRankingEntryId] = useState<string | null>(null);
  /** 감정(S4)이 오류로 멈췄는지. 머리글에 '분석 중단'을 보여 준다. 감정을 다시 시작하면 지운다. */
  const [judgingFailed, setJudgingFailed] = useState(false);
  /** 머리글 탭: 일반 감정(S1~S7) 또는 경상 정밀 감정. 탭을 오가도 각 탭의 진행 상태는 그대로 둔다. */
  const [mode, setMode] = useState<HeaderTab>('general');
  /**
   * 경상 정밀 감정 흐름의 회차. null이면 아직 들어가지 않았다. 값이 바뀌면 흐름을 처음(안내)부터 새로 그린다.
   * 탭과 S1 버튼은 진행하던 흐름을 그대로 보여 주고, S5의 권유 버튼은 새로 시작한다.
   */
  const [gsSession, setGsSession] = useState<number | null>(null);
  const [gsStatus, setGsStatus] = useState<GsFlowStatus>(INITIAL_GS_STATUS);

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
      case 'S6':
        return '감정서';
      case 'S7':
        return '랭킹';
      default:
        return '';
    }
  };

  const handleRecordingComplete = (blob: Blob) => {
    setAudioBlob(blob);
    setJudgingFailed(false);
    setStep('S4');
  };

  const handleJudgingSuccess = (result: JudgeResult) => {
    setJudgeResult(result);
    setRankingEntryId(null);
    setStep('S5');
  };

  const handleResetAll = () => {
    setAudioBlob(null);
    setJudgeResult(null);
    setRankingEntryId(null);
    setJudgingFailed(false);
    setStep('S1');
  };

  const judgingStopped = step === 'S4' && judgingFailed;
  /** 녹음(S3)과 감정(S4) 중에는 진행 중인 작업을 잃지 않도록 머리글에 랭킹 버튼을 두지 않는다. */
  const showRankingLink = step !== 'S3' && step !== 'S4' && step !== 'S7';

  /** 경상 정밀 감정을 처음(안내)부터 새로 시작한다. */
  const startGyeongsang = () => {
    setGsSession((session) => (session ?? 0) + 1);
    setGsStatus(INITIAL_GS_STATUS);
    setMode('gyeongsang');
  };

  const handleTabChange = (tab: HeaderTab) => {
    if (tab === 'gyeongsang' && gsSession === null) startGyeongsang();
    else setMode(tab);
  };

  /** S1에는 머리글(탭)이 없으므로 S1 버튼이 탭 대신 진행하던 정밀 감정으로 간다. 없으면 새로 시작한다. */
  const openGyeongsang = () => handleTabChange('gyeongsang');

  /** 로고: 일반 감정 첫 화면으로 돌아가고 정밀 감정 흐름도 지운다. */
  const handleHomeClick = () => {
    handleResetAll();
    setMode('general');
    setGsSession(null);
    setGsStatus(INITIAL_GS_STATUS);
  };

  // 탭을 바꾸면 화면 맨 위부터 보여 준다.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [mode]);

  const general = mode === 'general';
  /** 녹음이나 심사 중에는 작업을 잃지 않도록 다른 탭으로 가지 못하게 한다. */
  const tabsDisabled = general ? step === 'S3' || step === 'S4' : gsStatus.busy;

  return (
    <div className="app-shell min-h-screen w-full text-zinc-100 antialiased selection:bg-sky-700 selection:text-white">
      <div className="app-frame mx-auto flex min-h-screen flex-col justify-between border-x">
        <div>
          {/* 일반 감정 첫 화면(S1)에는 머리글을 두지 않는다. 정밀 감정은 모든 단계에 머리글(탭)을 둔다. */}
          {!(general && step === 'S1') && (
            <Header
              currentStep={general ? (judgingStopped ? '분석 중단' : getStepLabel(step)) : gsStatus.label}
              stopped={general ? judgingStopped : gsStatus.stopped}
              onHomeClick={handleHomeClick}
              onRankingClick={general && showRankingLink ? () => setStep('S7') : undefined}
              activeTab={mode}
              onTabChange={handleTabChange}
              tabsDisabled={tabsDisabled}
            />
          )}

          {/* Main Screens */}
          <main className="w-full">
            {general && step === 'S1' && (
              <S1Intro
                onNext={() => setStep('S2')}
                onViewRanking={() => setStep('S7')}
                onStartGyeongsang={openGyeongsang}
              />
            )}

            {general && step === 'S2' && (
              <S2Consent
                onNext={() => setStep('S3')}
                onPrev={() => setStep('S1')}
              />
            )}

            {general && step === 'S3' && (
              <S3Recorder
                onComplete={handleRecordingComplete}
                onResetAll={handleResetAll}
              />
            )}

            {general && step === 'S4' && audioBlob && (
              <S4Judging
                audioBlob={audioBlob}
                onSuccess={handleJudgingSuccess}
                onRetry={() => {
                  setJudgingFailed(false);
                  setStep('S3');
                  setTimeout(() => setStep('S4'), 50);
                }}
                onReset={handleResetAll}
                onFailedChange={setJudgingFailed}
              />
            )}

            {general && step === 'S5' && judgeResult && (
              <S5Result
                result={judgeResult}
                onGoToCertificate={() => setStep('S6')}
                onGoToRanking={() => setStep('S7')}
                onResetAll={handleResetAll}
                onStartGyeongsang={startGyeongsang}
              />
            )}

            {general && step === 'S6' && judgeResult && (
              <S6Certificate
                result={judgeResult}
                onBack={() => setStep('S5')}
                onGoToRanking={() => setStep('S7')}
                onResetAll={handleResetAll}
              />
            )}

            {general && step === 'S7' && (
              <S7Ranking
                result={judgeResult}
                entryId={rankingEntryId}
                onRegistered={setRankingEntryId}
                onBack={() => setStep('S5')}
                onApply={() => setStep('S2')}
                onResetAll={handleResetAll}
              />
            )}

            {/* 경상 정밀 감정: 처음 들어갈 때 그리고, 일반 감정 탭으로 가도 진행 상태를 두기 위해 숨기기만 한다 */}
            {gsSession !== null && (
              <div hidden={general}>
                <GyeongsangFlow
                  key={gsSession}
                  onExit={() => setMode('general')}
                  onStatusChange={setGsStatus}
                />
              </div>
            )}
          </main>
        </div>

        <footer className="app-footer border-t px-6 py-5 text-center text-xs text-zinc-400">
          <div>원산지증명서 · 사투리 음성 감정 안내</div>
        </footer>
      </div>
    </div>
  );
}
