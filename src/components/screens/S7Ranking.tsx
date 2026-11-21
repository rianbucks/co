'use client';

import RankingForm from '@/components/common/RankingForm';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { JudgeResult } from '@/lib/judge/contract';
import type { RankingEntryView, RankingList, RankingRegistered } from '@/lib/ranking/contract';
import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, checkNickname } from '@/lib/ranking/nickname';
import { regionVerdictLabel } from '@/lib/judge/rules';
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
      if (reason === 'uncertain') return '판정 유보 결과는 랭킹에 등록할 수 없습니다.';
      return reason === 'mock'
        ? '가짜 응답 모드(MOCK)로 받은 결과는 랭킹에 등록할 수 없습니다.'
        : '이 감정 결과는 랭킹에 등록할 수 없습니다.';
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

  const handleReload = () => {
    setList({ status: 'loading' });
    setReloadKey((key) => key + 1);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (result?.region.uncertain || submitting || entryId || formError?.final) return;

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
            <h2 className="ranking-card-title">
              {!result ? '일반 감정 신청' : mine ? '랭킹 등록 완료' : '랭킹에 등록하기'}
            </h2>

            {/* My Judgment Summary */}
            {result && (
              <div className="ranking-glow mt-3 p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-400">내 감정 결과</span>
                  <span className="font-medium text-zinc-200">{regionVerdictLabel(result.region)}</span>
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

            {result?.region.uncertain ? <p>판정 유보 결과는 랭킹에 등록할 수 없습니다.</p> : mine ? (
              <div ref={myRankPanel} tabIndex={-1} className="ranking-glow mt-3 p-4 text-left" data-mine>
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
              <div className="mt-3 rounded-2xl border border-zinc-800/60 bg-black/40 p-4 text-left text-xs text-zinc-400">
                내 순위를 불러오는 중입니다...
              </div>
            ) : (
              <RankingForm
                inputId="ranking-nickname"
                nickname={nickname}
                onChange={value => {
                  onNicknameChange(value);
                  if (formError && !formError.final) setFormError(null);
                }}
                onSubmit={handleSubmit}
                disabled={submitDisabled}
                error={formError?.message}
                disclosure={result && <>
                  등록하면 <span className="font-semibold text-zinc-200">닉네임, 농도, 지역, 등급, 등록 시각</span>이
                  랭킹에 공개됩니다. 음성과 받아쓰기는 저장하지 않으며, 기록은 대회 종료 후 1주 안에 모두 삭제합니다.
                  부적절한 닉네임은 운영자가 삭제할 수 있습니다.
                </>}
                action={!result ? '일반 감정 시작' : submitting ? '등록하는 중...' : '공개에 동의하고 랭킹 등록'}
              />
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-flow-col">
            {result && (
              <button
                onClick={onBack}
                className="ranking-form-action secondary-action-button"
              >
                이전 화면으로
              </button>
            )}
            <button
              onClick={onResetAll}
              className="ranking-form-action secondary-action-button"
            >
              {result ? '다시 감정하기' : '첫 화면으로 돌아가기'}
            </button>
          </div>
        </div>

        {/* Right Column: Top 50 Leaderboard */}
        <div data-enter="2" className={result ? "lg:col-span-7" : "ranking-first lg:col-span-7"}>
          <section aria-labelledby="general-ranking-heading" className="rounded-3xl border border-zinc-800/80 bg-zinc-900/60 p-6 sm:p-7">
            <h1 className="ranking-card-title" id="general-ranking-heading">일반 감정 랭킹</h1>
            <p className="mt-2 text-xs text-zinc-500">사투리 농도가 높은 순서예요. 점수가 같으면 먼저 등록한 사람이 앞서요.</p>
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
              <ol className="ranking-list mt-4" aria-label="농도 랭킹 상위 50명">
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
          </section>
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
