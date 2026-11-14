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

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined') {
      const found = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      setSupportedMime(found);
    }
    return () => {
      cleanupAudio();
    };
  }, []);

  const cleanupAudio = () => {
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
  };

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

  const stopVolumeVisualizer = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

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
  }, []);

  const handlePauseSegment = (finishedIdx: number) => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
    }
    stopVolumeVisualizer();
    setPhase('paused');
  };

  const handleFinalStop = () => {
    clearTimer();
    stopVolumeVisualizer();
    setPhase('processing');
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

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
    <div className="flex flex-col gap-6 p-5 sm:p-7">
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        {/* Dynamic Island Style Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 items-center rounded-full bg-zinc-800 px-2.5 text-[11px] font-bold text-zinc-300">
              {currentIdx + 1} / {QUESTIONS.length}
            </span>
            <span className="text-xs font-semibold text-zinc-400">
              상황극 질문
            </span>
          </div>

          <button
            onClick={handleReset}
            className="rounded-full border border-zinc-700/60 bg-zinc-800/60 px-3 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-zinc-700 hover:text-white"
          >
            처음부터 다시
          </button>
        </div>

        {/* Question Card */}
        <div className="mt-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
            <span>대화 상대:</span>
            <span className="font-bold text-white">{currentQuestion.target}</span>
          </div>

          <h3 className="mt-3 text-lg font-bold leading-snug tracking-tight text-white sm:text-xl">
            {currentQuestion.situation}
          </h3>

          {currentQuestion.hint && (
            <p className="mt-2 text-xs text-zinc-400">
              💡 {currentQuestion.hint}
            </p>
          )}
        </div>

        {/* Live Audio Visualizer / Waveform Display */}
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-zinc-800/80 bg-black/50 p-6">
          <div className="flex h-12 items-center justify-center gap-1.5">
            {[...Array(12)].map((_, i) => {
              const active = phase === 'recording';
              const height = active ? Math.max(15, Math.min(100, audioLevel * (1 + (i % 3) * 0.3))) : 15;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    active ? 'bg-gradient-to-t from-indigo-500 to-purple-400' : 'bg-zinc-700'
                  }`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>

          {/* Timer Display */}
          <div className="mt-4 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${phase === 'recording' ? 'bg-red-500 animate-ping' : 'bg-zinc-600'}`} />
            <span className="font-mono text-xl font-black tracking-wider text-white">
              00:{secLeft < 10 ? `0${secLeft}` : secLeft}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full transition-all duration-300 ${secLeft <= 3 ? 'bg-red-500' : 'bg-white'}`}
              style={{ width: `${(secLeft / 10) * 100}%` }}
            />
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-zinc-400">
          ※ 설명하지 말고, 실제로 그 사람에게 말하듯이 답해 주십시오.
        </p>

        {errorMessage && (
          <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300">
            <p className="font-semibold">⚠️ {errorMessage}</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        {phase === 'ready' && (
          <button
            onClick={handleStartFirstRecording}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-lg shadow-white/10 transition hover:bg-zinc-200 active:scale-95"
          >
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-500" />
            <span>문항 1 녹음 시작 (10초)</span>
          </button>
        )}

        {phase === 'recording' && (
          <div className="flex gap-3">
            <button
              onClick={() => handlePauseSegment(currentIdx)}
              className="flex-1 rounded-full border border-zinc-700/60 bg-zinc-800/80 py-3.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700 active:scale-95"
            >
              일시정지
            </button>
            <button
              onClick={() => {
                if (currentIdx < 3) handlePauseSegment(currentIdx);
                else handleFinalStop();
              }}
              className="flex-1 rounded-full bg-white py-3.5 text-xs font-bold text-black shadow-md transition hover:bg-zinc-200 active:scale-95"
            >
              {currentIdx < 3 ? '다음 문항으로' : '녹음 완료 및 심사 제출'}
            </button>
          </div>
        )}

        {phase === 'paused' && (
          <button
            onClick={handleResumeNext}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-90 active:scale-95"
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
      </div>

      <div className="text-center">
        <button
          onClick={onResetAll}
          className="text-xs text-zinc-400 transition hover:text-zinc-200"
        >
          첫 화면으로 나가기
        </button>
      </div>
    </div>
  );
}
