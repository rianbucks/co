'use client';

import { useEffect, useState } from 'react';
import { GENERAL_QUESTIONS as QUESTIONS } from '@/lib/judge/questions';
import { GRADE_TABLE } from '@/lib/judge/rules';
import type { RankingEntryView, RankingList } from '@/lib/ranking/contract';
import RankingRow from './RankingRow';

type Preview = { entries: RankingEntryView[] } | { message: string };

export default function DesktopIntroDetails({ onViewRanking, onPreview }: { onViewRanking: () => void; onPreview: (index: number) => void }) {
  const [ranking, setRanking] = useState<Preview>({ message: '순위를 불러오는 중이에요.' });

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    let request: AbortController | undefined;

    async function refresh() {
      request?.abort();
      if (!desktop.matches) return;

      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch('/api/ranking?limit=3', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('랭킹 조회 실패');
        const { entries } = await response.json() as RankingList;
        if (!controller.signal.aborted) {
          setRanking(entries.length ? { entries } : { message: '아직 등록된 점수가 없어요.' });
        }
      } catch {
        if (!controller.signal.aborted) setRanking({ message: '지금은 순위를 불러올 수 없어요.' });
      }
    }

    void refresh();
    desktop.addEventListener('change', refresh);
    return () => {
      desktop.removeEventListener('change', refresh);
      request?.abort();
    };
  }, []);

  return (
    <div data-enter="5" className="desktop-intro-details">
      <section className="question-preview" aria-labelledby="questions-heading">
        <h2 id="questions-heading">녹음 문항 미리보기</h2>
        <ol>
          {QUESTIONS.map(({ id, target, situation }, index) => (
            <li key={id}>
              <span className="preview-number" aria-hidden="true">{id}</span>
              <div><button className="question-link" onClick={() => onPreview(index)} aria-label={target + ' 문항 미리보기'} aria-haspopup="dialog">{target} <span className="nav-chevron" aria-hidden="true">↗</span></button><p>{situation}</p></div>
            </li>
          ))}
        </ol>
      </section>
      <div className="intro-reference">
        <section aria-labelledby="ranking-heading">
          <div className="ranking-heading">
            <h2 id="ranking-heading">농도 랭킹 상위 3명</h2>
            <button onClick={onViewRanking} aria-label="농도 랭킹 전체 보기">전체 보기 <span className="nav-chevron" aria-hidden="true">›</span></button>
          </div>
          {'entries' in ranking ? (
            <ol className="ranking-rows">
              {ranking.entries.map((entry) => <RankingRow key={entry.id} item={entry} />)}
            </ol>
          ) : <p className="ranking-message" role="status">{ranking.message}</p>}
        </section>
        <section>
          <h2>농도별 등급 기준</h2>
          <ul className="grade-list">
            {GRADE_TABLE.map(({ grade, min, max, name }) => (
              <li key={grade}><strong>{grade}등급</strong><span>{name}</span><small>{min}~{max}점</small></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
