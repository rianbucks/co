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
    <header className="w-full border-b border-zinc-800 bg-zinc-950 px-5 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <button
          onClick={onHomeClick}
          aria-label="처음 화면으로"
          className="text-left transition hover:opacity-80"
        >
          <span className="block text-sm font-semibold text-zinc-100">원산지증명서</span>
          <span className="block text-[10px] text-zinc-400">사투리 음성 감정</span>
        </button>

        <nav className="flex items-center gap-3 sm:gap-5">
          {onRankingClick && (
            <button
              onClick={onRankingClick}
              className="whitespace-nowrap text-xs text-zinc-300 underline decoration-zinc-600 underline-offset-4 transition hover:text-white"
            >
              농도 랭킹
            </button>
          )}
          {currentStep && (
            <span
              className={`whitespace-nowrap border-l border-zinc-700 pl-3 text-xs ${
                stopped ? 'text-red-300' : 'text-zinc-400'
              }`}
            >
              {currentStep}
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
