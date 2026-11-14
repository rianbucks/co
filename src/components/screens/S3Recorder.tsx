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
  const [currentIdx, setCurrentIdx] = useState(0); // 0, 1, 2, 3 (문항 1~4)
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

  // 브라우저 지원 MIME 감지
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

  // 음량 게이지 시각화 루프
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
      console.warn('AudioContext 시각화 미지원 환경:', e);
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

  // 10초 타이머 시작
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

  // 문항 간 일시정지
  const handlePauseSegment = (finishedIdx: number) => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
    }
    stopVolumeVisualizer();
    setPhase('paused');
    console.log(`[원산지증명서] 문항 ${finishedIdx + 1} 구술 완료 -> pause() 호출됨`);
  };

  // 마지막 문항 종료
  const handleFinalStop = () => {
    clearTimer();
    stopVolumeVisualizer();
    setPhase('processing');
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  // 첫 문항 녹음 시작
  const handleStartFirstRecording = async () => {
    try {
      setErrorMessage('');
      chunksRef.current = [];
      setCurrentIdx(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const options: MediaRecorderOptions = { audioBitsPerSecond: 48000 };
      if (supportedMime) {
        options.mimeType = supportedMime;
      }

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
        console.log(`[원산지증명서] 4문항 녹음 완료 | 타입: ${blob.type} | 크기: ${(blob.size / 1024).toFixed(1)} KB`);

        // 스트림 해제
        stream.getTracks().forEach((track) => track.stop());

        // 2MB 초과 검사
        if (blob.size > 2 * 1024 * 1024) {
          setPhase('error');
          setErrorMessage('녹음 파일 용량이 2MB를 초과하여 접수할 수 없습니다.');
          return;
        }

        // S4 심사 화면으로 전환 및 Blob 전달
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

  // 다음 문항 이어 녹음 (resume)
  const handleResumeNext = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;

    const nextIdx = currentIdx + 1;
    setCurrentIdx(nextIdx);

    recorder.resume();
    setPhase('recording');
    console.log(`[원산지증명서] 문항 ${nextIdx + 1} 구술 재개 -> resume() 호출됨`);

    if (streamRef.current) {
      startVolumeVisualizer(streamRef.current);
    }
    startCountdown(nextIdx);
  };

  // 처음부터 다시 하기
  const handleReset = () => {
    cleanupAudio();
    chunksRef.current = [];
    setCurrentIdx(0);
    setPhase('ready');
    setSecLeft(10);
    setErrorMessage('');
  };

  return (
    <div className="flex flex-col gap-4 p-4 text-stone-900">
      {/* 상단 진행 상태 카드 */}
      <div className="border border-stone-400 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-stone-300 pb-2">
          <div>
            <span className="text-[11px] font-semibold text-stone-600">구술 심사 단계 (S3)</span>
            <h2 className="text-base font-bold text-stone-900">
              구술 녹음실 [문항 {currentIdx + 1} / {QUESTIONS.length}]
            </h2>
          </div>
          <button
            onClick={handleReset}
            className="rounded border border-stone-300 bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200"
          >
            처음부터 다시
          </button>
        </div>

        {/* 10초 타이머 및 프로그레스 바 */}
        <div className="mt-3">
          <div className="flex justify-between text-xs font-medium text-stone-600">
            <span>문항 구술 제한 시간</span>
            <span className="font-mono font-bold text-stone-900">
              {secLeft > 0 ? `${secLeft}초 남음` : '시간 종료'}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className={`h-full transition-all duration-300 ${
                secLeft <= 3 ? 'bg-red-600' : 'bg-stone-800'
              }`}
              style={{ width: `${(secLeft / 10) * 100}%` }}
            />
          </div>
        </div>

        {/* 고정 지침 문구 (명세 8장) */}
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-center text-xs font-semibold text-amber-900">
          ※ 설명하지 말고, 실제로 그 사람에게 말하듯이 답해 주십시오.
        </div>

        {/* 문항 카드 */}
        <div className="mt-3 rounded border border-stone-300 bg-stone-50 p-3.5">
          <div className="inline-block rounded bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-700">
            상황극 대상: {currentQuestion.target}
          </div>
          <p className="mt-2 text-sm font-bold leading-relaxed text-stone-900">
            {currentQuestion.situation}
          </p>
          {currentQuestion.hint && (
            <p className="mt-2 text-[11px] text-stone-500">
              {currentQuestion.hint}
            </p>
          )}
        </div>

        {/* 음량 피드백 (녹음 중일 때) */}
        {phase === 'recording' && (
          <div className="mt-3 rounded border border-stone-200 bg-white p-2.5">
            <div className="flex items-center justify-between text-[11px] text-stone-600">
              <span className="flex items-center gap-1 font-semibold text-red-600">
                <span className="inline-block h-2 w-2 animate-ping rounded-full bg-red-600" />
                녹음 진행 중 (ON AIR)
              </span>
              <span>입력 감도</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full bg-emerald-500 transition-all duration-75"
                style={{ width: `${Math.max(8, audioLevel)}%` }}
              />
            </div>
          </div>
        )}

        {/* 에러 상태 안내 */}
        {errorMessage && (
          <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <p className="font-bold">⚠️ 감정 반려 또는 오류 발생</p>
            <p className="mt-1">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* 조작 버튼 영역 */}
      <div className="flex flex-col gap-2">
        {phase === 'ready' && (
          <button
            onClick={handleStartFirstRecording}
            className="w-full rounded bg-stone-900 py-3.5 text-sm font-bold tracking-wide text-white shadow-xs transition hover:bg-stone-800 active:scale-[0.99]"
          >
            문항 1 구술 녹음 시작 (10초)
          </button>
        )}

        {phase === 'recording' && (
          <div className="flex gap-2">
            <button
              onClick={() => handlePauseSegment(currentIdx)}
              className="flex-1 rounded border border-stone-400 bg-stone-200 py-3 text-xs font-bold text-stone-800 hover:bg-stone-300"
            >
              수동 일시정지
            </button>
            <button
              onClick={() => {
                if (currentIdx < 3) handlePauseSegment(currentIdx);
                else handleFinalStop();
              }}
              className="flex-1 rounded bg-stone-900 py-3 text-xs font-bold text-white hover:bg-stone-800"
            >
              {currentIdx < 3 ? '다음 문항으로 넘어가기' : '구술 완료 및 최종 제출'}
            </button>
          </div>
        )}

        {phase === 'paused' && (
          <button
            onClick={handleResumeNext}
            className="w-full rounded bg-blue-800 py-3.5 text-sm font-bold text-white shadow-xs transition hover:bg-blue-700 active:scale-[0.99]"
          >
            문항 {currentIdx + 2} 이어 녹음하기 (클릭 시 즉시 시작)
          </button>
        )}

        {phase === 'processing' && (
          <div className="flex flex-col items-center justify-center gap-2 rounded border border-stone-300 bg-stone-100 py-4 text-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
            <div className="text-xs font-bold text-stone-800">
              녹음 데이터 취합 중...
            </div>
          </div>
        )}
      </div>

      <div className="text-center">
        <button
          onClick={onResetAll}
          className="text-[11px] text-stone-500 underline hover:text-stone-800"
        >
          첫 화면으로 돌아가기
        </button>
      </div>
    </div>
  );
}
