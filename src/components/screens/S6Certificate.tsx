'use client';

import { useState } from 'react';
import type { JudgeResult } from '@/lib/judge/contract';
import { REGION_KOREAN_NAMES } from '@/types/screen';

interface S6CertificateProps {
  result: JudgeResult;
  onBack: () => void;
  onResetAll: () => void;
}

const REGION_ORDER = [
  'seoul_gyeonggi',
  'gangwon',
  'chungcheong',
  'gyeongsang',
  'jeolla',
  'jeju',
] as const;

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const character of text) {
    if (line && context.measureText(line + character).width > maxWidth) {
      lines.push(line);
      line = character;
    } else {
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function renderCertificate(result: JudgeResult): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const width = 1200;
    const height = 1600;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('이미지를 만들 수 없습니다.'));
      return;
    }

    const ink = '#17243a';
    const muted = '#67748a';
    const accent = '#315b83';
    const paper = '#fbfaf6';
    const formattedDate = new Date(result.issuedAt).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    context.fillStyle = '#e7ebef';
    context.fillRect(0, 0, width, height);
    context.fillStyle = paper;
    context.fillRect(42, 42, width - 84, height - 84);

    // 공문서의 이중 테두리와 상단 발급 기관 표시.
    context.strokeStyle = '#263d57';
    context.lineWidth = 4;
    context.strokeRect(70, 70, width - 140, height - 140);
    context.strokeStyle = '#b7c2ce';
    context.lineWidth = 1.5;
    context.strokeRect(86, 86, width - 172, height - 172);

    context.textAlign = 'center';
    context.fillStyle = accent;
    context.font = '600 27px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('원산지증명서 · 사투리 감정 결과', width / 2, 155);
    context.fillStyle = ink;
    context.font = '700 59px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('음성 감정서', width / 2, 245);
    context.fillStyle = muted;
    context.font = '24px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('VOICE DIALECT ANALYSIS CERTIFICATE', width / 2, 292);

    context.strokeStyle = '#cbd3dc';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(150, 330);
    context.lineTo(1050, 330);
    context.stroke();

    context.textAlign = 'left';
    context.fillStyle = muted;
    context.font = '22px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('문서번호', 150, 385);
    context.fillText('발급일', 720, 385);
    context.fillStyle = ink;
    context.font = '600 25px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText(result.certificateNo, 150, 427);
    context.fillText(formattedDate, 720, 427);

    // 판정 결과를 감정서 중앙에 가장 크게 배치한다.
    context.fillStyle = '#eef2f6';
    context.beginPath();
    context.roundRect(150, 485, 900, 300, 18);
    context.fill();
    context.textAlign = 'center';
    context.fillStyle = muted;
    context.font = '600 22px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('판정 지역', width / 2, 545);
    context.fillStyle = accent;
    context.font = '700 53px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText(result.region.mixed ? '혼합 방언' : result.region.label, width / 2, 620);
    context.fillStyle = ink;
    context.font = '600 27px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText(`${result.intensity.grade}등급 · ${result.intensity.gradeName}`, width / 2, 680);
    context.font = '700 29px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText(`사투리 농도  ${result.intensity.score} / 100점`, width / 2, 735);

    context.textAlign = 'left';
    context.fillStyle = ink;
    context.font = '700 25px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('권역별 판정 확률', 150, 855);
    REGION_ORDER.forEach((region, index) => {
      const y = 910 + index * 47;
      const score = result.region.probabilities[region];
      context.fillStyle = muted;
      context.font = '22px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
      context.fillText(REGION_KOREAN_NAMES[region], 150, y);
      context.fillStyle = '#e2e7ec';
      context.beginPath();
      context.roundRect(330, y - 19, 580, 15, 8);
      context.fill();
      context.fillStyle = region === result.region.top ? accent : '#8593a3';
      context.beginPath();
      context.roundRect(330, y - 19, 580 * (score / 100), 15, 8);
      context.fill();
      context.textAlign = 'right';
      context.fillStyle = ink;
      context.fillText(`${score}%`, 1045, y);
      context.textAlign = 'left';
    });

    const opinionTop = 1240;
    context.strokeStyle = '#cbd3dc';
    context.beginPath();
    context.moveTo(150, opinionTop - 35);
    context.lineTo(1050, opinionTop - 35);
    context.stroke();
    context.fillStyle = ink;
    context.font = '700 25px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('감정관 종합 소견', 150, opinionTop + 8);
    context.fillStyle = '#3d4b5e';
    context.font = '24px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    wrapText(context, result.opinion, 650).slice(0, 3).forEach((line, index) => {
      context.fillText(line, 150, opinionTop + 58 + index * 39);
    });

    // 직인과 발급 문구.
    context.strokeStyle = '#9b4e4e';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(925, 1395, 70, 0, Math.PI * 2);
    context.stroke();
    context.textAlign = 'center';
    context.fillStyle = '#9b4e4e';
    context.font = '700 20px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('C/O', 925, 1388);
    context.font = '600 15px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('감정 확인', 925, 1418);
    context.textAlign = 'left';
    context.fillStyle = muted;
    context.font = '20px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
    context.fillText('본 감정서는 음성 분석 결과를 기록한 문서입니다.', 150, 1430);

    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG 파일을 만들지 못했습니다.'));
    }, 'image/png');
  });
}

