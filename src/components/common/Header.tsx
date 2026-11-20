'use client';

interface HeaderProps {
  currentStep?: string;
  /** 진행이 멈춘 상태(예: 감정 오류). 점을 깜빡이지 않고 빨갛게 보여 준다. */
  stopped?: boolean;
  onHomeClick?: () => void;
}

export default function Header({ currentStep, stopped = false, onHomeClick }: HeaderProps) {
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
          <div
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium shadow-inner ${
              stopped ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-zinc-700/60 bg-zinc-800/80 text-zinc-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${stopped ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
            {currentStep}
          </div>
        )}
      </div>
    </header>
  );
}
