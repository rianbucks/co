'use client';

import { useState, type ReactNode } from 'react';
import { SUBREGION_NAMES, type GyeongsangResult } from '@/lib/gyeongsang/contract';
import { ORIGIN_NAMES, judgeOriginMatch, type OriginKey } from '@/lib/gyeongsang/origin';
import SubregionBar from './SubregionBar';
import {
  GS_CERTIFICATE_TITLE,
  downloadPng,
  formatIssuedDate,
  gsCertificateFileName,
  renderGsCertificate,
} from './gs-certificate-image';

interface GsCertificateProps {
  result: GyeongsangResult;
  origin: OriginKey;
  onBack: () => void;
  onRestart: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1.5 border-b border-[#b7791f]/30 py-3.5 last:border-b-0 sm:grid-cols-[7.5rem_1fr] sm:items-center sm:gap-3">
      <dt className="text-xs font-bold text-[#8a6d4f] sm:text-sm">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** 경상 방언 정밀 감정서: 신고 원산지, 감정 성분, 일치 여부, 농도, 등급, 직인. PNG 저장과 공유. */
export default function GsCertificate({ result, origin, onBack, onRestart }: GsCertificateProps) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const match = judgeOriginMatch(origin, result.subregions);
  const fileName = gsCertificateFileName(result.certificateNo);

  const makePng = async () => {
    setBusy(true);
    setMessage('');
    try {
      return await renderGsCertificate(result, origin);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '감정서 이미지 생성에 실패했습니다.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    const blob = await makePng();
    if (blob) downloadPng(blob, fileName);
  };

  const handleShare = async () => {
    const blob = await makePng();
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: GS_CERTIFICATE_TITLE });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        downloadPng(blob, fileName);
        setMessage('공유를 사용할 수 없어 감정서를 이미지로 저장했습니다.');
      }
    } else {
      downloadPng(blob, fileName);
      setMessage('이 기기에서는 공유를 지원하지 않아 감정서를 이미지로 저장했습니다.');
    }
  };

  return (
    <section className="screen-glass break-keep p-5 wrap-break-word sm:p-7 lg:p-10" aria-labelledby="gs-certificate-title">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onBack}
            className="whitespace-nowrap rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            결과로 돌아가기
          </button>
          <span className="whitespace-nowrap text-xs font-medium text-zinc-500">정밀 감정서 발급</span>
        </div>

        <article className="relative overflow-hidden rounded-xl border-[6px] border-[#7a2e2e] bg-[#f6efe2] text-[#3b2a1f] shadow-2xl">
          <div className="pointer-events-none absolute inset-1.5 rounded-lg border border-[#b7791f]/70" />

          <header className="relative bg-[#7a2e2e] px-5 py-6 text-center sm:py-8">
            <p className="text-[9px] font-semibold tracking-[0.2em] text-[#f3d9a4] sm:text-xs">
              GYEONGSANG DIALECT PRECISION APPRAISAL
            </p>
            <h1 id="gs-certificate-title" className="mt-2 text-balance font-serif text-[1.65rem] font-black tracking-tight text-[#f6efe2] sm:text-5xl">
              {GS_CERTIFICATE_TITLE}
            </h1>
            <p className="mt-2 text-[11px] text-[#f3d9a4] sm:text-sm">원산지증명서 · 경상 정밀 감정</p>
          </header>

          <div className="relative px-5 py-6 sm:px-10 sm:py-8">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-2 border-b-2 border-[#b7791f]/60 pb-4 text-xs sm:text-sm">
              <div>
                <p className="text-[#8a6d4f]">문서번호</p>
                <p className="mt-1 whitespace-nowrap font-semibold">{result.certificateNo}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-[#8a6d4f]">발급일</p>
                <p className="mt-1 whitespace-nowrap font-semibold">{formatIssuedDate(result.issuedAt)}</p>
              </div>
            </div>

            <dl className="mt-2">
              <Row label="신고 원산지">
                <span className="font-serif text-lg font-black sm:text-2xl">
                  {ORIGIN_NAMES[origin]} <span className="text-sm font-bold text-[#8a6d4f] sm:text-base">({SUBREGION_NAMES[match.subregion]})</span>
                </span>
              </Row>
              <Row label="감정 성분">
                <div className="text-[#3b2a1f]">
                  <SubregionBar subregions={result.subregions} variant="paper" />
                </div>
              </Row>
              <Row label="일치 여부">
                <span
                  className={`inline-block -rotate-3 rounded-lg border-[3px] border-double px-3 py-1.5 font-serif text-base font-black sm:text-2xl ${
                    match.matched ? 'border-[#2e7d4f] text-[#2e7d4f]' : 'border-[#b23a3a] text-[#b23a3a]'
                  }`}
                >
                  {match.label}
                </span>
              </Row>
              <Row label="경상 농도">
                <div>
                  <span className="font-serif text-2xl font-black sm:text-3xl">{result.intensity.score}</span>
                  <span className="text-sm font-semibold text-[#8a6d4f]"> / 100점</span>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5dccb]">
                    <div className="h-full rounded-full bg-[#7a2e2e]" style={{ width: `${result.intensity.score}%` }} />
                  </div>
                </div>
              </Row>
              <Row label="등급">
                <span className="font-serif text-base font-black sm:text-xl">
                  {result.intensity.grade}등급 · {result.intensity.gradeName}
                </span>
              </Row>
            </dl>

            <div className="mt-5 border-t-2 border-[#b7791f]/60 pt-5 text-center">
              <p className="font-serif text-sm font-semibold sm:text-base">위와 같이 경상 방언 정밀 감정 결과를 증명합니다.</p>
              <p className="mt-1 text-xs text-[#8a6d4f] sm:text-sm">{formatIssuedDate(result.issuedAt)}</p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-3">
              <p className="font-serif text-sm font-black sm:text-lg">경상 방언 정밀 감정위원회</p>
              <div
                aria-label="직인"
                className="flex h-16 w-16 shrink-0 flex-col items-center justify-center border-[3px] border-[#c0392b] font-serif text-lg font-black leading-tight text-[#c0392b] outline outline-1 outline-offset-[-7px] outline-[#c0392b] sm:h-20 sm:w-20 sm:text-xl"
              >
                <span>경상</span>
                <span>감정</span>
              </div>
            </div>

            <p className="mt-5 text-center text-[10px] leading-4 text-[#8a6d4f] sm:text-xs">
              본 감정서는 음성 분석 결과를 기록한 문서이며, 신고 원산지는 저장하지 않습니다.
            </p>
          </div>
        </article>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={handleDownload}
            disabled={busy}
            className="rounded-full bg-white py-4 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-slate-200 disabled:opacity-50"
          >
            {busy ? '이미지 생성 중…' : '이미지 저장'}
          </button>
          <button
            onClick={handleShare}
            disabled={busy}
            className="rounded-full border border-zinc-700 bg-zinc-800/80 py-4 text-sm font-bold text-zinc-100 transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {busy ? '이미지 생성 중…' : '공유'}
          </button>
        </div>
        {message && (
          <p role="status" className="mt-3 text-center text-sm text-amber-300">
            {message}
          </p>
        )}
        <button
          onClick={onRestart}
          className="mt-4 w-full py-3 text-sm text-zinc-400 underline underline-offset-4 hover:text-white"
        >
          다시 정밀 감정받기
        </button>
      </div>
    </section>
  );
}
