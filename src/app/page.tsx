'use client';

import { useCallback, useRef, useState } from 'react';
import Header from '@/components/common/Header';
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
  const pressedButton = useRef<HTMLButtonElement | null>(null);
  function clearPressedButton() {
    pressedButton.current?.removeAttribute('data-pressed');
    pressedButton.current = null;
  }

  const recorderControls = useRef<{ requestExit: () => void }>(null);
  const [path, setPath] = useState<ScreenStep[]>(['S1']);
  const step = path[path.length - 1];
  const [judgeAttempt, setJudgeAttempt] = useState(0);

  function navigate(next: ScreenStep) {
    setPath(previous => [...previous, next]);
  }

  function goBack() {
    setPath(previous => previous.length > 1 ? previous.slice(0, -1) : previous);
  }
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [judgeResult, setJudgeResult] = useState<JudgeResult | null>(null);
  /** 지금 감정 결과로 등록한 랭킹 항목 id. 새 감정을 받거나 처음으로 돌아가면 지운다. */
  const [rankingNickname, setRankingNickname] = useState('');
  const [rankingEntryId, setRankingEntryId] = useState<string | null>(null);
  /** 감정(S4)이 오류로 멈췄는지. 머리글에 '분석 중단'을 보여 준다. 감정을 다시 시작하면 지운다. */
  const [judgingFailed, setJudgingFailed] = useState(false);

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
    navigate('S4');
  };

  const handleJudgingSuccess = useCallback((result: JudgeResult) => {
    setJudgeResult(result);
    setRankingEntryId(null);
    // 완료된 분석을 뒤로가기로 다시 실행하지 않는다.
    setPath(previous => [...previous.slice(0, -1), 'S5']);
  }, []);

  const handleResetAll = () => {
    setRankingNickname('');
    setAudioBlob(null);
    setJudgeResult(null);
    setRankingEntryId(null);
    setJudgingFailed(false);
    setPath(['S1']);
  };

  const judgingStopped = step === 'S4' && judgingFailed;
  /** 녹음(S3)과 감정(S4) 중에는 진행 중인 작업을 잃지 않도록 머리글에 랭킹 버튼을 두지 않는다. */
  const showRankingLink = step !== 'S3' && step !== 'S4' && step !== 'S7';

  return (
    <div
      onPointerDown={event => {
        if (event.pointerType === 'mouse' || !event.isPrimary) return;
        clearPressedButton();
        const button = event.target instanceof Element ? event.target.closest('button:enabled') : null;
        if (button instanceof HTMLButtonElement) {
          button.setAttribute('data-pressed', '');
          pressedButton.current = button;
        }
      }}
      onPointerUp={clearPressedButton}
      onPointerCancel={clearPressedButton}
      onLostPointerCapture={clearPressedButton}
      className="app-shell min-h-screen w-full text-zinc-100 antialiased selection:bg-sky-700 selection:text-white">
      <div className="app-frame mx-auto">
        <div>
          {step !== 'S1' && (
            <Header
              currentStep={judgingStopped ? '분석 중단' : getStepLabel(step)}
              stopped={judgingStopped}
              onBack={step === 'S3' ? () => recorderControls.current?.requestExit() : goBack}
              onRankingClick={showRankingLink ? () => navigate('S7') : undefined}
            />
          )}

          {/* Main Screens */}
          <main className="w-full">
            {step === 'S1' && (
              <S1Intro nickname={rankingNickname} onNicknameChange={setRankingNickname} onNext={() => navigate('S2')} onViewRanking={() => navigate('S7')} />
            )}

            {step === 'S2' && (
              <S2Consent
                onNext={() => navigate('S3')}
                onPrev={goBack}
              />
            )}

            {step === 'S3' && (
              <S3Recorder
                ref={recorderControls}
                onBack={goBack}
                onComplete={handleRecordingComplete}
                onResetAll={handleResetAll}
              />
            )}

            {step === 'S4' && audioBlob && (
              <S4Judging
                key={judgeAttempt}
                audioBlob={audioBlob}
                onSuccess={handleJudgingSuccess}
                onRetry={() => {
                  setJudgingFailed(false);
                  setJudgeAttempt(attempt => attempt + 1);
                }}
                onReset={handleResetAll}
                onFailedChange={setJudgingFailed}
              />
            )}

            {step === 'S5' && judgeResult && (
              <S5Result
                result={judgeResult}
                onGoToCertificate={() => navigate('S6')}
                onGoToRanking={() => navigate('S7')}
                onResetAll={handleResetAll}
              />
            )}

            {step === 'S6' && judgeResult && (
              <S6Certificate
                result={judgeResult}
                onBack={goBack}
                onGoToRanking={() => navigate('S7')}
                onResetAll={handleResetAll}
              />
            )}

            {step === 'S7' && (
              <S7Ranking
                result={judgeResult}
                nickname={rankingNickname}
                onNicknameChange={setRankingNickname}
                entryId={rankingEntryId}
                onRegistered={setRankingEntryId}
                onBack={goBack}
                onApply={() => navigate('S2')}
                onResetAll={handleResetAll}
              />
            )}
          </main>
        </div>

      </div>
    </div>
  );
}
