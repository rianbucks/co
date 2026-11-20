'use client';

import {
  SUBREGION_AREAS,
  SUBREGION_KEYS,
  SUBREGION_NAMES,
  type GsEvidence,
  type GyeongsangResult,
} from '@/lib/gyeongsang/contract';
import { ORIGIN_MATCH_THRESHOLD, ORIGIN_NAMES, judgeOriginMatch, type OriginKey } from '@/lib/gyeongsang/origin';
import { splitHighlights } from '@/lib/judge/highlight';
import { PART_KOREAN_NAMES } from '@/types/screen';
import SubregionBar from './SubregionBar';

interface GsResultProps {
  result: GyeongsangResult;
  origin: OriginKey;
  onGoToCertificate: () => void;
  /** 정밀 감정 랭킹(등록과 조회) */
  onGoToRanking: () => void;
  onRestart: () => void;
}

function EvidenceRow({ item }: { item: GsEvidence }) {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-black/30 p-3.5 text-xs">
      <span className="font-bold text-indigo-300">&quot;{item.quote}&quot;</span>
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
          <mark key={index} className="rounded px-0.5 font-semibold not-italic">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** 경상 정밀 감정 결과: 성분 비율, 경상 농도와 등급, 신고 원산지와의 일치 여부, 문항별 받아쓰기와 근거. */
export default function GsResult({ result, origin, onGoToCertificate, onGoToRanking, onRestart }: GsResultProps) {
  const { subregions, intensity, evidence, transcript, segments, certificateNo, issuedAt } = result;
  const match = judgeOriginMatch(origin, subregions);

  const formattedDate = new Date(issuedAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="screen-glass break-keep p-5 wrap-break-word sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
        {/* 왼쪽: 일치 여부, 성분, 농도 */}
        <div className="relative flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-6 sm:p-8 lg:col-span-5">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-zinc-800/80 pb-3 text-[11px] text-zinc-400">
              <span className="whitespace-nowrap font-mono">{certificateNo}</span>
              <span className="whitespace-nowrap">{formattedDate}</span>
            </div>

            <div className="mt-6 text-center">
              <p className="result-eyebrow">경상 방언 정밀 감정 결과</p>
              <p className="mt-4 text-sm text-zinc-400">
                신고 원산지 <span className="font-medium text-zinc-100">{ORIGIN_NAMES[origin]}</span> (
                {SUBREGION_NAMES[match.subregion]})
              </p>
              <h2
                className={`mt-2 text-balance text-3xl font-black tracking-tight sm:text-4xl ${
                  match.matched ? 'text-emerald-300' : 'text-red-300'
                }`}
              >
                {match.label}
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {SUBREGION_NAMES[match.subregion]} 성분 {match.ratio}% (일치 기준 {ORIGIN_MATCH_THRESHOLD}% 이상)
              </p>
            </div>

            <div className="mt-7 rounded-2xl border border-zinc-800/80 bg-black/50 p-5 text-zinc-200">
              <div className="text-sm font-medium text-zinc-400">감정 성분</div>
              <div className="mt-3">
                <SubregionBar subregions={subregions} />
              </div>
              <p className="mt-3 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                {SUBREGION_KEYS.map((key) => (
                  <span key={key} className="whitespace-nowrap">
                    {SUBREGION_NAMES[key]}: {SUBREGION_AREAS[key]}
                  </span>
                ))}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-800/80 bg-black/50 p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-zinc-400">경상 농도</span>
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
              <p className="mt-3 text-sm font-medium text-zinc-300">
                {intensity.grade}등급 <span className="mx-1 text-zinc-600">·</span> {intensity.gradeName}
              </p>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <button
              onClick={onGoToCertificate}
              className="flex w-full items-center justify-center rounded-full bg-white py-4 text-sm font-bold text-black transition hover:bg-zinc-200"
            >
              정밀 감정서 발급
            </button>
            <button onClick={onGoToRanking} className="secondary-action-button w-full text-center transition">
              정밀 랭킹 등록
            </button>
            <button onClick={onRestart} className="secondary-action-button w-full text-center transition">
              다시 정밀 감정받기
            </button>
          </div>
        </div>

        {/* 오른쪽: 항목 점수, 문항별 받아쓰기와 근거 */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 sm:p-7">
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">경상 방언 특징 세부 점수</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(intensity.parts).map(([key, value]) => (
                <div key={key} className="rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5 text-center">
                  <div className="text-xs font-medium text-zinc-400">{PART_KOREAN_NAMES[key] || key}</div>
                  <div className="mt-1 font-mono text-xl font-bold text-white">{value}점</div>
                </div>
              ))}
            </div>
          </div>

          {segments.length > 0 ? (
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 sm:p-7">
              <h3 className="text-sm font-bold tracking-tight text-zinc-200">문항별 구술 채록 및 근거 인용</h3>
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
                          <p className="mt-1.5 font-serif text-xs italic leading-relaxed text-zinc-200">
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
                          {items.map((item, index) => (
                            <EvidenceRow key={index} item={item} />
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
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 sm:p-7">
              <h3 className="text-sm font-bold tracking-tight text-zinc-200">구술 음성 채록 및 근거 인용</h3>
              {transcript && (
                <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/50 p-4">
                  <div className="text-[11px] font-semibold text-zinc-400">구술 채록문</div>
                  <p className="mt-1.5 font-serif text-xs italic leading-relaxed text-zinc-200">
                    &quot;
                    <HighlightedTranscript text={transcript} quotes={evidence.map((item) => item.quote)} />
                    &quot;
                  </p>
                </div>
              )}
              {evidence.length > 0 ? (
                <div className="mt-4 space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-400">식별된 경상 방언 근거</div>
                  {evidence.map((item, index) => (
                    <EvidenceRow key={index} item={item} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 pl-1 text-[11px] text-zinc-500">확인된 근거가 없습니다.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
