'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  GENERAL_QUESTIONS,
  SECONDS_PER_QUESTION,
  hasConvertQuestions,
  questionKind,
} from '@/lib/judge/questions';
import type { QuestionItem } from '@/types/screen';

interface S3RecorderProps {
  onComplete: (blob: Blob) => void;
  onResetAll: () => void;
  /**
   * 녹음할 문항. 없으면 일반 감정 문항(기본 set-b, NEXT_PUBLIC_QUESTION_SET=set-a면 set-a).
   * 경상 정밀 감정은 set-gs 문항을 넘긴다. 문항 수만큼 문항당 10초씩 녹음한다.
   */
  questions?: readonly QuestionItem[];
}

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
];

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

export default function S3Recorder({ onComplete, onResetAll, questions = GENERAL_QUESTIONS }: S3RecorderProps) {
  const [currentIdx, setCurrentIdx] = useState(0); // 화면에 보이는 문항: 0부터 문항 수 - 1
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
  /** 문항 카드(왼쪽 열). 새 문항이 나오면 화면에 보이게 올린다. */
  const questionCardRef = useRef<HTMLDivElement | null>(null);

  const lastQuestionIdx = questions.length - 1;
  const currentQuestion: QuestionItem = questions[currentIdx];
  const kind = questionKind(currentQuestion);
  /** 바꿔 말하기 문항이 섞인 세트(set-b)면 문항 종류에 맞는 안내를 보여 준다. 상황극만 있는 세트는 지금 그대로다. */
  const mixedKinds = hasConvertQuestions(questions);
  /** 바꿔 말하기 문항 바로 다음의 상황극 문항(set-b의 5번). 형식이 바뀐다는 점을 눈에 띄게 알린다. */
  const formatChanged =
    mixedKinds && kind === 'question' && currentIdx > 0 && questionKind(questions[currentIdx - 1]) === 'convert';

  /**
   * 바꿔 말하기 문항이 섞인 세트는 문항마다 안내와 바꿔 말할 문장을 읽어야 한다. 휴대폰에서는 앞 화면이나 버튼을 누른
   * 자리의 스크롤이 남아 문항 카드 윗부분(형식 전환 안내 포함)이 머리글 밑에 가리므로, 새 문항이 나오면 카드를 올린다.
   * 상황극만 있는 세트(set-a, 경상 정밀 감정)는 지금 동작 그대로 둔다.
   */
  useEffect(() => {
    if (!mixedKinds) return;
    questionCardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [currentIdx, mixedKinds]);

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
    if (finishedIdx < lastQuestionIdx) {
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
  }, [clearTimer, stopVolumeVisualizer, lastQuestionIdx]);

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

  const isLastQuestion = currentIdx === lastQuestionIdx;
  const timerHint =
    phase === 'recording'
      ? isLastQuestion
        ? `${secLeft}초 후 자동으로 제출`
        : `${secLeft}초 후 자동으로 다음 문항 이동`
      : phase === 'ready' || phase === 'paused'
        ? '문항을 읽고 녹음 시작을 눌러 주십시오'
        : '녹음 종료';

  const target = currentQuestion.target;
  const timerText = `00:${secLeft < 10 ? `0${secLeft}` : secLeft}`;

  /*
   * 배치: 휴대폰(한 열)은 안내 → 바꿔 말할 문장 → 타이머와 녹음 시작 버튼 → 주의 문구 순서다.
   * 안내, 문장, 시작 버튼이 스크롤 없이 한 화면(375×667 이상)에 들어오도록 휴대폰에서는 여백과 파형을 줄인다.
   * 넓은 화면(lg)은 왼쪽에 문항 카드와 주의 문구, 오른쪽에 파형·타이머·버튼을 둔다.
   * 휴대폰은 flex로 쌓는다. 전역 CSS의 '.screen-glass > .grid { gap: 24px }'를 피해 간격을 줄이기 위해서다.
   */
  return (
    <div className="screen-glass p-4 sm:p-7 lg:p-10">
      <div className="flex flex-col gap-3 sm:gap-6 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:gap-6">

        {/* 문항 카드 (scroll-mt: 고정 머리글 높이만큼 띄운다) */}
        <section
          ref={questionCardRef}
          aria-label={`문항 ${currentIdx + 1}`}
          className="scroll-mt-[136px] rounded-3xl border border-zinc-800/80 bg-zinc-900/70 px-4 py-3.5 shadow-2xl backdrop-blur-xl sm:p-6 lg:col-span-6 lg:col-start-1 lg:row-start-1 lg:p-8"
        >
          {/* 문항 번호, 종류, 처음부터 다시 */}
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="record-question-index">
                문항 {currentIdx + 1} / {questions.length}
              </span>
              <span className="text-sm font-medium text-zinc-300">
                {kind === 'convert' ? '바꿔 말하기' : '상황극 녹음'}
              </span>
            </div>

            <button
              onClick={handleReset}
              className="rounded-full border border-zinc-700/60 bg-zinc-800/60 px-3 py-1 text-xs font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
            >
              처음부터 다시
            </button>
          </div>

          <div className="mt-3 break-keep sm:mt-4">
            {kind === 'convert' ? (
              <>
                {/* ① 안내: 먼저 읽도록 위에 크게 둔다 */}
                <p className="text-lg font-bold leading-snug text-white">
                  아래 문장을 {target}에게 말하듯 평소 말투로 바꿔 말해 주십시오.
                </p>
                <p className="mt-1 text-base font-medium text-zinc-300">글자 그대로 읽지 않으셔도 됩니다.</p>

                {/* ② 바꿔 말할 문장: 배경과 테두리로 구분한 인용 상자 */}
                <figure className="mt-3 rounded-2xl border border-[#416785] bg-black/40 px-4 py-2.5 sm:py-3">
                  <figcaption className="text-xs font-semibold text-[#9bbbd5]">바꿔 말할 문장</figcaption>
                  <blockquote className="recording-prompt mt-1 text-balance text-xl font-bold leading-snug text-white">
                    &ldquo;{currentQuestion.situation}&rdquo;
                  </blockquote>
                </figure>
              </>
            ) : (
              <>
                {/* 형식 전환: 바꿔 말하기가 끝나고 상황극이 시작될 때 */}
                {formatChanged ? (
                  <div role="status" className="rounded-2xl border border-[#416785] bg-[#202f3b] px-4 py-2.5 sm:py-3">
                    <p className="text-xs font-semibold text-[#9bbbd5]">형식이 바뀝니다 · 바꿔 말하기는 끝났습니다</p>
                    <p className="mt-1 text-lg font-bold leading-snug text-white">이번에는 상황에 맞게 자유롭게 말해 주십시오.</p>
                  </div>
                ) : (
                  mixedKinds && (
                    <p className="text-lg font-bold leading-snug text-white">이번에는 상황에 맞게 자유롭게 말해 주십시오.</p>
                  )
                )}
                {/*
                  바꿔 말하기가 섞인 세트(set-b)는 상황 문장에 대화 상대가 나오므로 '대화 상대' 줄을 빼서
                  휴대폰 한 화면에 안내, 상황 문장, 시작 버튼이 함께 들어오게 한다. 상황극만 있는 세트는 그대로 둔다.
                */}
                {!mixedKinds && (
                  <p className="record-target">
                    대화 상대 <strong>{target}</strong>
                  </p>
                )}
                {/* 상황 문장이 곧 안내다 */}
                <h3
                  className={`recording-prompt text-xl font-bold leading-snug tracking-tight text-white ${mixedKinds ? 'mt-3' : 'mt-1.5'}`}
                >
                  {currentQuestion.situation}
                </h3>
              </>
            )}
          </div>
        </section>

        {/* 녹음 패널: 파형, 타이머, 버튼 */}
        <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-xl sm:gap-6 sm:p-6 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:justify-between lg:p-8">
          <div>
            <div className="rounded-2xl border border-zinc-800/80 bg-black/60 px-4 py-2.5 shadow-inner lg:rounded-3xl lg:p-8">
              {/* 휴대폰: 파형과 타이머를 한 줄에 / 넓은 화면: 파형 아래에 타이머 */}
              <div className="flex items-center justify-between gap-3 lg:flex-col lg:justify-center lg:gap-0">
                <div className="flex h-6 items-center gap-1 lg:h-20 lg:justify-center lg:gap-2" aria-hidden="true">
                  {[...Array(16)].map((_, i) => {
                    const active = phase === 'recording';
                    const height = active ? Math.max(15, Math.min(100, audioLevel * (0.8 + (i % 4) * 0.25))) : 12;
                    return (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-75 lg:w-1.5 ${
                          active ? 'bg-gradient-to-t from-indigo-500 via-purple-400 to-pink-400 shadow-sm shadow-indigo-500/40' : 'bg-zinc-800'
                        }`}
                        style={{ height: `${height}%` }}
                      />
                    );
                  })}
                </div>

                {/* 남은 시간 */}
                <div className="shrink-0 text-right lg:mt-6 lg:text-center">
                  <div className="font-mono text-[26px] font-black leading-tight tracking-widest text-white lg:text-[36px]">
                    {timerText}
                  </div>
                  <div className="mt-1 hidden text-[11px] font-medium text-zinc-500 lg:block">{timerHint}</div>
                </div>
              </div>

              {/* 진행 막대 */}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800 lg:mx-auto lg:mt-5 lg:max-w-xs">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${secLeft <= 3 ? 'bg-red-500' : 'bg-white'}`}
                  style={{ width: `${(secLeft / SECONDS_PER_QUESTION) * 100}%` }}
                />
              </div>
              {/* 휴대폰에서는 안내를 진행 막대 아래 한 줄에 둔다 */}
              <div className="mt-1.5 text-[11px] font-medium text-zinc-500 lg:hidden">{timerHint}</div>
            </div>

            {errorMessage && (
              <div className="mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-sm text-red-300">
                <p className="font-semibold">{errorMessage}</p>
              </div>
            )}
          </div>

          {/* 버튼: 녹음 시작을 눌러야 타이머가 흐른다 */}
          <div className="space-y-3">
            {(phase === 'ready' || phase === 'paused') && (
              <button
                onClick={phase === 'ready' ? handleStartFirstRecording : handleStartNextQuestion}
                className="record-start-button flex w-full items-center justify-center rounded-full bg-white py-3.5 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98] sm:py-4"
              >
                <span>녹음 시작</span>
              </button>
            )}

            {phase === 'recording' && (
              <button
                onClick={() => {
                  if (!isDoubleTap()) finishQuestion();
                }}
                aria-live="polite"
                aria-label={isLastQuestion ? '녹음 중. 누르면 녹음을 완료하고 제출합니다.' : '녹음 중. 누르면 다음 문항으로 이동합니다.'}
                className="recording-live-button flex w-full flex-col items-center justify-center gap-0.5 rounded-xl py-3 text-sm font-semibold text-white"
              >
                <span className="recording-live-label">녹음 중</span>
              </button>
            )}

            {phase === 'processing' && (
              <div className="flex items-center justify-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 py-4 text-sm font-medium text-zinc-300">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>음성 데이터 처리 중...</span>
              </div>
            )}

            <button
              onClick={onResetAll}
              className="secondary-action-button w-full text-center text-zinc-300 transition"
            >
              첫 화면으로 나가기
            </button>
          </div>
        </div>

        {/* 주의 문구: 휴대폰에서는 버튼 아래, 넓은 화면에서는 왼쪽 문항 카드 아래 */}
        <p className="break-keep rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm font-medium leading-relaxed text-amber-300/90 lg:col-span-6 lg:col-start-1 lg:row-start-2 lg:self-start">
          ※ 설명하지 마시고, 실제로 그 사람에게 말하듯이 답변해 주십시오.
        </p>

      </div>
    </div>
  );
}
