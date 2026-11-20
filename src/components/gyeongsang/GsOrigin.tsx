'use client';

import { SUBREGION_AREAS, SUBREGION_KEYS, SUBREGION_NAMES } from '@/lib/gyeongsang/contract';
import {
  ORIGIN_KEYS,
  ORIGIN_MATCH_THRESHOLD,
  ORIGIN_NAMES,
  ORIGIN_SUBREGION,
  type OriginKey,
} from '@/lib/gyeongsang/origin';

interface GsOriginProps {
  selected: OriginKey | null;
  onSelect: (origin: OriginKey) => void;
  onNext: () => void;
  onPrev: () => void;
}

/** 경상 정밀 감정 2단계: 신고 원산지 선택. 고른 값은 서버로 보내지 않는다. */
export default function GsOrigin({ selected, onSelect, onNext, onPrev }: GsOriginProps) {
  return (
    <div className="screen-glass break-keep p-5 wrap-break-word sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12 lg:gap-8">
        {/* 왼쪽: 신고서 */}
        <fieldset className="rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-7">
          <legend className="sr-only">신고 원산지</legend>
          <div>
            <p className="text-xs text-zinc-500">경상 정밀 감정</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">원산지 신고서</h2>
            <p className="text-xs text-zinc-400">정밀 감정 결과와 대조할 본인의 원산지(출신 지역)를 신고해 주십시오.</p>
          </div>

          <div className="mt-6 space-y-5">
            {SUBREGION_KEYS.map((subregion) => (
              <div key={subregion}>
                <div className="text-xs font-bold text-zinc-300">
                  {SUBREGION_NAMES[subregion]}{' '}
                  <span className="font-medium text-zinc-500">({SUBREGION_AREAS[subregion]})</span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                  {ORIGIN_KEYS.filter((origin) => ORIGIN_SUBREGION[origin] === subregion).map((origin) => {
                    const checked = selected === origin;
                    return (
                      <label
                        key={origin}
                        className={`flex cursor-pointer items-center justify-center rounded-xl border py-4 text-base transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-200/90 ${
                          checked
                            ? 'border-amber-100/70 bg-amber-100/[0.16] font-semibold text-amber-50'
                            : 'border-white/10 bg-white/[0.035] text-zinc-200 hover:border-white/25 hover:bg-white/[0.06]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="gs-origin"
                          value={origin}
                          checked={checked}
                          onChange={() => onSelect(origin)}
                          className="sr-only"
                        />
                        {ORIGIN_NAMES[origin]}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {/* 오른쪽: 판정 기준과 진행 */}
        <div className="flex flex-col justify-between gap-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-xl sm:p-8 lg:col-span-5">
          <div className="space-y-3">
            <div className="rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
              <div className="text-xs font-bold text-zinc-200">일치 판정 기준</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                감정 결과에서 신고하신 원산지가 속한 권역의 성분이 {ORIGIN_MATCH_THRESHOLD}% 이상이면
                &lsquo;원산지 일치&rsquo;, 아니면 &lsquo;원산지 불일치, 재심 권고&rsquo;로 판정합니다.
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
              <div className="text-xs font-bold text-zinc-200">신고 원산지 처리</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                신고 원산지는 서버로 보내거나 저장하지 않으며, 정밀 결과 화면과 감정서에만 표시합니다.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onNext}
              disabled={!selected}
              className={`flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-bold transition active:scale-[0.98] ${
                selected
                  ? 'bg-white text-black shadow-xl shadow-white/10 hover:bg-zinc-200'
                  : 'cursor-not-allowed bg-zinc-800 text-zinc-500'
              }`}
            >
              <span>{selected ? '신고하고 녹음 시작' : '원산지를 골라 주십시오'}</span>
            </button>
            <button
              onClick={onPrev}
              className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 transition hover:bg-zinc-700 active:scale-95"
            >
              이전 화면으로
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
