'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { QUESTIONS, QuestionItem } from '@/types/screen';

interface S3RecorderProps {
  onComplete: (blob: Blob) => void;
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
const SECONDS_PER_QUESTION = 10;
/** 남은 시간을 다시 계산하는 간격. 1초보다 짧게 두어 표시가 밀리지 않게 한다. */
const TIMER_TICK_MS = 200;
const LAST_QUESTION_IDX = QUESTIONS.length - 1;
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

export default function S3Recorder({ onComplete, onResetAll }: S3RecorderProps) {
  const [currentIdx, setCurrentIdx] = useState(0); // 화면에 보이는 문항: 0, 1, 2, 3
  const [phase, setPhase] = useState<RecordingPhase>('ready');
  const [secLeft, setSecLeft] = useState(SECONDS_PER_QUESTION);
  const [supportedMime, setSupportedMime] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

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

  const currentQuestion: QuestionItem = QUESTIONS[currentIdx];

  const cleanupAudio = useCallback(() => {
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
    if (finishedIdx < LAST_QUESTION_IDX) {
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
  }, [clearTimer, stopVolumeVisualizer]);

  /** questionIdx 문항의 10초 타이머를 시작한다. 종료 처리는 상태 갱신 함수 밖에서 한다. */
  const startCountdown = useCallback((questionIdx: number) => {
    clearTimer();
    recordingIdxRef.current = questionIdx;
    phaseChangedAtRef.current = performance.now();
    const deadline = phaseChangedAtRef.current + SECONDS_PER_QUESTION * 1000;
    setSecLeft(SECONDS_PER_QUESTION);

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      setSecLeft(remaining);
      if (remaining === 0) finishQuestion();
    }, TIMER_TICK_MS);
  }, [clearTimer, finishQuestion]);

  const handleStartFirstRecording = async () => {
    if (startingRef.current || recorderRef.current) return;
    startingRef.current = true;
    try {
      setErrorMessage('');
      chunksRef.current = [];
      setCurrentIdx(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  const isLastQuestion = currentIdx === LAST_QUESTION_IDX;
  const statusLabel =
    phase === 'recording'
      ? 'ON AIR (녹음 중)'
      : phase === 'paused'
        ? '일시정지 · 다음 문항 대기'
        : phase === 'processing'
          ? '녹음 종료'
          : '녹음 대기';
  const timerHint =
    phase === 'recording'
      ? isLastQuestion
        ? `${secLeft}초 후 자동으로 제출`
        : `${secLeft}초 후 자동으로 다음 문항 이동`
      : phase === 'ready' || phase === 'paused'
        ? '문항을 읽고 녹음 시작을 눌러 주십시오'
        : '녹음 종료';

  return (
    <div className="p-5 sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 items-stretch">

        {/* Left Column: Situation Prompt & Instructions */}
        <div className="flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-6">
          <div>
            {/* Step Counter Pill & Reset */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 items-center rounded-full bg-indigo-500/20 px-3 text-xs font-bold text-indigo-300">
                  문항 {currentIdx + 1} / {QUESTIONS.length}
                </span>
                <span className="text-xs font-medium text-zinc-400">
                  상황극 녹음
                </span>
              </div>

              <button
                onClick={handleReset}
                className="rounded-full border border-zinc-700/60 bg-zinc-800/60 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
              >
                처음부터 다시
              </button>
            </div>

            {/* Target & Situation Card */}
            <div className="mt-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/10 px-3.5 py-1 text-xs font-semibold text-purple-300">
                <span>상대방:</span>
                <span className="font-bold text-white">{currentQuestion.target}</span>
              </div>

              <h3 className="mt-4 text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl lg:text-3xl">
                {currentQuestion.situation}
              </h3>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs font-medium text-amber-300/90">
            ※ 설명하지 마시고, 실제로 그 사람에게 말하듯이 답변해 주십시오.
          </div>
        </div>

        {/* Right Column: Studio Waveform & Controls */}
        <div className="flex flex-col justify-between gap-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-xl sm:p-8 lg:col-span-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300">오디오 레코딩 콘솔</span>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${phase === 'recording' ? 'text-red-400' : 'text-zinc-500'}`}>
                <span className={`h-2 w-2 rounded-full ${phase === 'recording' ? 'bg-red-500 animate-ping' : 'bg-zinc-600'}`} />
                {statusLabel}
              </span>
            </div>

            {/* Large Audio Waveform Visualizer */}
            <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-zinc-800/80 bg-black/60 p-8 shadow-inner">
              <div className="flex h-20 items-center justify-center gap-2">
                {[...Array(16)].map((_, i) => {
                  const active = phase === 'recording';
                  const height = active ? Math.max(15, Math.min(100, audioLevel * (0.8 + (i % 4) * 0.25))) : 12;
                  return (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-all duration-75 ${
                        active ? 'bg-gradient-to-t from-indigo-500 via-purple-400 to-pink-400 shadow-sm shadow-indigo-500/40' : 'bg-zinc-800'
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>

              {/* Digital Countdown Timer */}
              <div className="mt-6 text-center">
                <div className="font-mono text-3xl font-black tracking-widest text-white sm:text-4xl">
                  00:{secLeft < 10 ? `0${secLeft}` : secLeft}
                </div>
                <div className="mt-1 text-[11px] font-medium text-zinc-500">
                  {timerHint}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${secLeft <= 3 ? 'bg-red-500' : 'bg-white'}`}
                  style={{ width: `${(secLeft / SECONDS_PER_QUESTION) * 100}%` }}
                />
              </div>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300">
                <p className="font-semibold">{errorMessage}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {(phase === 'ready' || phase === 'paused') && (
              <button
                onClick={phase === 'ready' ? handleStartFirstRecording : handleStartNextQuestion}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98]"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span>문항 {currentIdx + 1} 녹음 시작 ({SECONDS_PER_QUESTION}초)</span>
              </button>
            )}

            {phase === 'recording' && (
              <button
                onClick={() => {
                  if (!isDoubleTap()) finishQuestion();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98]"
              >
                <span>{isLastQuestion ? '녹음 완료 및 최종 제출' : '다음 문항으로'}</span>
                <span>→</span>
              </button>
            )}

            {phase === 'processing' && (
              <div className="flex items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 py-4 text-xs font-medium text-zinc-300">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>음성 데이터 처리 중...</span>
              </div>
            )}

            <button
              onClick={onResetAll}
              className="w-full text-center text-xs text-zinc-500 transition hover:text-zinc-300"
            >
              첫 화면으로 나가기
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
