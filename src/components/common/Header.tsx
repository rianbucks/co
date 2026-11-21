'use client';

/** 머리글 탭: 일반 감정(S1~S7)과 경상 정밀 감정. */
export type HeaderTab = 'general' | 'gyeongsang';

const TABS: ReadonlyArray<{ key: HeaderTab; label: string }> = [
  { key: 'general', label: '일반 감정' },
  { key: 'gyeongsang', label: '경상 정밀 감정' },
];

interface HeaderProps {
  currentStep?: string;
  /** 진행이 멈춘 상태(예: 감정 오류). */
  stopped?: boolean;
  onHomeClick?: () => void;
  /** 있으면 랭킹 버튼을 보여 준다. */
  onRankingClick?: () => void;
  /** 랭킹 버튼 글자. 없으면 '농도 랭킹'(경상 정밀 감정 탭은 '정밀 랭킹') */
  rankingLabel?: string;
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
  rankingLabel = '농도 랭킹',
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

        <nav className="app-header-nav flex items-center gap-4 sm:gap-6">
          {onRankingClick && (
            <button
              onClick={onRankingClick}
              className="app-header-link whitespace-nowrap text-sm text-zinc-300 transition hover:text-white"
            >
              {rankingLabel}
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

      {/* 휴대폰의 녹음(S3)과 심사(S4) 화면에서는 CSS가 이 탭 줄을 숨긴다(누를 수 없는 줄이라 화면을 녹음에 쓴다) */}
      {onTabChange && (
        <nav
          aria-label="감정 종류"
          className="app-header-tabs mx-auto mt-3 grid max-w-5xl grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
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
                  active ? 'bg-sky-500/15 font-semibold text-sky-200' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200'
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
