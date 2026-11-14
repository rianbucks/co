'use client';

interface S1IntroProps {
  onNext: () => void;
}

export default function S1Intro({ onNext }: S1IntroProps) {
  return (
    <div className="flex flex-col gap-6 p-5 sm:p-7">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-purple-600/15 blur-3xl" />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold text-indigo-300">
            ✨ Voice Dialect Analysis
          </span>

          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            목소리로 판정하는<br />
            <span className="bg-gradient-to-r from-indigo-300 via-white to-purple-300 bg-clip-text text-transparent">
              사투리 원산지 증명서
            </span>
          </h2>

          <p className="mt-3 text-xs leading-relaxed text-zinc-400 sm:text-sm">
            상황극 4문항에 평소 말투로 답변해 보세요.<br />
            AI가 억양과 어휘를 분석해 방언 권역과 농도를 즉시 판정합니다.
          </p>
        </div>
      </div>

      {/* Feature Grid (iOS Widget style) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-md">
          <div className="text-xl">🗺️</div>
          <div className="mt-2 text-xs font-bold text-zinc-200">6개 권역 정밀 분류</div>
          <div className="mt-1 text-[11px] text-zinc-400">
            서울·경기부터 경상, 전라, 충청, 강원, 제주까지 확률 분석
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-md">
          <div className="text-xl">📊</div>
          <div className="mt-2 text-xs font-bold text-zinc-200">4대 지표 정밀 계측</div>
          <div className="mt-1 text-[11px] text-zinc-400">
            어휘, 어미, 음운, 억양 4개 영역별 농도 점수 산출
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-md">
          <div className="text-xl">📜</div>
          <div className="mt-2 text-xs font-bold text-zinc-200">공식 감정서 교부</div>
          <div className="mt-1 text-[11px] text-zinc-400">
            5단계 등급과 전문 소견이 담긴 감정서 발급 및 공유
          </div>
        </div>
      </div>

      {/* Specs bar */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
          <span>소요 시간: 약 1분</span>
        </div>
        <div>설치 · 회원가입 없음</div>
      </div>

      {/* Primary Action Button */}
      <div className="pt-2">
        <button
          onClick={onNext}
          className="group relative flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-lg shadow-white/10 transition-all hover:bg-zinc-200 active:scale-[0.98]"
        >
          <span>감정 시작하기</span>
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>

      {/* Minimal Privacy Assurance */}
      <div className="flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-400">
        <span>🔒</span>
        <span>녹음된 음성은 판정 즉시 메모리에서 폐기되며 저장되지 않습니다.</span>
      </div>
    </div>
  );
}
