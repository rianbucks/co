'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, type Ref } from 'react';
import type { QuestionItem } from '@/types/screen';
import { GENERAL_QUESTIONS, SECONDS_PER_QUESTION } from '@/lib/judge/questions';

interface S3RecorderProps {
  ref?: Ref<{ requestExit: () => void }>;
  onComplete: (blob: Blob) => void;
  questions?: readonly QuestionItem[];
  onBack?: () => void;
  onResetAll: () => void;
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
];

/** 문항당 녹음 시간(초) */

/** 남은 시간을 다시 계산하는 간격. 1초보다 짧게 두어 표시가 밀리지 않게 한다. */
const TIMER_TICK_MS = 200;

/**
 * 녹음 시작 버튼과 다음 문항 버튼이 같은 자리에 있어서 두 번 누르면 다음 동작까지 눌린다.
 * 상태가 바뀐 직후의 누름은 무시한다(타이머로 넘어가는 것은 막지 않는다).
 */
const DOUBLE_TAP_GUARD_MS = 500;

/**
 * ready: 첫 문항을 보여 주고 녹음 시작을 기다린다.
 * recording: 지금 문항을 녹음 중이고 타이머가 흐른다.
 * paused: 녹음을 일시정지하고 다음 문항을 보여 준다. 타이머는 10초에서 멈춰 있다.
 * processing: 마지막 문항이 끝나 녹음 파일을 만들고 제출하는 중이다.
 */
type RecordingPhase = 'ready' | 'recording' | 'paused' | 'processing' | 'error';

