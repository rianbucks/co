'use client';

import NoticePopup from '@/components/common/NoticePopup';

import { Evidence, JudgeResult } from '@/lib/judge/contract';
import { splitHighlights } from '@/lib/judge/highlight';
import { UNCERTAIN_PREFIX, regionVerdictLabel, uncertainDetail } from '@/lib/judge/rules';
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
  /** 바꿔 말하기 문항이 섞인 결과(set-b)면 문항마다 종류를 적는다. */
  const mixedKinds = segments.some((segment) => segment.kind === 'convert');

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
        <div data-enter="1" className="relative flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 text-[11px] text-zinc-400">
              <span className="font-mono">{certificateNo}</span>
              <span>{formattedDate}</span>
            </div>

            {/* Verdict Hero */}
            <div className="mt-3 text-center">
              <p className="result-eyebrow">
                내 말투와 가까운 지역
              </p>

              <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                {region.uncertain ? (
                  <>
                    {UNCERTAIN_PREFIX} <span className="whitespace-nowrap">{uncertainDetail(region.top)}</span>
                  </>
                ) : (
                  regionVerdictLabel(region)
                )}
              </h2>
              {region.uncertain && (
                <p className="mt-2 text-sm text-zinc-400">
                  확인된 근거가 1순위 권역을 충분히 뒷받침하지 않아 판정을 유보합니다. 유보된 결과는 랭킹에 등록할 수
                  없습니다.
                </p>
              )}

              <p className="mt-1 text-sm font-medium text-zinc-300">
                {intensity.grade}등급 <span className="mx-1 text-zinc-600">·</span> {intensity.gradeName}
              </p>
            </div>

            {/* Dialect Intensity Gauge Bar */}
            <div className="mt-3 border-y border-zinc-800/80 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-zinc-400">사투리 농도</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{intensity.score}</span>
                  <span className="text-xs text-zinc-500">/ 100점</span>
                </div>
              </div>
              <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[#9bbbd5] transition-all duration-700"
                  style={{ width: `${intensity.score}%` }}
                />
              </div>
            </div>

            {/* Opinion Note */}
            <div className="mt-3 text-xs leading-relaxed">
              <div className="font-bold text-indigo-300">감정관 종합 소견</div>
              <p className="mt-1 text-zinc-300">
                &quot;{opinion}&quot;
              </p>
            </div>

            {/* 1순위가 경상이면 경상 정밀 감정을 권한다 */}
            {onStartGyeongsang && region.top === 'gyeongsang' && (
              <div className="mt-6 rounded-2xl border border-zinc-800 p-4">
                <p className="result-eyebrow">
                  {region.uncertain ? '경상 방언이 1순위로 추정되었습니다' : '경상 방언이 1순위로 판정되었습니다'}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  경북권(대구·경북)과 경남권(부산·울산·경남) 중 어느 쪽 성분이 강한지 정밀 감정으로 가려 드립니다.
                </p>
                <button onClick={onStartGyeongsang} className="secondary-action-button mt-3 w-full text-center transition">
                  경상 정밀 감정 받기
                </button>
              </div>
            )}
          </div>

          {/* Action Button inside Left Column for Desktop */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={onGoToCertificate}
              className="col-span-2 flex w-full items-center justify-center gap-2 rounded-full bg-white py-2 text-sm font-bold text-black shadow-xl shadow-white/10 transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              <span>감정서 보기</span>
            </button>

            <button
              onClick={onGoToRanking}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/15 py-2 text-sm font-bold text-indigo-200 transition hover:bg-indigo-500/25 active:scale-[0.98]"
            >
              <span>{region.uncertain ? '농도 랭킹 보기' : '농도 랭킹 등록'}</span>
            </button>

            <button
              onClick={onResetAll}
              className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700 active:scale-95"
            >
              다시 감정하기
            </button>
          </div>
        </div>

        {/* Right Column: In-Depth Analytics & Linguistic Evidence */}
        <div data-enter="2" className="space-y-3 lg:col-span-7">

          {/* 6 Region Probability Breakdown */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">
              지역별 확률
            </h3>
            <div className="mt-2">
              {probEntries.map(([regKey, prob]) => {
                const label = REGION_KOREAN_NAMES[regKey] || regKey;
                const isTop = regKey === region.top;

                return (
                  <div key={regKey} className="probability-row text-xs">
                    <span className={isTop ? 'font-bold text-indigo-300' : 'text-zinc-400'}>
                      {label} {isTop && '· 1순위'}
                    </span>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isTop ? 'bg-[#9bbbd5]' : 'bg-zinc-700'
                        }`}
                        style={{ width: `${prob}%` }}
                      />
                    </div>
                    <span>{prob}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4 Detail Metrics Grid */}
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">
              항목별 점수
            </h3>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {Object.entries(intensity.parts).map(([key, val]) => (
                <div key={key} className="border-l border-zinc-800/60 py-1 text-center first:border-0">
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
                답변별 판정 근거
              </h3>
              <div className="mt-1">
                {segments.map((segment) => {
                  const items = evidence.filter((item) => item.question === segment.question);
                  return (
                    <details key={segment.question} className="answer-detail">
                      <summary>
                        <span className="shrink-0 rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[11px] font-bold text-indigo-300">
                          문항 {segment.question}
                        </span>
                        <div className="min-w-0">
                          {mixedKinds && (
                            <p className="text-[11px] font-medium text-zinc-500">
                              {segment.kind === 'convert' ? '바꿔 말하기 · 제시 문장' : '상황 답하기'}
                            </p>
                          )}
                          <p className="text-xs font-semibold leading-relaxed text-zinc-300">{segment.prompt}</p>
                        </div>
                      </summary>

                      <div className="mt-3 rounded-xl border border-zinc-800/60 bg-black/50 p-3">
                        <div className="text-[11px] font-semibold text-zinc-400">받아쓰기</div>
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
                    </details>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
              <h3 className="text-sm font-bold tracking-tight text-zinc-200">
                판정 근거
              </h3>

              {transcript && (
                <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/50 p-4">
                  <div className="text-[11px] font-semibold text-zinc-400">받아쓰기</div>
                  <p className="mt-1.5 text-xs italic leading-relaxed text-zinc-200 font-serif">
                    &quot;{transcript}&quot;
                  </p>
                </div>
              )}

              {evidence && evidence.length > 0 && (
                <div className="mt-4 space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-400">말투의 특징</div>
                  {evidence.map((item, idx) => (
                    <EvidenceRow key={idx} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>
      <NoticePopup title="내 음성 감정서가 준비됐어요" action="감정서 보기" rememberKey={`co:certificate:${result.id}`} onAction={onGoToCertificate} />
    </div>
  );
}
