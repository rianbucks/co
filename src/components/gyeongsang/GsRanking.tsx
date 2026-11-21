'use client';

import RankingForm from '@/components/common/RankingForm';

import { FormEvent, useEffect, useState } from 'react';
import { SUBREGION_NAMES, type GyeongsangResult } from '@/lib/gyeongsang/contract';
import { ORIGIN_NAMES, ORIGIN_SUBREGION, judgeOriginMatch, type OriginKey } from '@/lib/gyeongsang/origin';
import {
  GS_RANKING_AREAS,
  GS_RANKING_AREA_NAMES,
  type GsRankingArea,
  type GsRankingEntryView,
  type GsRankingList,
  type GsRankingRegistered,
} from '@/lib/gyeongsang/ranking/contract';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, checkNickname } from '@/lib/ranking/nickname';

interface GsRankingProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  /** 지금 정밀 감정 결과. 감정 없이 들어오면 null이고, 이때는 순위만 보여 준다. */
  result: GyeongsangResult | null;
  /** 정밀 감정 때 고른 신고 원산지. 등록할 때 함께 보낸다. */
  origin: OriginKey | null;
  /** 이 정밀 감정 결과로 등록한 항목 id. 아직 등록하지 않았으면 null */
  entryId: string | null;
  onRegistered: (entryId: string) => void;
  /** 정밀 결과로 돌아가기(결과가 있을 때) */
  onHome: () => void;
  onBack: () => void;
  /** 정밀 감정 받기(결과 없이 들어왔을 때) */
  onApply: () => void;
}

type ListState = { status: 'loading' } | { status: 'ready'; data: GsRankingList } | { status: 'error' };

/** 다시 눌러도 결과가 같은 등록 오류. 등록 버튼을 잠근다. */
const FINAL_ERRORS = new Set(['not_found', 'not_eligible', 'already_registered', 'rate_limited']);

function registerErrorMessage(error: unknown, reason: unknown): string {
  switch (error) {
    case 'invalid_nickname':
      return reason === 'length'
        ? `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해 주십시오.`
        : '닉네임에는 한글, 영문, 숫자만 쓸 수 있습니다. 띄어쓰기와 기호는 빼 주십시오.';
    case 'not_found':
      return '등록 가능 시간(정밀 감정 후 1시간)이 지났거나 감정 기록을 찾을 수 없습니다. 새로 정밀 감정을 받아 주십시오.';
    case 'not_eligible':
      return reason === 'mock'
        ? '가짜 응답 모드(MOCK)로 받은 결과는 랭킹에 등록할 수 없습니다.'
        : '이 감정 결과는 랭킹에 등록할 수 없습니다.';
    case 'already_registered':
      return '이미 정밀 랭킹에 등록된 감정 결과입니다. 정밀 감정 1건당 한 번만 등록할 수 있습니다.';
    case 'rate_limited':
      return '오늘 이 네트워크에서 등록할 수 있는 횟수를 넘었습니다. 내일 다시 이용해 주십시오.';
    default:
      return '등록 중 일시적인 문제가 생겼습니다. 잠시 후 다시 시도해 주십시오.';
  }
}

function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-300';
  if (rank === 2) return 'text-zinc-200';
  if (rank === 3) return 'text-orange-300';
  return 'text-zinc-500';
}

