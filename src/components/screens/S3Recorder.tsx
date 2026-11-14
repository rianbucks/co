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

type RecordingPhase = 'ready' | 'recording' | 'paused' | 'processing' | 'error';

export default function S3Recorder({ onComplete, onResetAll }: S3RecorderProps) {
  const [currentIdx, setCurrentIdx] = useState(0); // 0, 1, 2, 3
  const [phase, setPhase] = useState<RecordingPhase>('ready');
  const [secLeft, setSecLeft] = useState(10);
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

  const currentQuestion: QuestionItem = QUESTIONS[currentIdx];

  const cleanupAudio = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {}
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
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

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

  const handlePauseSegment = useCallback((finishedIdx: number) => {
    setCurrentIdx(finishedIdx);
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
    }
    stopVolumeVisualizer();
    setPhase('paused');
  }, [stopVolumeVisualizer]);

  const handleFinalStop = useCallback(() => {
    clearTimer();
    stopVolumeVisualizer();
    setPhase('processing');
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  }, [clearTimer, stopVolumeVisualizer]);

  const startCountdown = useCallback((questionIdx: number) => {
    clearTimer();
    setSecLeft(10);

    timerRef.current = setInterval(() => {
      setSecLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          if (questionIdx < 3) {
            handlePauseSegment(questionIdx);
          } else {
            handleFinalStop();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearTimer, handleFinalStop, handlePauseSegment]);

  const handleStartFirstRecording = async () => {
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
    }
  };

  const handleResumeNext = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;

    const nextIdx = currentIdx + 1;
    setCurrentIdx(nextIdx);

    recorder.resume();
    setPhase('recording');

    if (streamRef.current) {
      startVolumeVisualizer(streamRef.current);
    }
    startCountdown(nextIdx);
  };

  const handleReset = () => {
    cleanupAudio();
    chunksRef.current = [];
    setCurrentIdx(0);
    setPhase('ready');
    setSecLeft(10);
    setErrorMessage('');
  };

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

              {currentQuestion.hint && (
                <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-xs text-zinc-400">
                  <span className="font-semibold text-zinc-300">💡 힌트 예시:</span> {currentQuestion.hint}
                </div>
              )}
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
                {phase === 'recording' ? 'ON AIR (녹음 중)' : phase === 'paused' ? '일시정지 상태' : '녹음 대기'}
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
                  {secLeft > 0 ? `${secLeft}초 후 자동으로 다음 문항 이동` : '시간 종료'}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${secLeft <= 3 ? 'bg-red-500' : 'bg-white'}`}
                  style={{ width: `${(secLeft / 10) * 100}%` }}
                />
              </div>
            </div>

            {errorMessage && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300">
                <p className="font-semibold">⚠️ {errorMessage}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {phase === 'ready' && (
              <button
                onClick={handleStartFirstRecording}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98]"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span>문항 1 녹음 시작 (10초)</span>
              </button>
            )}

            {phase === 'recording' && (
              <div className="flex gap-3">
                <button
                  onClick={() => handlePauseSegment(currentIdx)}
                  className="flex-1 rounded-full border border-zinc-700/60 bg-zinc-800/80 py-4 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 active:scale-95"
                >
                  수동 일시정지
                </button>
                <button
                  onClick={() => {
                    if (currentIdx < 3) handlePauseSegment(currentIdx);
                    else handleFinalStop();
                  }}
                  className="flex-1 rounded-full bg-white py-4 text-xs font-bold text-black shadow-md transition hover:bg-zinc-200 active:scale-95"
                >
                  {currentIdx < 3 ? '다음 문항으로' : '녹음 완료 및 최종 제출'}
                </button>
              </div>
            )}

            {phase === 'paused' && (
              <button
                onClick={handleResumeNext}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-500/20 transition hover:opacity-90 active:scale-[0.98]"
              >
                <span>문항 {currentIdx + 2} 이어 녹음하기</span>
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
