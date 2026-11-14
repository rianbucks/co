'use client';

import { useState, useRef, useEffect } from 'react';

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/aac',
];

export default function RecordingTestPage() {
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'done'>('idle');
  const [supportedMime, setSupportedMime] = useState('');
  const [segment, setSegment] = useState(1);
  const [secLeft, setSecLeft] = useState(10);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined') {
      const found = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      setSupportedMime(found);
      setLogs([`[${new Date().toLocaleTimeString()}] 감지된 기본 mimeType: ${found || '기본값(미지정)'}`]);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopRecording = () => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const pauseRecording = (finishedSeg: number) => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    clearTimer();
    recorder.pause();
    setStatus('paused');
    addLog(`문항 ${finishedSeg} 종료 -> pause() 호출됨 (state: ${recorder.state})`);
  };

  const startSegmentTimer = (currentSeg: number) => {
    clearTimer();
    setSecLeft(10);
    timerRef.current = setInterval(() => {
      setTotalElapsed((prev) => prev + 1);
      setSecLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          if (currentSeg < 4) pauseRecording(currentSeg);
          else stopRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      setAudioUrl(null);
      setAudioBlob(null);
      setTotalElapsed(0);
      setSegment(1);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const options: MediaRecorderOptions = { audioBitsPerSecond: 48000 };
      if (supportedMime) options.mimeType = supportedMime;

      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const finalType = recorder.mimeType || supportedMime || 'audio/mp4';
        const blob = new Blob(chunksRef.current, { type: finalType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setStatus('done');
        addLog(`녹음 완료 | 실제 type: ${blob.type} | 크기: ${(blob.size / 1024).toFixed(1)} KB`);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      setStatus('recording');
      addLog(`문항 1 녹음 시작 (실제 recorder.mimeType: ${recorder.mimeType})`);
      startSegmentTimer(1);
    } catch (err) {
      addLog(`오류 발생: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const resumeNextSegment = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    const nextSeg = segment + 1;
    setSegment(nextSeg);
    recorder.resume();
    setStatus('recording');
    addLog(`문항 ${nextSeg} 이어 녹음 -> resume() 호출됨 (state: ${recorder.state})`);
    startSegmentTimer(nextSeg);
  };

  const handleShareOrDownload = async () => {
    if (!audioBlob) return;
    const ext = audioBlob.type.includes('webm') ? 'webm' : 'm4a';
    const fileName = `dialect-test-${Date.now()}.${ext}`;
    const file = new File([audioBlob], fileName, { type: audioBlob.type });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '실기기 녹음 테스트 파일' });
        return;
      } catch {
        // 공유 취소 시 다운로드로 대체
      }
    }
    if (audioUrl) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = fileName;
      a.click();
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-[430px] bg-slate-50 p-5 text-slate-900">
      <h1 className="border-b border-slate-300 pb-3 text-lg font-bold">[작업 1] 실기기 음성 채취 기술 검증</h1>
      <div className="mt-4 space-y-2 rounded border border-slate-300 bg-white p-4 text-sm">
        <div><span className="font-semibold">브라우저 지원 형식:</span> <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{supportedMime || '없음'}</code></div>
        <div><span className="font-semibold">현재 상태:</span> {status.toUpperCase()} (문항 {segment}/4)</div>
        <div><span className="font-semibold">문항 남은 시간:</span> {secLeft}초 / 누적 {totalElapsed}초</div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {(status === 'idle' || status === 'done') && (
          <button onClick={startRecording} className="w-full rounded bg-slate-900 py-3 font-semibold text-white">4문항 연속 녹음 시작 (10초 × 4회)</button>
        )}
        {status === 'recording' && (
          <div className="flex gap-2">
            <button onClick={() => pauseRecording(segment)} className="flex-1 rounded bg-amber-600 py-3 font-semibold text-white">수동 일시정지</button>
            <button onClick={stopRecording} className="flex-1 rounded bg-red-600 py-3 font-semibold text-white">즉시 종료</button>
          </div>
        )}
        {status === 'paused' && (
          <button onClick={resumeNextSegment} className="w-full rounded bg-blue-700 py-3 font-semibold text-white">다음 문항 이어 녹음 (문항 {segment + 1}/4)</button>
        )}
      </div>

      {audioBlob && audioUrl && (
        <div className="mt-5 space-y-3 rounded border border-slate-400 bg-white p-4">
          <div className="text-sm font-bold">검증 결과 요약</div>
          <ul className="space-y-1 text-xs text-slate-700">
            <li>• 최종 형식: <b>{audioBlob.type}</b></li>
            <li>• 최종 크기: <b>{(audioBlob.size / 1024).toFixed(1)} KB</b> ({audioBlob.size <= 2 * 1024 * 1024 ? '2MB 이하 통과' : '2MB 초과'})</li>
          </ul>
          <audio controls src={audioUrl} className="w-full" />
          <button onClick={handleShareOrDownload} className="w-full rounded border border-slate-800 bg-slate-100 py-2.5 text-sm font-semibold">녹음 파일 저장 / 카톡으로 A에게 전송</button>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-1 text-xs font-semibold text-slate-600">실행 로그</div>
        <div className="h-44 space-y-1 overflow-y-auto rounded bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
          {logs.map((l, idx) => <div key={idx}>{l}</div>)}
        </div>
      </div>
    </main>
  );
}
