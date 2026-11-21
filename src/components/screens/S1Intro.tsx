'use client';

import BrandInfo from '@/components/common/BrandInfo';

import { useEffect, useRef, useState } from 'react';
import NoticePopup from '@/components/common/NoticePopup';
import NicknameInvite from '@/components/common/NicknameInvite';
import styles from './IntroHero.module.css';
import { GRADE_TABLE, REGION_NAMES } from '@/lib/judge/rules';
import { GENERAL_QUESTIONS as QUESTIONS } from '@/lib/judge/questions';
import DesktopIntroDetails from '@/components/common/DesktopIntroDetails';

interface S1IntroProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  onStartGyeongsang: () => void;
  onNext: () => void;
  onViewRanking: () => void;
}

const STEPS = [
  ['말하기', '친구에게 전화가 온 상황처럼, 질문마다 최대 10초 동안 답해요.'],
  ['말투 분석', 'AI가 어휘와 어미, 발음과 억양을 살펴 6개 지역과 비교해요.'],
  ['감정서 받기', '가까운 지역과 사투리 농도를 보고 감정서를 이미지로 저장해요.'],
];

// 행정 경계를 생략하고 각 방언 지역의 대략적인 위치를 표시한다.
const MAP_POINTS = [
  { region: 'seoul_gyeonggi', x: 112, y: 61, left: true },
  { region: 'gangwon', x: 159, y: 47, left: false },
  { region: 'chungcheong', x: 117, y: 102, left: true },
  { region: 'gyeongsang', x: 166, y: 139, left: false },
  { region: 'jeolla', x: 109, y: 156, left: true },
  { region: 'jeju', x: 95, y: 217, left: true },
] as const;

