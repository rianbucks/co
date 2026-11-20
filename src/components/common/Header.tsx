'use client';

/** 머리글 탭: 일반 감정(S1~S7)과 경상 정밀 감정. */
export type HeaderTab = 'general' | 'gyeongsang';

const TABS: ReadonlyArray<{ key: HeaderTab; label: string; activeClass: string }> = [
  { key: 'general', label: '일반 감정', activeClass: 'bg-white/[0.12] text-white' },
  { key: 'gyeongsang', label: '경상 정밀 감정', activeClass: 'bg-amber-100/[0.12] text-amber-50' },
];

interface HeaderProps {
  currentStep?: string;
  /** 진행이 멈춘 상태(예: 감정 오류). */
  stopped?: boolean;
  onHomeClick?: () => void;
  /** 있으면 '농도 랭킹 보기' 버튼을 보여 준다. */
  onRankingClick?: () => void;
  /** 지금 보고 있는 탭 */
  activeTab?: HeaderTab;
  /** 있으면 '일반 감정'과 '경상 정밀 감정' 탭을 보여 준다. */
  onTabChange?: (tab: HeaderTab) => void;
  /** 녹음이나 심사 중이면 true. 진행 중인 작업을 잃지 않도록 다른 탭을 누를 수 없게 한다. */
  tabsDisabled?: boolean;
}

export default function Header({
  currentStep,
  stopped = false,
  onHomeClick,
  onRankingClick,
  activeTab = 'general',
  onTabChange,
  tabsDisabled = false,
}: HeaderProps) {
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

        <nav className="flex items-center gap-3 sm:gap-5">
          {onRankingClick && (
            <button
              onClick={onRankingClick}
              className="whitespace-nowrap rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-zinc-200 transition hover:bg-white/10"
            >
              농도 랭킹
            </button>
          )}
          {currentStep && (
            <span
              className={`whitespace-nowrap border-l border-zinc-700 pl-3 text-sm ${
                stopped ? 'text-red-300' : 'text-zinc-400'
              }`}
            >
              {currentStep}
            </span>
          )}
        </nav>
      </div>

      {onTabChange && (
        <nav
          aria-label="감정 종류"
          className="mx-auto mt-3 grid max-w-5xl grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
        >
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            const disabled = tabsDisabled && !active;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                disabled={disabled}
                title={disabled ? '녹음이나 심사 중에는 다른 탭으로 이동할 수 없습니다' : undefined}
                onClick={() => {
                  if (!active) onTabChange(tab.key);
                }}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? `${tab.activeClass} font-semibold`
                    : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
                } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-zinc-400`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
