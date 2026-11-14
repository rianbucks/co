'use client';

interface HeaderProps {
  currentStep?: string;
}

export default function Header({ currentStep }: HeaderProps) {
  return (
    <header className="border-b-2 border-stone-800 bg-stone-100 px-4 py-3 text-stone-900">
      <div className="flex items-center justify-between text-[11px] font-mono text-stone-600">
        <span>서식 제2026-CO호</span>
        <span className="font-semibold text-stone-800">[공공서식 표준규격]</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <h1 className="text-base font-bold tracking-tight text-stone-900">
          국립방언품질평가원 <span className="text-xs font-normal text-stone-600">| 원산지증명서</span>
        </h1>
        {currentStep && (
          <span className="rounded border border-stone-400 bg-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-700">
            {currentStep}
          </span>
        )}
      </div>
    </header>
  );
}
