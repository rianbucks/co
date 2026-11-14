'use client';

import { JudgeResult } from '@/lib/judge/contract';
import { REGION_KOREAN_NAMES, PART_KOREAN_NAMES } from '@/types/screen';

interface S5ResultProps {
  result: JudgeResult;
  onGoToCertificate?: () => void;
  onResetAll: () => void;
}

export default function S5Result({ result, onGoToCertificate, onResetAll }: S5ResultProps) {
  const { region, intensity, evidence, opinion, transcript, certificateNo, issuedAt } = result;

  const formattedDate = new Date(issuedAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const probEntries = Object.entries(region.probabilities).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6 p-5 sm:p-7">
      {/* Main Result Card (iOS Apple Card / Wallet Style) */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 text-[11px] text-zinc-400">
          <span>{certificateNo}</span>
          <span>{formattedDate}</span>
        </div>

        {/* Primary Verdict Hero */}
        <div className="mt-5 text-center">
          <span className="inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
            판정 권역
          </span>

          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            {region.mixed ? '혼합 방언' : region.label}
          </h2>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-800/70 px-3.5 py-1.5 shadow-inner">
            <span className="text-xs font-bold text-amber-400">
              {intensity.grade}등급
            </span>
            <span className="h-3 w-px bg-zinc-700" />
            <span className="text-xs font-medium text-zinc-200">
              {intensity.gradeName}
            </span>
          </div>
        </div>

        {/* Intensity Score Bar */}
        <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-black/40 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-zinc-400">방언 농도 총점</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{intensity.score}</span>
              <span className="text-xs text-zinc-500">/ 100점</span>
            </div>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-700"
              style={{ width: `${intensity.score}%` }}
            />
          </div>
        </div>

        {/* 6 Region Probability Distribution (iOS Battery / Storage Style) */}
        <div className="mt-5">
          <div className="text-xs font-semibold text-zinc-400">권역별 추정 확률</div>
          <div className="mt-2 space-y-2 rounded-2xl border border-zinc-800/60 bg-black/30 p-3.5">
            {probEntries.map(([regKey, prob]) => {
              const label = REGION_KOREAN_NAMES[regKey] || regKey;
              const isTop = regKey === region.top;

              return (
                <div key={regKey} className="text-xs">
                  <div className="flex justify-between font-medium">
                    <span className={isTop ? 'font-bold text-white' : 'text-zinc-400'}>
                      {label} {isTop && '★'}
                    </span>
                    <span className="font-mono text-zinc-300">{prob}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isTop ? 'bg-indigo-400' : 'bg-zinc-600'
                      }`}
                      style={{ width: `${prob}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 Detail Metrics Grid */}
        <div className="mt-5">
          <div className="text-xs font-semibold text-zinc-400">4대 세부 영역 계측</div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            {Object.entries(intensity.parts).map(([key, val]) => (
              <div key={key} className="rounded-2xl border border-zinc-800/60 bg-black/40 p-2.5">
                <div className="text-[11px] text-zinc-400">{PART_KOREAN_NAMES[key] || key}</div>
                <div className="mt-1 font-mono text-base font-bold text-white">{val}점</div>
              </div>
            ))}
          </div>
        </div>

        {/* Transcript Quote */}
        {transcript && (
          <div className="mt-5 rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
            <div className="text-[11px] font-semibold text-zinc-400">구술 음성 채록</div>
            <p className="mt-1.5 text-xs italic leading-relaxed text-zinc-200">
              &quot;{transcript}&quot;
            </p>
          </div>
        )}

        {/* Evidence Highlights */}
        {evidence && evidence.length > 0 && (
          <div className="mt-5 space-y-2">
            <div className="text-xs font-semibold text-zinc-400">주요 판정 근거</div>
            {evidence.map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-zinc-800/60 bg-black/30 p-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {PART_KOREAN_NAMES[item.type] || item.type}
                  </span>
                  <span className="font-bold text-indigo-300">&quot;{item.quote}&quot;</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">↳ {item.note}</p>
              </div>
            ))}
          </div>
        )}

        {/* Opinion Summary */}
        <div className="mt-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs leading-relaxed">
          <div className="font-bold text-indigo-200">감정관 종합 소견</div>
          <p className="mt-1 text-zinc-300">
            {opinion}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            if (onGoToCertificate) onGoToCertificate();
            else alert('감정서(S6) 이미지 저장 및 공유 기능은 다음 단계에서 구현될 예정입니다.');
          }}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-lg shadow-white/10 transition hover:bg-zinc-200 active:scale-95"
        >
          <span>원산지증명서 발급 및 확인 (S6)</span>
          <span>→</span>
        </button>

        <button
          onClick={onResetAll}
          className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3.5 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700/60 active:scale-95"
        >
          새로운 감정 다시 시작
        </button>
      </div>
    </div>
  );
}
