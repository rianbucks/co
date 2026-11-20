'use client';

import { Evidence, JudgeResult } from '@/lib/judge/contract';
import { splitHighlights } from '@/lib/judge/highlight';
import { REGION_KOREAN_NAMES, PART_KOREAN_NAMES } from '@/types/screen';

interface S5ResultProps {
  result: JudgeResult;
  onGoToCertificate: () => void;
  onGoToRanking: () => void;
  onResetAll: () => void;
  /** 있으면 1순위가 경상일 때 경상 정밀 감정을 권한다. */
  onStartGyeongsang?: () => void;
}

function EvidenceRow({ item }: { item: Evidence }) {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-black/30 p-3.5 text-xs">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
          {PART_KOREAN_NAMES[item.type] || item.type}
        </span>
        <span className="font-bold text-indigo-300">&quot;{item.quote}&quot;</span>
      </div>
      <p className="mt-1.5 border-l border-zinc-600 pl-3 text-xs text-zinc-400">{item.note}</p>
    </div>
  );
}

/** 받아쓰기에서 근거 인용 구절을 강조해 보여 준다. */
function HighlightedTranscript({ text, quotes }: { text: string; quotes: string[] }) {
  return (
    <>
      {splitHighlights(text, quotes).map((part, index) =>
        part.highlighted ? (
          <mark key={index} className="rounded bg-indigo-500/25 px-0.5 font-semibold not-italic text-indigo-200">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

export default function S5Result({
  result,
  onGoToCertificate,
  onGoToRanking,
  onResetAll,
  onStartGyeongsang,
}: S5ResultProps) {
  const { region, intensity, evidence, opinion, transcript, certificateNo, issuedAt } = result;
  // 이전 형식의 응답(segments 없음)도 전체 받아쓰기로 보여 준다.
  const segments = result.segments ?? [];

  const formattedDate = new Date(issuedAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const probEntries = Object.entries(region.probabilities).sort((a, b) => b[1] - a[1]);

  return (
    <div className="screen-glass p-5 sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 items-start">

        {/* Left Column: Official Verdict & Certificate Card */}
        <div className="relative flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 text-[11px] text-zinc-400">
              <span className="font-mono">{certificateNo}</span>
              <span>{formattedDate}</span>
            </div>

            {/* Verdict Hero */}
            <div className="mt-6 text-center">
              <span className="inline-block rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300">
                최종 판정 결과
              </span>

              <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                {region.mixed ? '혼합 방언' : region.label}
              </h2>

              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-800/80 px-4 py-1.5 shadow-inner">
                <span className="text-xs font-bold text-amber-400">
                  {intensity.grade}등급
                </span>
                <span className="h-3 w-px bg-zinc-700" />
                <span className="text-xs font-medium text-zinc-200">
                  {intensity.gradeName}
                </span>
              </div>
            </div>

            {/* Dialect Intensity Gauge Bar */}
            <div className="mt-8 rounded-2xl border border-zinc-800/80 bg-black/50 p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-zinc-400">사투리 농도 총점</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{intensity.score}</span>
                  <span className="text-xs text-zinc-500">/ 100점</span>
                </div>
              </div>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-700"
                  style={{ width: `${intensity.score}%` }}
                />
              </div>
            </div>

            {/* Opinion Note */}
            <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs leading-relaxed">
              <div className="font-bold text-indigo-300">감정관 종합 소견</div>
              <p className="mt-1 text-zinc-300">
                &quot;{opinion}&quot;
              </p>
            </div>

            {/* 1순위가 경상이면 경상 정밀 감정을 권한다 */}
            {onStartGyeongsang && region.top === 'gyeongsang' && (
              <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-xs font-bold text-amber-200">경상 방언이 1순위로 판정되었습니다</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  경북권(대구·경북)과 경남권(부산·울산·경남) 중 어느 쪽 성분이 강한지 정밀 감정으로 가려 드립니다.
                </p>
                <button
                  onClick={onStartGyeongsang}
                  className="mt-3 flex w-full items-center justify-center rounded-xl border border-amber-100/25 bg-amber-100/[0.08] py-3 text-sm font-semibold text-amber-50 transition hover:bg-amber-100/[0.14]"
                >
                  경상 정밀 감정 받기
                </button>
              </div>
            )}
          </div>

          {/* Action Button inside Left Column for Desktop */}
          <div className="mt-8 space-y-3">
            <button
              onClick={onGoToCertificate}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              <span>원산지증명서 발급 및 확인 (S6)</span>
            </button>

            <button
              onClick={onGoToRanking}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/15 py-3.5 text-sm font-bold text-indigo-200 transition hover:bg-indigo-500/25 active:scale-[0.98]"
            >
              <span>농도 랭킹 등록 (S7)</span>
            </button>

            <button
              onClick={onResetAll}
              className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700 active:scale-95"
            >
              새로운 감정 다시 시작
            </button>
          </div>
        </div>

        {/* Right Column: In-Depth Analytics & Linguistic Evidence */}
        <div className="space-y-6 lg:col-span-7">

          {/* 6 Region Probability Breakdown */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">
              6대 권역별 추정 확률 분석
            </h3>
            <div className="mt-4 space-y-2.5 rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
              {probEntries.map(([regKey, prob]) => {
                const label = REGION_KOREAN_NAMES[regKey] || regKey;
                const isTop = regKey === region.top;

                return (
                  <div key={regKey} className="text-xs">
                    <div className="flex justify-between font-medium">
                      <span className={isTop ? 'font-bold text-indigo-300' : 'text-zinc-400'}>
                        {label} {isTop && '· 1순위'}
                      </span>
                      <span className="font-mono text-zinc-300">{prob}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isTop ? 'bg-gradient-to-r from-indigo-500 to-purple-400' : 'bg-zinc-700'
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
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">
              4대 세부 영역별 점수
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(intensity.parts).map(([key, val]) => (
                <div key={key} className="rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5 text-center">
                  <div className="text-xs font-medium text-zinc-400">{PART_KOREAN_NAMES[key] || key}</div>
                  <div className="mt-1 font-mono text-xl font-bold text-white">{val}점</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-question Transcript & Evidence */}
          {segments.length > 0 ? (
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
              <h3 className="text-sm font-bold tracking-tight text-zinc-200">
                문항별 구술 채록 및 근거 인용
              </h3>
              <div className="mt-4 space-y-4">
                {segments.map((segment) => {
                  const items = evidence.filter((item) => item.question === segment.question);
                  return (
                    <div key={segment.question} className="rounded-2xl border border-zinc-800/60 bg-black/40 p-4">
                      <div className="flex items-start gap-2.5">
                        <span className="shrink-0 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
                          문항 {segment.question}
                        </span>
                        <p className="text-xs font-semibold leading-relaxed text-zinc-300">{segment.prompt}</p>
                      </div>

                      <div className="mt-3 rounded-xl border border-zinc-800/60 bg-black/50 p-3">
                        <div className="text-[11px] font-semibold text-zinc-400">구술 채록문</div>
                        {segment.transcript ? (
                          <p className="mt-1.5 text-xs italic leading-relaxed text-zinc-200 font-serif">
                            &quot;
                            <HighlightedTranscript text={segment.transcript} quotes={items.map((item) => item.quote)} />
                            &quot;
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs text-zinc-500">이 문항의 답변이 확인되지 않았습니다.</p>
                        )}
                      </div>

                      {items.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {items.map((item, idx) => (
                            <EvidenceRow key={idx} item={item} />
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 pl-1 text-[11px] text-zinc-500">이 문항에서 확인된 근거가 없습니다.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
              <h3 className="text-sm font-bold tracking-tight text-zinc-200">
                구술 음성 채록 및 근거 인용
              </h3>

              {transcript && (
                <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/50 p-4">
                  <div className="text-[11px] font-semibold text-zinc-400">구술 채록문 (Transcript)</div>
                  <p className="mt-1.5 text-xs italic leading-relaxed text-zinc-200 font-serif">
                    &quot;{transcript}&quot;
                  </p>
                </div>
              )}

              {evidence && evidence.length > 0 && (
                <div className="mt-4 space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-400">식별된 방언 언어학적 근거</div>
                  {evidence.map((item, idx) => (
                    <EvidenceRow key={idx} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
