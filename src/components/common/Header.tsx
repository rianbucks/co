'use client';

interface HeaderProps {
  currentStep?: string;
  /** 진행이 멈춘 상태(예: 감정 오류). */
  stopped?: boolean;
  onBack: () => void;
  /** 있으면 '농도 랭킹 보기' 버튼을 보여 준다. */
  onRankingClick?: () => void;
}

export default function Header({ currentStep, stopped = false, onBack, onRankingClick }: HeaderProps) {
  return (
    <header className="app-header sticky top-0 z-30">
      <div className="flex items-center justify-between gap-3">
        <button type="button" aria-label="이전 화면으로" onClick={onBack}
          className="inline-flex size-11 items-center justify-center text-zinc-100">
          <svg className="nav-chevron nav-chevron-back" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="m15 4-8 8 8 8" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <nav className="app-header-nav flex items-center gap-4 sm:gap-6">
          {onRankingClick && (
            <button
              onClick={onRankingClick}
              className="app-header-link whitespace-nowrap text-sm text-zinc-300 transition hover:text-white"
            >
              농도 랭킹
            </button>
          )}
          {currentStep && (
            <span
              className={`app-header-step whitespace-nowrap text-sm ${stopped ? 'text-red-300' : 'text-zinc-500'}`}
            >
              {currentStep}
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
