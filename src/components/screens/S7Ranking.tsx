'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { JudgeResult } from '@/lib/judge/contract';
import type { RankingEntryView, RankingList, RankingRegistered } from '@/lib/ranking/contract';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, checkNickname } from '@/lib/ranking/nickname';
import RankingRow from '@/components/common/RankingRow';

import NoticePopup from '@/components/common/NoticePopup';

interface S7RankingProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  /** 지금 감정 결과. 감정 없이 들어오면 null이고, 이때는 순위 목록만 보여 준다. */
  result: JudgeResult | null;
  /** 이 감정 결과로 등록한 랭킹 항목 id. 아직 등록하지 않았으면 null */
  entryId: string | null;
  onRegistered: (entryId: string) => void;
  onBack: () => void;
  /** 감정 신청(결과 없이 들어왔을 때) */
  onApply: () => void;
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

export default function S7Ranking({ nickname, onNicknameChange, result, entryId, onRegistered, onBack, onApply, onResetAll }: S7RankingProps) {

  const myRankPanel = useRef<HTMLDivElement>(null);
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
  const nicknameLength = [...nickname.normalize('NFC').trim()].length;

  const handleReload = () => {
    setList({ status: 'loading' });
    setReloadKey((key) => key + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || entryId || formError?.final) return;

    if (!result && !nickname.trim()) {
      onApply();
      return;
    }
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
    <div className="screen-glass p-5 sm:p-7 lg:p-10">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 items-start">

        {/* Left Column: My Result & Registration */}
        <div data-enter="1" className="relative flex flex-col justify-between rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-5">
          <div>
            <div className="text-center">
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                {!result ? '농도 랭킹' : mine ? '랭킹 등록 완료' : '랭킹에 등록하기'}
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                점수가 같으면 먼저 등록한 사람이 앞서요.
              </p>
            </div>

            {/* My Judgment Summary */}
            {result && (
              <div className="mt-3 rounded-2xl border border-zinc-800/80 bg-black/50 p-5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-400">내 감정 결과</span>
                  <span className="font-medium text-zinc-200">{result.region.mixed ? '혼합 방언' : result.region.label}</span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div className="text-xs">
                    <span className="font-bold text-indigo-300">{result.intensity.grade}등급</span>
                    <span className="ml-1.5 font-medium text-zinc-200">{result.intensity.gradeName}</span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-1">
                    <span className="text-3xl font-black text-white">{result.intensity.score}</span>
                    <span className="text-xs text-zinc-500">/ 100점</span>
                  </div>
                </div>
              </div>
            )}

            {mine ? (
              <div ref={myRankPanel} tabIndex={-1} className="mt-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-5 text-center">
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
              <div className="mt-3 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-xs leading-relaxed text-zinc-400">
                등록한 항목을 찾을 수 없습니다. 운영자가 삭제했을 수 있습니다.
              </div>
            ) : entryId ? (
              <div className="mt-3 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-center text-xs text-zinc-400">
                내 순위를 불러오는 중입니다...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-3 space-y-2" noValidate>
                <div>
                  <label htmlFor="ranking-nickname" className="text-xs font-semibold text-zinc-300">
                    {result ? '랭킹 닉네임' : '랭킹 닉네임 (선택)'}
                  </label>
                  <input
                    id="ranking-nickname"
                    type="text"
                    value={nickname}
                    onChange={(event) => {
                      onNicknameChange(event.target.value);
                      if (formError && !formError.final) setFormError(null);
                    }}
                    placeholder="한글, 영문, 숫자 2~10자"
                    aria-describedby="nickname-help"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={submitDisabled}
                    className="mt-2 w-full rounded-2xl border border-zinc-700/60 bg-black/50 px-4 py-3.5 text-sm font-semibold text-white outline-none transition placeholder:font-normal placeholder:text-zinc-600 focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                  />
                  <div id="nickname-help" className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
                    <span>띄어쓰기와 기호는 쓸 수 없습니다</span>
                    <span className={nicknameLength > NICKNAME_MAX_LENGTH ? 'text-red-400' : ''}>
                      {nicknameLength}/{NICKNAME_MAX_LENGTH}
                    </span>
                  </div>
                </div>

                {result ? <div className="rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-[11px] leading-relaxed text-zinc-400">
                  등록하면 <span className="font-semibold text-zinc-200">닉네임, 농도, 지역, 등급, 등록 시각</span>이
                  랭킹에 공개됩니다. 음성과 받아쓰기는 저장하지 않으며, 기록은 대회 종료 후 1주 안에 모두 삭제합니다.
                  부적절한 닉네임은 운영자가 삭제할 수 있습니다.
                </div> : <p className="text-sm text-zinc-400">미리 적어두면 감정이 끝난 뒤 이 이름으로 등록할 수 있어요. 랭킹에 공개할지는 그때 정해요.</p>}

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
                  <span>{!result ? '감정 신청' : submitting ? '등록하는 중...' : '공개에 동의하고 랭킹 등록'}</span>
                </button>
              </form>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-flow-col">
            {result && (
              <button
                onClick={onBack}
                className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700 active:scale-95"
              >
                이전 화면으로
              </button>
            )}
            <button
              onClick={onResetAll}
              className="w-full rounded-full border border-zinc-700/60 bg-zinc-800/60 py-3 text-xs font-semibold text-zinc-300 backdrop-blur-md transition hover:bg-zinc-700 active:scale-95"
            >
              {result ? '다시 감정하기' : '첫 화면으로 돌아가기'}
            </button>
          </div>
        </div>

        {/* Right Column: Top 50 Leaderboard */}
        <div data-enter="2" className={result ? "lg:col-span-7" : "ranking-first lg:col-span-7"}>
          <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 backdrop-blur-xl sm:p-7">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-bold tracking-tight text-zinc-200">농도 상위 50명</h3>
              {listData && (
                <span className="text-[11px] text-zinc-400">
                  총 {listData.total.toLocaleString('ko-KR')}명 등록
                </span>
              )}
            </div>

            {list.status === 'loading' && (
              <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/40 p-3 text-center text-xs text-zinc-400">
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
              <div className="mt-4 rounded-2xl border border-zinc-800/60 bg-black/40 p-3 text-center text-xs leading-relaxed text-zinc-400">
                아직 등록된 점수가 없어요.
              </div>
            )}

            {listData && listData.entries.length > 0 && (
              <ol className="ranking-rows" aria-label="농도 랭킹 상위 50명">
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
      {registered && mine && <NoticePopup
        title={`${registered.nickname}님, 랭킹에 등록됐어요`}
        action="내 순위 보기"
        rememberKey={`co:ranking:${registered.id}`}
        onAction={() => myRankPanel.current?.focus()}
      />}
    </div>
  );
}