function RankingRow({ item, isMine }: { item: GsRankingEntryView; isMine: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
        isMine ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800/60 bg-black/30'
      }`}
    >
      <span className={`w-9 shrink-0 text-center font-mono text-sm font-black ${rankColor(item.rank)}`}>{item.rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-white">{item.nickname}</span>
          {isMine && (
            <span className="shrink-0 rounded-full bg-indigo-500/25 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
              나
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-zinc-400">
          {ORIGIN_NAMES[item.origin]} · {SUBREGION_NAMES.gyeongbuk} {item.gyeongbuk}% · {item.matched ? '일치' : '불일치'}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <span className="font-mono text-lg font-black text-white">{item.intensity}</span>
        <span className="ml-0.5 text-[10px] text-zinc-500">점</span>
      </div>
    </li>
  );
}

/**
 * 경상 정밀 감정 랭킹. 기존 농도 랭킹(S7)과 따로 저장되고, 경상 정밀 감정 탭 안에서만 보인다.
 * 보기는 전체, 대구·경북, 부산·울산·경남이고 나누는 기준은 신고 원산지다.
 */
export default function GsRanking({ nickname, onNicknameChange, result, origin, entryId, onRegistered, onBack, onHome, onApply }: GsRankingProps) {
  const [area, setArea] = useState<GsRankingArea>('all');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; final: boolean } | null>(null);
  /** 방금 등록한 항목. 목록을 다시 받기 전까지 내 순위(전체)를 보여 준다. */
  const [registered, setRegistered] = useState<GsRankingEntryView | null>(null);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ area, limit: '50' });
    if (entryId) query.set('id', entryId);

    const loadRanking = async () => {
      try {
        const res = await fetch(`/api/gyeongsang-ranking?${query}`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setList({ status: 'ready', data: (await res.json()) as GsRankingList });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('정밀 랭킹 조회 에러:', err);
        setList({ status: 'error' });
      }
    };

    loadRanking();
    return () => controller.abort();
  }, [area, entryId, reloadKey]);

  const listData = list.status === 'ready' && list.data.area === area ? list.data : null;
  const myArea = origin ? ORIGIN_SUBREGION[origin] : null;
  /** 내 항목이 들어 있는 보기인지(전체이거나 신고 원산지의 보기) */
  const inMyArea = area === 'all' || area === myArea;
  const mine =
    listData?.me ?? (registered && registered.id === entryId && area === 'all' ? registered : null);
  const entryMissing = Boolean(entryId) && inMyArea && !mine && listData !== null;
  const myMatch = result && origin ? judgeOriginMatch(origin, result.subregions) : null;

  const changeArea = (next: GsRankingArea) => {
    if (next === area) return;
    setList({ status: 'loading' });
    setArea(next);
  };

  const handleReload = () => {
    setList({ status: 'loading' });
    setReloadKey((key) => key + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || entryId || formError?.final) return;

    if (!result && !nickname.trim()) return onApply();
    const checked = checkNickname(nickname);
    if (!checked.ok) {
      setFormError({ message: registerErrorMessage('invalid_nickname', checked.problem), final: false });
      return;
    }

    if (!result) {
      onNicknameChange(checked.value);
      onApply();
      return;
    }
    if (!origin) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/gyeongsang-ranking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judgmentId: result.id, nickname: checked.value, origin }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const code = data?.error;
        setFormError({ message: registerErrorMessage(code, data?.reason), final: FINAL_ERRORS.has(code) });
        return;
      }

      const { entry } = data as GsRankingRegistered;
      setRegistered(entry);
      setList({ status: 'loading' });
      setArea('all');
      onRegistered(entry.id);
    } catch (err) {
      console.error('정밀 랭킹 등록 에러:', err);
      setFormError({ message: registerErrorMessage(null, null), final: false });
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = submitting || Boolean(formError?.final);

  return (
    <div className="screen-glass break-keep p-5 wrap-break-word sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
        {/* 왼쪽: 내 결과와 등록 */}
        <div className="relative flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-zinc-900/90 p-6 sm:p-8 lg:col-span-5">
          <div>
            <h2 className="ranking-card-title">
              {!result ? '정밀 감정 신청' : entryId ? '정밀 랭킹 등록 완료' : '닉네임을 남겨 주십시오'}
            </h2>

            {result && origin && myMatch && (
              <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-black/50 p-5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-400">신고 원산지</span>
                  <span className="font-medium text-zinc-200">
                    {ORIGIN_NAMES[origin]} ({SUBREGION_NAMES[ORIGIN_SUBREGION[origin]]})
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="text-sm">
                    <span className={myMatch.matched ? 'text-emerald-300' : 'text-red-300'}>{myMatch.label}</span>
                    <span className="ml-2 text-zinc-400">
                      {SUBREGION_NAMES.gyeongbuk} {result.subregions.gyeongbuk}%
                    </span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-1">
                    <span className="text-3xl font-black text-white">{result.intensity.score}</span>
                    <span className="text-xs text-zinc-500">/ 100점</span>
                  </div>
                </div>
              </div>
            )}

            {mine ? (
              <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5 text-left">
                <div className="text-sm font-medium text-indigo-300">
                  내 순위 · {GS_RANKING_AREA_NAMES[area]}
                </div>
                <div className="mt-1 text-5xl font-black tracking-tight text-white">
                  {mine.rank}
                  <span className="ml-1 text-lg font-bold text-zinc-300">위</span>
                </div>
                <div className="mt-2 text-xs text-zinc-400">
                  {listData && <span>{listData.total.toLocaleString('ko-KR')}명 중 · </span>}
                  닉네임 <span className="font-semibold text-zinc-200">{mine.nickname}</span>
                </div>
              </div>
            ) : entryId && !inMyArea && myArea ? (
              <div className="mt-6 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-left text-sm text-zinc-400">
                내 기록은 &lsquo;{GS_RANKING_AREA_NAMES[myArea]}&rsquo; 보기에 있습니다.
                <button onClick={() => changeArea(myArea)} className="secondary-action-button mt-3 w-full text-center transition">
                  {GS_RANKING_AREA_NAMES[myArea]} 보기
                </button>
              </div>
            ) : entryMissing ? (
              <div className="mt-6 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-sm text-zinc-400">
                등록한 항목을 찾을 수 없습니다. 운영자가 삭제했을 수 있습니다.
              </div>
            ) : entryId ? (
              <div className="mt-6 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-left text-sm text-zinc-400">
                내 순위를 불러오는 중입니다...
              </div>
            ) : (
              <RankingForm
                inputId="gs-ranking-nickname"
                nickname={nickname}
                onChange={value => {
                  onNicknameChange(value);
                  if (formError && !formError.final) setFormError(null);
                }}
                onSubmit={handleSubmit}
                disabled={submitDisabled}
                error={formError?.message}
                disclosure={result && <>
                  등록하면 <span className="font-semibold text-zinc-200">닉네임, 신고 원산지, 경상 농도, 경북권 비율, 등록 시각</span>이
                  정밀 감정 랭킹에 공개됩니다. 음성과 받아쓰기는 저장하지 않으며, 기록은 대회 종료 후 1주 안에 모두
                  삭제합니다. 부적절한 닉네임은 운영자가 삭제할 수 있습니다.
                </>}
                action={!result ? '경상권 정밀 감정 받기' : submitting ? '등록하는 중...' : '공개에 동의하고 정밀 랭킹 등록'}
              />
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-flow-col">
            <button onClick={result ? onBack : onHome} className="ranking-form-action secondary-action-button">
              {result ? '이전 화면으로' : '첫 화면으로 돌아가기'}
            </button>
            {result && <button onClick={onApply} className="ranking-form-action secondary-action-button">다시 감정하기</button>}
          </div>
        </div>

        {/* 오른쪽: 보기별 상위 50명 */}
        <div className={result ? "space-y-6 lg:col-span-7" : "ranking-first space-y-6 lg:col-span-7"}>
          <section aria-labelledby="gs-area-heading" className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 sm:p-7">
            <h1 className="ranking-card-title" id="gs-area-heading">경상 정밀 감정 랭킹</h1>
            <div role="group" aria-label="출신 지역 필터" className="gs-area-filter">
              {GS_RANKING_AREAS.map(key => (
                <button key={key} type="button" aria-pressed={key === area} onClick={() => changeArea(key)}>
                  {GS_RANKING_AREA_NAMES[key]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">등록한 출신 지역별 순위예요. 농도가 같으면 먼저 등록한 사람이 앞서요.</p>
            <div className="mt-4 flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-zinc-200">상위 50명</span>
              {listData && (
                <span className="whitespace-nowrap text-xs text-zinc-400">
                  {listData.total.toLocaleString('ko-KR')}명 등록
                </span>
              )}
            </div>

            {list.status === 'loading' && (
              <div className="py-6 text-left text-sm text-zinc-400">
                랭킹을 불러오는 중입니다...
              </div>
            )}

            {list.status === 'error' && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-left text-sm text-red-300">
                <div>랭킹을 불러오지 못했습니다.</div>
                <button onClick={handleReload} className="secondary-action-button mt-3 w-full text-center transition">
                  다시 불러오기
                </button>
              </div>
            )}

            {listData && listData.entries.length === 0 && (
              <div className="py-6 text-left text-sm text-zinc-400">
                아직 등록된 기록이 없어요.
              </div>
            )}

            {listData && listData.entries.length > 0 && (
              <ol className="ranking-rows mt-4 space-y-2" aria-label={`정밀 감정 랭킹 ${GS_RANKING_AREA_NAMES[area]} 상위 50명`}>
                {listData.entries.map((item) => (
                  <RankingRow key={item.id} item={item} isMine={item.id === mine?.id} />
                ))}
                {mine && mine.rank > listData.entries.length && (
                  <>
                    <li aria-hidden className="py-1 text-center text-xs text-zinc-600">
                      ⋮
                    </li>
                    <RankingRow item={mine} isMine />
                  </>
                )}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