function downloadBlob(blob: Blob, certificateNo: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${certificateNo}-감정서.png`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function S6Certificate({ result, onBack, onResetAll }: S6CertificateProps) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const makePng = async () => {
    setBusy(true);
    setMessage('');
    try {
      return await renderCertificate(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '감정서 이미지 생성에 실패했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    const blob = await makePng();
    if (blob) downloadBlob(blob, result.certificateNo);
  };

  const handleShare = async () => {
    const blob = await makePng();
    if (!blob) return;
    const file = new File([blob], `${result.certificateNo}-감정서.png`, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '원산지증명서 감정서' });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        downloadBlob(blob, result.certificateNo);
        setMessage('공유를 사용할 수 없어 감정서를 이미지로 저장했습니다.');
      }
    } else {
      downloadBlob(blob, result.certificateNo);
      setMessage('이 기기에서는 공유를 지원하지 않아 감정서를 이미지로 저장했습니다.');
    }
  };

  return (
    <section className="p-5 sm:p-7 lg:p-10" aria-labelledby="certificate-title">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <button onClick={onBack} className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800">
            ← 결과로
          </button>
          <span className="text-xs font-medium text-zinc-500">S6 · 감정서 발급</span>
        </div>

        <article className="relative overflow-hidden rounded-[2rem] border border-slate-300 bg-[#fbfaf6] px-6 py-8 text-[#17243a] shadow-2xl sm:px-12 sm:py-12">
          <div className="pointer-events-none absolute inset-3 rounded-[1.5rem] border border-slate-300" />
          <div className="pointer-events-none absolute inset-4 rounded-[1.4rem] border border-slate-200" />
          <div className="relative text-center">
            <p className="text-xs font-semibold tracking-wide text-[#315b83] sm:text-sm">원산지증명서 · 사투리 감정 결과</p>
            <h1 id="certificate-title" className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">음성 감정서</h1>
            <p className="mt-2 text-[10px] tracking-[0.18em] text-slate-500 sm:text-xs">VOICE DIALECT ANALYSIS CERTIFICATE</p>
          </div>

          <div className="relative mt-7 grid grid-cols-2 gap-3 border-y border-slate-300 py-4 text-xs sm:mt-9 sm:text-sm">
            <div><p className="text-slate-500">문서번호</p><p className="mt-1 font-semibold">{result.certificateNo}</p></div>
            <div className="text-right"><p className="text-slate-500">발급일</p><p className="mt-1 font-semibold">{new Date(result.issuedAt).toLocaleDateString('ko-KR')}</p></div>
          </div>

          <div className="relative mt-6 rounded-2xl bg-[#eef2f6] px-4 py-7 text-center sm:mt-8 sm:py-9">
            <p className="text-xs font-semibold text-slate-500 sm:text-sm">판정 지역</p>
            <p className="mt-2 text-2xl font-black text-[#315b83] sm:text-4xl">{result.region.mixed ? '혼합 방언' : result.region.label}</p>
            <p className="mt-3 text-sm font-bold sm:text-base">{result.intensity.grade}등급 · {result.intensity.gradeName}</p>
            <p className="mt-2 text-sm font-bold sm:text-lg">사투리 농도 {result.intensity.score} / 100점</p>
          </div>

          <div className="relative mt-7 sm:mt-9">
            <h2 className="text-sm font-bold sm:text-base">권역별 판정 확률</h2>
            <div className="mt-4 space-y-3">
              {REGION_ORDER.map((region) => {
                const score = result.region.probabilities[region];
                const top = result.region.top === region;
                return (
                  <div key={region} className="grid grid-cols-[5rem_1fr_2.5rem] items-center gap-3 text-xs sm:grid-cols-[6.5rem_1fr_3rem] sm:text-sm">
                    <span className={top ? 'font-bold text-[#315b83]' : 'text-slate-600'}>{REGION_KOREAN_NAMES[region]}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full rounded-full ${top ? 'bg-[#315b83]' : 'bg-slate-400'}`} style={{ width: `${score}%` }} /></span>
                    <span className="text-right font-medium">{score}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative mt-7 border-t border-slate-300 pt-5 sm:mt-9">
            <h2 className="text-sm font-bold sm:text-base">감정관 종합 소견</h2>
            <p className="mt-2 text-sm leading-7 text-slate-700">{result.opinion}</p>
          </div>

          <div className="relative mt-8 flex items-end justify-between gap-4 sm:mt-10">
            <p className="max-w-[70%] text-[11px] leading-5 text-slate-500 sm:text-xs">본 감정서는 음성 분석 결과를 기록한 문서입니다.</p>
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-2 border-[#9b4e4e] text-[#9b4e4e] sm:h-20 sm:w-20">
              <span className="text-sm font-black">C/O</span><span className="text-[9px] font-semibold">감정 확인</span>
            </div>
          </div>
        </article>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={handleDownload} disabled={busy} className="rounded-full bg-white py-4 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-slate-200 disabled:opacity-50">
            {busy ? '이미지 생성 중…' : '이미지 저장'}
          </button>
          <button onClick={handleShare} disabled={busy} className="rounded-full border border-zinc-700 bg-zinc-800/80 py-4 text-sm font-bold text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-50">
            {busy ? '이미지 생성 중…' : '공유'}
          </button>
        </div>
        {message && <p role="status" className="mt-3 text-center text-sm text-amber-300">{message}</p>}
        <button onClick={onResetAll} className="mt-4 w-full py-3 text-sm text-zinc-400 underline underline-offset-4 hover:text-white">
          다시 감정받기
        </button>
      </div>
    </section>
  );
}