export default function S3Recorder({ ref, onComplete, onResetAll, onBack = onResetAll, questions = GENERAL_QUESTIONS }: S3RecorderProps) {
  const [currentIdx, setCurrentIdx] = useState(0); // 화면에 보이는 문항: 0, 1, 2, 3
  const [phase, setPhase] = useState<RecordingPhase>('ready');
  const [secLeft, setSecLeft] = useState(SECONDS_PER_QUESTION);
  const [supportedMime, setSupportedMime] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [discardAction, setDiscardAction] = useState<'exit' | 'restart' | 'back'>('exit');
  const deadlineRef = useRef(0);
  const remainingMsRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  /** 지금 녹음 중인 문항. 녹음 중이 아니면 null. 타이머와 버튼이 같은 문항을 두 번 끝내지 않게 막는다. */
  const recordingIdxRef = useRef<number | null>(null);
  /** 마이크를 여는 중이면 true. 시작 버튼을 두 번 눌러 녹음기가 둘 생기지 않게 막는다. */
  const startingRef = useRef(false);
  /** 문항 녹음을 시작하거나 끝낸 시각(performance.now) */
  const phaseChangedAtRef = useRef(0);

  const currentQuestion: QuestionItem = questions[currentIdx];

  const cleanupAudio = useCallback(() => {
    sessionRef.current += 1;
    remainingMsRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    recordingIdxRef.current = null;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder) {
      // 처음부터 다시 하거나 화면을 떠날 때는 녹음하던 파일을 제출하지 않는다.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {}
      }
      recorderRef.current = null;
    }
  }, []);

  useEffect(() => {
    let initializeFrame = 0;
    if (typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined') {
      const found = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      initializeFrame = window.requestAnimationFrame(() => setSupportedMime(found));
    }
    return () => {
      if (initializeFrame) window.cancelAnimationFrame(initializeFrame);
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const startVolumeVisualizer = (stream: MediaStream) => {
    try {
      // 분석기는 처음 한 번만 만들고, 문항을 이어 녹음할 때는 다시 쓴다.
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      if (!audioContextRef.current || !analyserRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
      }

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setAudioLevel(normalized);

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      checkVolume();
    } catch (e) {
      console.warn('AudioContext visualizer not supported:', e);
    }
  };

  const stopVolumeVisualizer = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const isDoubleTap = () => performance.now() - phaseChangedAtRef.current < DOUBLE_TAP_GUARD_MS;

  /**
   * 지금 문항을 끝낸다(10초 경과 또는 버튼). 타이머를 바로 멈추고,
   * 마지막 문항이 아니면 녹음을 일시정지한 뒤 다음 문항을 보여 주고 시작 버튼을 기다린다.
   * 마지막 문항이면 녹음을 끝내고 바로 제출한다.
   */
  const finishQuestion = useCallback(() => {
    const finishedIdx = recordingIdxRef.current;
    if (finishedIdx === null) return; // 이미 끝낸 문항(타이머와 버튼이 겹친 경우)
    recordingIdxRef.current = null;
    phaseChangedAtRef.current = performance.now();
    clearTimer();
    stopVolumeVisualizer();

    const recorder = recorderRef.current;
    if (finishedIdx < questions.length - 1) {
      if (recorder && recorder.state === 'recording') {
        recorder.pause();
      }
      setCurrentIdx(finishedIdx + 1);
      setSecLeft(SECONDS_PER_QUESTION);
      setPhase('paused');
      return;
    }

    // 마지막 문항: 녹음을 멈추면 onstop에서 파일 1개를 만들어 제출한다.
    setPhase('processing');
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, [clearTimer, stopVolumeVisualizer, questions.length]);

  /** questionIdx 문항의 10초 타이머를 시작한다. 종료 처리는 상태 갱신 함수 밖에서 한다. */
  const startCountdown = useCallback((questionIdx: number, durationMs = SECONDS_PER_QUESTION * 1000) => {
    clearTimer();
    recordingIdxRef.current = questionIdx;
    phaseChangedAtRef.current = performance.now();
    const deadline = phaseChangedAtRef.current + durationMs;
    deadlineRef.current = deadline;
    setSecLeft(Math.ceil(durationMs / 1000));

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      setSecLeft(remaining);
      if (remaining === 0) finishQuestion();
    }, TIMER_TICK_MS);
  }, [clearTimer, finishQuestion]);

  const handleStartFirstRecording = async () => {
    if (startingRef.current || recorderRef.current) return;
    startingRef.current = true;
    const session = sessionRef.current;
    try {
      setErrorMessage('');
      chunksRef.current = [];
      setCurrentIdx(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const options: MediaRecorderOptions = { audioBitsPerSecond: 48000 };
      if (supportedMime) options.mimeType = supportedMime;

      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || supportedMime || 'audio/mp4';
        const blob = new Blob(chunksRef.current, { type: finalType });
        stream.getTracks().forEach((track) => track.stop());

        if (blob.size > 2 * 1024 * 1024) {
          setPhase('error');
          setErrorMessage('녹음 파일 용량이 2MB를 초과했습니다.');
          return;
        }

        onComplete(blob);
      };

      recorder.start();
      setPhase('recording');
      startVolumeVisualizer(stream);
      startCountdown(0);
    } catch (err) {
      console.error('녹음 시작 실패:', err);
      setPhase('error');
      setErrorMessage(
        err instanceof Error ? err.message : '마이크 장치 초기화에 실패하였습니다.'
      );
    } finally {
      startingRef.current = false;
    }
  };

  /** 대기 중인 문항(currentIdx)의 녹음을 시작한다. 이 버튼을 누를 때만 녹음을 이어 가고 타이머가 흐른다. */
  const handleStartNextQuestion = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused' || recordingIdxRef.current !== null) return;
    if (isDoubleTap()) return;

    recorder.resume();
    setPhase('recording');

    if (streamRef.current) {
      startVolumeVisualizer(streamRef.current);
    }
    startCountdown(currentIdx);
  };

  const handleReset = () => {
    cleanupAudio();
    chunksRef.current = [];
    setCurrentIdx(0);
    setPhase('ready');
    setSecLeft(SECONDS_PER_QUESTION);
    setErrorMessage('');
  };

  const requestDiscard = (action: 'restart' | 'exit' | 'back') => {
    if (dialogRef.current?.open) return;
    if (phase !== 'paused' && phase !== 'recording') {
      if (action === 'back') onBack();
      else if (action === 'exit') onResetAll();
      else handleReset();
      return;
    }
    if (phase === 'recording' && recorderRef.current?.state === 'recording') {
      remainingMsRef.current = Math.max(0, deadlineRef.current - performance.now());
      recorderRef.current.pause();
      clearTimer();
      stopVolumeVisualizer();
    }
    setDiscardAction(action);
    dialogRef.current?.showModal();
  };

  useImperativeHandle(ref, () => ({ requestExit: () => requestDiscard('back') }));

  const continueSession = () => {
    const remaining = remainingMsRef.current;
    remainingMsRef.current = null;
    if (remaining === null || recorderRef.current?.state !== 'paused') return;
    if (remaining === 0) {
      finishQuestion();
      return;
    }
    recorderRef.current.resume();
    if (streamRef.current) startVolumeVisualizer(streamRef.current);
    startCountdown(currentIdx, remaining);
  };

  const isLastQuestion = currentIdx === questions.length - 1;

  return (
    <div className="studio-screen hide-header-tabs">
      <div data-enter="1" className="studio-heading">
        <span>문항 {currentIdx + 1} / {questions.length}</span>
        <button onClick={() => requestDiscard('restart')}>처음부터 다시</button>
      </div>
      <div className="question-progress" aria-hidden="true">
        {questions.map((_, index) => <i key={index} className={index <= currentIdx ? 'filled' : ''} />)}
      </div>
      <div key={currentQuestion.id} data-enter="2">
        <p className="studio-target">{currentQuestion.target}에게 · {currentQuestion.kind === 'convert' ? '평소 말투로 바꿔 말하기' : '상황에 답하기'}</p>
        <h1>{currentQuestion.situation}</h1>
        {currentQuestion.quote && <blockquote><small>{currentQuestion.quote.label}</small><p>“{currentQuestion.quote.text}”</p></blockquote>}
        <p className="studio-hint">{currentQuestion.followUp ?? (currentQuestion.kind === 'convert' ? '이 문장을 평소에 쓰는 말로 바꿔 말해 주세요.' : '상대에게 직접 말하듯 답해 주세요.')}</p>
      </div>
      <div key={`meter-${currentQuestion.id}`} data-enter="3" className="studio-meter">
        <time aria-label={`남은 시간 ${secLeft}초`}>00:{String(secLeft).padStart(2, '0')}</time>
        <div className="studio-wave" aria-hidden="true">
          {Array.from({ length: 20 }, (_, index) => {
            const level = audioLevel * (0.55 + (index % 5) * 0.2);
            return <i key={index} style={{ height: Math.max(8, Math.min(100, level)) + '%' }} />;
          })}
        </div>
        <progress max={SECONDS_PER_QUESTION} value={secLeft} aria-label="남은 녹음 시간" />
      </div>
      {errorMessage && <p role="alert" className="consent-error">{errorMessage}</p>}
      <div key={`actions-${currentQuestion.id}`} data-enter="4" className="studio-actions">
        {(phase === 'ready' || phase === 'paused') && (
          <button className="intro-primary-action" onClick={phase === 'ready' ? handleStartFirstRecording : handleStartNextQuestion}>녹음 시작</button>
        )}
        {phase === 'recording' && (
          <button className="recording-live-button" onClick={() => { if (!isDoubleTap()) finishQuestion(); }}
            aria-label={isLastQuestion ? '녹음 중. 누르면 제출합니다.' : '녹음 중. 누르면 다음 문항으로 이동합니다.'}>녹음 중</button>
        )}
        {phase === 'processing' && <p role="status">녹음을 제출하고 있어요…</p>}
        <button onClick={() => requestDiscard('exit')} className="secondary-action-button">첫 화면으로 나가기</button>
      </div>
      <dialog ref={dialogRef} className="discard-dialog" aria-labelledby="discard-heading" aria-describedby="discard-help" onClose={continueSession}>
        <h2 id="discard-heading">{discardAction !== 'restart' ? '녹음을 끝내고 나갈까요?' : '처음부터 다시 녹음할까요?'}</h2>
        <p id="discard-help">지금까지 녹음한 답변이 지워집니다.</p>
        <div className="discard-actions">
          <button autoFocus className="bg-white" onClick={() => dialogRef.current?.close()}>계속하기</button>
          <button className="secondary-action-button" onClick={() => {
            remainingMsRef.current = null;
            dialogRef.current?.close();
            if (discardAction === 'back') onBack();
            else if (discardAction === 'exit') onResetAll();
            else handleReset();
          }}>{discardAction !== 'restart' ? '나가기' : '다시 녹음'}</button>
        </div>
      </dialog>
    </div>
  );
}
