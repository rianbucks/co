'use client';

interface HeaderProps {
  currentStep?: string;
  /** 진행이 멈춘 상태(예: 감정 오류). */
  stopped?: boolean;
  onHomeClick?: () => void;
  /** 있으면 '농도 랭킹 보기' 버튼을 보여 준다. */
  onRankingClick?: () => void;
}

export default function Header({ currentStep, stopped = false, onHomeClick, onRankingClick }: HeaderProps) {
  return (
    <header className="app-header sticky top-0 z-30 w-full border-b px-5 py-3.5 sm:px-7">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <button
          onClick={onHomeClick}
          aria-label="처음 화면으로"
          className="text-left transition hover:opacity-80"
        >
          <span className="block text-base font-semibold tracking-tight text-zinc-100">원산지증명서</span>
          <span className="block text-xs text-zinc-400">사투리 음성 감정</span>
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