function RegionDiagram({ miniature = false }: { miniature?: boolean }) {
  return (
    <svg viewBox={miniature ? '73 9 125 221' : '0 0 272 235'}
      className={miniature ? styles.miniMap : styles.map}
      role={miniature ? undefined : 'img'} aria-hidden={miniature || undefined}
      aria-label={miniature ? undefined : '대한민국 지원 지역 지도. 북서쪽 서울·경기, 북동쪽 강원, 중서부 충청, 동남쪽 경상, 남서쪽 전라, 남쪽 섬 제주.'}>
      <g fill="#39607f" stroke="#91c8e2" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M88 55 L98 48 96 41 105 38 109 31 120 34 129 30 140 31 149 26 158 14
          Q165 31 174 43 Q188 65 191 83 L189 104 192 118 188 130 195 127 192 142
          185 151 181 166 170 172 165 178 155 175 151 183 143 179 138 185 132 179
          127 188 121 183 114 192 109 186 99 195 95 189 88 195 87 186 81 189
          85 179 79 178 86 171 82 165 91 157 88 152 95 144 93 135 100 127
          96 120 94 112 87 111 91 104 83 97 88 90 93 94 95 87 105 86 101 79
          94 76 99 70 94 66 97 62 Z" />
        <ellipse cx="95" cy="217" rx="15" ry="6" transform="rotate(-13 95 217)" />
      </g>
      {!miniature && MAP_POINTS.map(({ region, x, y, left }) => (
        <g key={region}>
          <path d={`M ${x} ${y} H ${left ? 69 : 212}`} stroke="#9ac6df" fill="none" />
          <circle cx={x} cy={y} r="3.5" fill="#a1f2dc" stroke="#122c40" />
          <text x={left ? 63 : 218} y={y + 5} textAnchor={left ? 'end' : 'start'}
            fill="#e8f4ff" fontSize="14" fontWeight="600">
            {region === 'seoul_gyeonggi' ? '서울·경기' : REGION_NAMES[region]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function S1Intro({ onStartGyeongsang, onNext, onViewRanking, nickname, onNicknameChange }: S1IntroProps) {
  const invite = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('co:gs-invite-seen')) return;
    } catch { /* 저장소 없이도 초대 화면을 사용할 수 있다. */ }
    const timer = window.setTimeout(() => {
      if (document.hidden || document.activeElement !== document.body || document.querySelector('dialog[open]')) return;
      invite.current?.showModal();
      try { sessionStorage.setItem('co:gs-invite-seen', '1'); } catch {}
    }, 1300);
    return () => window.clearTimeout(timer);
  }, []);

  const sheet = useRef<HTMLDialogElement>(null);
  const [panel, setPanel] = useState<'questions' | 'guide' | 'regions' | 'grades'>('questions');
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = QUESTIONS[questionIndex];
  function preview(index: number) {
    setPanel('questions');
    setQuestionIndex(index);
    sheet.current?.showModal();
  }

  function openInfo(kind: 'guide' | 'regions' | 'grades') {
    setPanel(kind);
    sheet.current?.showModal();
  }

  return (
    <div className="intro-page">
      <header className="intro-masthead">
        <BrandInfo />
        <button onClick={onViewRanking} className="ranking-link">농도 랭킹 <span className="nav-chevron" aria-hidden="true">›</span></button>
      </header>
      <div className="intro-layout">
        <section data-enter="1" className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.pitch}>
            <p className={styles.meta}>사투리 음성 테스트 · 약 1분</p>
            <h1 id="hero-heading">내 말투는 어디에 <br />가까울까?</h1>
            <p className={styles.lead}>{QUESTIONS.length}개 문항에 평소 말투로 답해 보세요. 어떤 지역의 표현을 쓰는지, 사투리가 얼마나 진한지 알려드려요.</p>
          </div>
          <figure className={styles.ticket}>
            <figcaption>음성 감정서 <span>결과 예시</span></figcaption>
            <div className={styles.reading}>
              <div><small>가장 가까운 말투</small><strong>경상 방언</strong></div>
              <div><small>사투리 농도</small><strong>68<small> / 100</small></strong></div>
            </div>
            <div className={styles.gauge} aria-hidden="true" />
            <p>4등급 · 자막 필요</p>
          </figure>
        </section>
        <NicknameInvite nickname={nickname} onStart={value => { onNicknameChange(value); onNext(); }} />
        <section className={styles.guide} aria-label="감정 이용 안내">
          <button data-enter="3" className={styles.infoCard} aria-haspopup="dialog" onClick={() => openInfo('guide')}>
            <span className={styles.bars} aria-hidden="true"><i /><i /><i /><i /></span>
            <span><strong>이렇게 진행해요</strong><small>{QUESTIONS.length}문항 · 문항당 최대 10초</small></span>
            <span className={`nav-chevron ${styles.cardArrow}`} aria-hidden="true">›</span>
          </button>
          <button className={styles.infoCard} aria-haspopup="dialog" data-enter="4" onClick={() => openInfo('regions')}>
            <RegionDiagram miniature />
            <span><strong>지원 지역</strong><small>서울·경기부터 제주까지 6개 지역</small></span>
            <span className={`nav-chevron ${styles.cardArrow}`} aria-hidden="true">›</span>
          </button>
        </section>
        <DesktopIntroDetails onViewRanking={onViewRanking} onPreview={preview} />
      </div>
      <div className="home-notices">
        <NoticePopup highlighted title="어떤 질문이 나올까요?" action="첫 문항 미리보기" rememberKey="co:intro-preview-dismissed" onAction={() => preview(0)} />
      </div>
      <dialog ref={invite} className={`discard-dialog ${styles.invite}`} aria-labelledby="gs-invite-title" aria-describedby="gs-invite-copy">
        <h2 id="gs-invite-title">경상권이신가요?</h2>
        <p id="gs-invite-copy">내 말투가 경북과 경남 중 어디에 더 가까운지 알아보세요.</p>
        <div className={styles.inviteActions}>
          <button type="button" className="secondary-action-button" onClick={() => invite.current?.close()}>괜찮아요</button>
          <button type="button" className="intro-primary-action" onClick={() => { invite.current?.close(); onStartGyeongsang(); }}>경상권 정밀 감정 받기</button>
        </div>
      </dialog>
      <dialog ref={sheet} className="discard-dialog preview-sheet" aria-labelledby="preview-heading"
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) sheet.current?.close();
        }}>
        <div className="sheet-title"><h2 id="preview-heading">{{ guide: '이렇게 진행해요', regions: '지원 지역', grades: '농도별 등급 기준', questions: '녹음 문항 미리보기' }[panel]}</h2>
          <button aria-label="닫기" onClick={() => sheet.current?.close()}>닫기</button>
        </div>
        {panel === 'guide' ? (
          <div className="sheet-guide">
            <ol className={styles.timeline}>{STEPS.map(([title, detail], index) => <li key={title}><b aria-hidden="true">{index + 1}</b><div><strong>{title}</strong><small>{detail}</small></div></li>)}</ol>
            <p><strong>녹음과 공개 범위</strong><br />동의하면 녹음이 Google Gemini로 전송돼요. 판정 후 이 서비스 서버에는 음성을 보관하지 않아요. 랭킹은 원할 때만 등록해요.</p>
            <button className={styles.gradeLink} onClick={() => preview(0)}>문항 미리보기</button>
            <button className={styles.gradeLink} onClick={() => setPanel('grades')}>농도별 등급 기준 보기</button>
          </div>
        ) : panel === 'regions' ? (
          <div className="sheet-guide">
            <figure className={styles.regionDiagram}><RegionDiagram /></figure>
            <p>녹음한 말투를 이 여섯 지역의 표현과 비교해요. 두 지역의 특징이 비슷하면 ‘혼합 방언’으로 표시돼요.</p>
            <button className={styles.gradeLink} onClick={() => { sheet.current?.close(); onStartGyeongsang(); }}>경상권 정밀 감정 받기</button>
          </div>
        ) : panel === 'grades' ? (
          <ul className="sheet-grades">{GRADE_TABLE.map(({grade, name, min, max}) => (
            <li key={grade}><strong>{grade}등급</strong><span>{name}</span><small>{min}~{max}점</small></li>
          ))}</ul>
        ) : <>
        <div className="question-picker" aria-label="문항 선택" role="group">
          {QUESTIONS.map(({ id }, index) => <button key={id} aria-pressed={index === questionIndex} onClick={() => setQuestionIndex(index)}>{id}번</button>)}
        </div>
        <div className="preview-prompt" aria-live="polite"><strong>{question.target}에게 · {question.kind === 'convert' ? '평소 말투로 바꿔 말하기' : '상황에 답하기'}</strong><p>{question.situation}</p></div>
        </>}
        <button className="intro-primary-action" onClick={() => { sheet.current?.close(); onNext(); }}>감정 신청</button>
      </dialog>
    </div>
  );
}
