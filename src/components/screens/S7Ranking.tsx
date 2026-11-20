'use client';

import { FormEvent, useEffect, useState } from 'react';
import { JudgeResult } from '@/lib/judge/contract';
import type { RankingEntryView, RankingList, RankingRegistered } from '@/lib/ranking/contract';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, checkNickname } from '@/lib/ranking/nickname';
import { REGION_KOREAN_NAMES } from '@/types/screen';

interface S7RankingProps {
  result: JudgeResult;
  /** 이 감정 결과로 등록한 랭킹 항목 id. 아직 등록하지 않았으면 null */
  entryId: string | null;
  onRegistered: (entryId: string) => void;
  onBack: () => void;
  onResetAll: () => void;
}

type ListState = { status: 'loading' } | { status: 'ready'; data: RankingList } | { status: 'error' };

/** 다시 눌러도 결과가 같은 등록 오류. 등록 버튼을 잠근다. */
const FINAL_ERRORS = new Set(['not_found', 'not_eligible', 'already_registered', 'rate_limited']);

function registerErrorMessage(error: unknown, reason: unknown): string {
  switch (error) {
    case 'invalid_nickname':
      return reason === 'length'
        ? `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해 주십시오.`
        : '닉네임에는 한글, 영문, 숫자만 쓸 수 있습니다. 띄어쓰기와 기호는 빼 주십시오.';
    case 'not_found':
      return '등록 가능 시간(감정 후 1시간)이 지났거나 감정 기록을 찾을 수 없습니다. 새로 감정해 주십시오.';
    case 'not_eligible':
      return reason === 'mock'
        ? '가짜 응답 모드(MOCK)로 받은 결과는 랭킹에 등록할 수 없습니다.'
        : '욕설이나 개인정보가 감지된 녹음의 결과는 랭킹에 등록할 수 없습니다.';
    case 'already_registered':
      return '이미 랭킹에 등록된 감정 결과입니다. 감정 1건당 한 번만 등록할 수 있습니다.';
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

function RankingRow({ item, isMine }: { item: RankingEntryView; isMine: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
        isMine ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-zinc-800/60 bg-black/30'
      }`}
    >
      <span className={`w-9 shrink-0 text-center font-mono text-sm font-black ${rankColor(item.rank)}`}>
        {item.rank}
      </span>
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
          {REGION_KOREAN_NAMES[item.region] || item.region} · {item.grade}등급 {item.gradeName}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <span className="font-mono text-lg font-black text-white">{item.intensity}</span>
        <span className="ml-0.5 text-[10px] text-zinc-500">점</span>
      </div>
    </li>
  );
}

export default function S7Ranking({ result, entryId, onRegistered, onBack, onResetAll }: S7RankingProps) {
  const { region, intensity } = result;

  const [nickname, setNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; final: boolean } | null>(null);
  /** 방금 등록한 항목. 목록을 다시 받기 전까지 내 순위를 보여 준다. */
  const [registered, setRegistered] = useState<RankingEntryView | null>(null);
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: '50' });
    if (entryId) query.set('id', entryId);

    const loadRanking = async () => {
      try {
        const res = await fetch(`/api/ranking?${query}`, { cache: 'no-store', signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setList({ status: 'ready', data: (await res.json()) as RankingList });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('랭킹 조회 에러:', err);
        setList({ status: 'error' });
      }
    };

    loadRanking();
    return () => controller.abort();
  }, [entryId, reloadKey]);

  const listData = list.status === 'ready' ? list.data : null;
  const mine = listData?.me ?? (registered && registered.id === entryId ? registered : null);
  const entryMissing = Boolean(entryId) && !mine && list.status === 'ready';
  const nicknameLength = [...nickname.trim()].length;

  const handleReload = () => {
    setList({ status: 'loading' });
    setReloadKey((key) => key + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || entryId || formError?.final) return;

    const checked = checkNickname(nickname);
    if (!checked.ok) {
      setFormError({ message: registerErrorMessage('invalid_nickname', checked.problem), final: false });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch('/api/ranking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judgmentId: result.id, nickname: checked.value }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const code = data?.error;
        setFormError({ message: registerErrorMessage(code, data?.reason), final: FINAL_ERRORS.has(code) });
        return;
      }

      const { entry } = data as RankingRegistered;
      setRegistered(entry);
      onRegistered(entry.id);
    } catch (err) {
      console.error('랭킹 등록 에러:', err);
      setFormError({ message: registerErrorMessage(null, null), final: false });
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = submitting || Boolean(formError?.final);

  return (
    <div className="p-5 sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 items-start">

        {/* Left Column: My Result & Registration */}
        <div className="relative flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-5">
          <div>
            <div className="text-center">
              <span className="inline-block rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-semibold text-amber-300">
                사투리 농도 랭킹
              </span>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                {mine ? '랭킹 등록 완료' : '닉네임을 남겨 주십시오'}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                농도 점수가 높은 순으로 상위 50명을 보여 드립니다. 점수가 같으면 먼저 등록한 분이 앞섭니다.
              </p>
            </div>

            {/* My Judgment Summary */}
            <div className="mt-6 rounded-2xl border border-zinc-800/80 bg-black/50 p-5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-400">내 감정 결과</span>
                <span className="font-medium text-zinc-200">{region.mixed ? '혼합 방언' : region.label}</span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="text-xs">
                  <span className="font-bold text-amber-400">{intensity.grade}등급</span>
                  <span className="ml-1.5 font-medium text-zinc-200">{intensity.gradeName}</span>
                </div>
                <div className="flex shrink-0 items-baseline gap-1">
                  <span className="text-3xl font-black text-white">{intensity.score}</span>
                  <span className="text-xs text-zinc-500">/ 100점</span>
                </div>
              </div>
            </div>

            {mine ? (
              <div className="mt-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5 text-center">
                <div className="text-xs font-semibold text-indigo-300">내 순위</div>
                <div className="mt-1 text-5xl font-black tracking-tight text-white">
                  {mine.rank}
                  <span className="ml-1 text-lg font-bold text-zinc-300">위</span>
                </div>
                <div className="mt-2 text-xs text-zinc-400">
                  {listData && <span>전체 {listData.total.toLocaleString('ko-KR')}명 중 · </span>}
                  닉네임 <span className="font-semibold text-zinc-200">{mine.nickname}</span>
                </div>
              </div>
            ) : entryMissing ? (
              <div className="mt-6 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-xs leading-relaxed text-zinc-400">
                등록한 항목을 찾을 수 없습니다. 운영자가 삭제했을 수 있습니다.
              </div>
            ) : entryId ? (
              <div className="mt-6 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-center text-xs text-zinc-400">
                내 순위를 불러오는 중입니다...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-3" noValidate>
                <div>
                  <label htmlFor="ranking-nickname" className="text-xs font-semibold text-zinc-300">
                    닉네임
                  </label>
                  <input
                    id="ranking-nickname"
                    type="text"
                    value={nickname}
                    onChange={(event) => {
                      setNickname(event.target.value);
                      if (formError && !formError.final) setFormError(null);
                    }}
                    placeholder="한글, 영문, 숫자 2~10자"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={submitDisabled}
                    className="mt-2 w-full rounded-2xl border border-zinc-700/60 bg-black/50 px-4 py-3.5 text-sm font-semibold text-white outline-none transition placeholder:font-normal placeholder:text-zinc-600 focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                  />
                  <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
                    <span>띄어쓰기와 기호는 쓸 수 없습니다</span>
                    <span className={nicknameLength > NICKNAME_MAX_LENGTH ? 'text-red-400' : ''}>
                      {nicknameLength}/{NICKNAME_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-[11px] leading-relaxed text-zinc-400">
                  등록하면 <span className="font-semibold text-zinc-200">닉네임, 농도, 지역, 등급, 등록 시각</span>이
                  랭킹에 공개됩니다. 음성과 받아쓰기는 저장하지 않으며, 기록은 대회 종료 후 1주 안에 모두 삭제합니다.
                  부적절한 닉네임은 운영자가 삭제할 수 있습니다.
                </div>

                {formError && (
                  <div role="alert" className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs leading-relaxed text-red-300">
                    {formError.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitDisabled}
                  className={`flex w-full items-center justify-center gap-2 rounded-full py-4 text-sm font-bold transition active:scale-[0.98] ${
                    submitDisabled
                      ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                      : 'bg-white text-black shadow-xl shadow-white/10 hover:bg-zinc-200'
                  }`}
                >
                  <span>{submitting ? '등록하는 중...' : '공개에 동의하고 랭킹 등록'}</span>
                  {!submitting && <span>→</span>}
                </button>
              </form>
            )}
          </div>

          <div className="mt-8 space-y-3">
            <button
              onClick={onBack}
              className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700 active:scale-95"
            >
              감정 결과로 돌아가기
            </button>
            <button
              onClick={onResetAll}
              className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700 active:scale-95"
            >
              새로운 감정 다시 시작
            </button>
          </div>
        </div>

        {/* Right Column: Top 50 Leaderboard */}
        <div className="space-y-6 lg:col-span-7">
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-bold tracking-tight text-zinc-200">농도 랭킹 TOP 50</h3>
              {listData && (
                <span className="text-[11px] text-zinc-400">
                  총 {listData.total.toLocaleString('ko-KR')}명 등록
                </span>
              )}
            </div>

            {list.status === 'loading' && (
              <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/40 p-6 text-center text-xs text-zinc-400">
                랭킹을 불러오는 중입니다...
              </div>
            )}

            {list.status === 'error' && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-center text-xs text-red-300">
                <div>랭킹을 불러오지 못했습니다.</div>
                <button
                  onClick={handleReload}
                  className="mt-3 rounded-full border border-zinc-700/60 bg-zinc-800/60 px-4 py-2 text-[11px] font-semibold text-zinc-200 transition hover:bg-zinc-700 active:scale-95"
                >
                  다시 불러오기
                </button>
              </div>
            )}

            {listData && listData.entries.length === 0 && (
              <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/40 p-6 text-center text-xs leading-relaxed text-zinc-400">
                아직 등록된 기록이 없습니다. 첫 번째 주인공이 되어 보십시오.
              </div>
            )}

            {listData && listData.entries.length > 0 && (
              <ol className="mt-4 space-y-2" aria-label="농도 랭킹 상위 50명">
                {listData.entries.map((item) => (
                  <RankingRow key={item.id} item={item} isMine={item.id === mine?.id} />
                ))}
                {mine && mine.rank > listData.entries.length && (
                  <>
                    <li aria-hidden className="py-1 text-center text-xs text-zinc-600">⋮</li>
                    <RankingRow item={mine} isMine />
                  </>
                )}
              </ol>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
