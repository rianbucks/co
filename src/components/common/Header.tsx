'use client';

interface HeaderProps {
  currentStep?: string;
  onHomeClick?: () => void;
}

export default function Header({ currentStep, onHomeClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-black/60 px-5 py-3.5 backdrop-blur-xl transition-all">
      <div className="flex items-center justify-between">
        <button
          onClick={onHomeClick}
          className="flex items-center gap-2 text-left transition hover:opacity-80 active:scale-95"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-xs font-black text-white shadow-md shadow-indigo-500/20">
            C/O
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-zinc-100">원산지증명서</div>
            <div className="text-[10px] font-medium text-zinc-400">사투리 AI 검정원</div>
          </div>
        </button>

        {currentStep && (
          <div className="flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-800/80 px-3 py-1 text-[11px] font-medium text-zinc-300 shadow-inner">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {currentStep}
          </div>
        )}
      </div>
    </header>
  );
}
