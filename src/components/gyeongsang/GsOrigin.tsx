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
        <fieldset className="rounded-3xl border border-zinc-800/80 bg-zinc-900/70 p-6 sm:p-8 lg:col-span-7">
          <legend className="sr-only">신고 원산지</legend>
          <div>
            <p className="result-eyebrow">경상 정밀 감정</p>
            <h2 className="mt-1 text-xl font-medium text-white">원산지 신고서</h2>
            <p className="mt-1 text-sm text-zinc-400">정밀 감정 결과와 대조할 본인의 원산지(출신 지역)를 신고해 주십시오.</p>
          </div>

          <div className="mt-6 space-y-5">
            {SUBREGION_KEYS.map((subregion) => (
              <div key={subregion}>
                <div className="text-sm font-medium text-zinc-300">
                  {SUBREGION_NAMES[subregion]} <span className="text-zinc-500">({SUBREGION_AREAS[subregion]})</span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2.5">
                  {ORIGIN_KEYS.filter((origin) => ORIGIN_SUBREGION[origin] === subregion).map((origin) => {
                    const checked = selected === origin;
                    return (
                      <label
                        key={origin}
                        className={`flex cursor-pointer items-center justify-center rounded-lg border py-3.5 text-base transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#9bbbd5] ${
                          checked
                            ? 'border-sky-300 bg-sky-500/10 font-semibold text-sky-200'
                            : 'border-zinc-700 text-zinc-200 hover:bg-[#20272d]'
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
        <div className="flex flex-col justify-between gap-6 rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 sm:p-8 lg:col-span-5">
          <dl className="divide-y divide-zinc-800 border-y border-zinc-800">
            <div className="py-4">
              <dt className="text-sm font-medium text-zinc-200">일치 판정 기준</dt>
              <dd className="mt-1 text-sm text-zinc-400">
                감정 결과에서 신고하신 원산지가 속한 권역의 성분이 {ORIGIN_MATCH_THRESHOLD}% 이상이면
                &lsquo;원산지 일치&rsquo;, 아니면 &lsquo;원산지 불일치, 재심 권고&rsquo;로 판정합니다.
              </dd>
            </div>
            <div className="py-4">
              <dt className="text-sm font-medium text-zinc-200">신고 원산지 처리</dt>
              <dd className="mt-1 text-sm text-zinc-400">
                신고 원산지는 서버로 보내거나 저장하지 않으며, 정밀 결과 화면과 감정서에만 표시합니다.
              </dd>
            </div>
          </dl>

          <div className="space-y-3">
            <button
              onClick={onNext}
              disabled={!selected}
              className={`flex w-full items-center justify-center rounded-full py-4 text-sm font-bold transition ${
                selected ? 'bg-white text-black hover:bg-zinc-200' : 'cursor-not-allowed bg-zinc-800 text-zinc-500 opacity-60'
              }`}
            >
              {selected ? '신고하고 녹음 시작' : '원산지를 골라 주십시오'}
            </button>
            <button onClick={onPrev} className="secondary-action-button w-full text-center transition">
              이전 화면으로
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
