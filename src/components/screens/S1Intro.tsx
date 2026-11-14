'use client';

interface S1IntroProps {
  onNext: () => void;
}

export default function S1Intro({ onNext }: S1IntroProps) {
  return (
    <div className="p-5 sm:p-7 lg:p-10">
      {/* Responsive Container: Mobile (Single col) / Desktop (2-Column Grid) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 items-stretch">
        
        {/* Left Column: Hero Showcase */}
        <div className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8 lg:col-span-7 lg:p-10">
          <div className="absolute -right-10 -top-10 h-52 w-52 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
          <div className="absolute -left-10 -bottom-10 h-52 w-52 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />

          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300">
              ✨ Voice Dialect AI Engine
            </span>

            <h2 className="mt-5 text-2xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl lg:leading-[1.15]">
              목소리로 판정하는<br />
              <span className="bg-gradient-to-r from-indigo-300 via-white to-purple-300 bg-clip-text text-transparent">
                사투리 원산지 증명서
              </span>
            </h2>

            <p className="mt-4 text-xs leading-relaxed text-zinc-400 sm:text-sm lg:text-base">
              오랜만에 온 친구의 전화, 겨울에 반팔 입는 동생 등 4개 일상 상황극에 평소 말투로 답해 보세요.<br className="hidden sm:inline" />
              AI가 말소리의 어휘, 종결어미, 억양 곡선을 정밀 분석하여 출신 권역과 농도를 감정합니다.
            </p>
          </div>

          {/* Desktop Visual Indicator: 6 Regions Tags */}
          <div className="mt-8 border-t border-zinc-800/80 pt-6">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              분석 대상 6대 권역
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {['서울·경기', '경상도', '전라도', '충청도', '강원도', '제주도'].map((region) => (
                <span
                  key={region}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 shadow-sm"
                >
                  {region}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Key Features & Primary Action Card */}
        <div className="flex flex-col justify-between gap-4 rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-xl sm:p-8 lg:col-span-5">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-zinc-200">
              간편한 3단계 감정 절차
            </h3>

            {/* Feature Cards */}
            <div className="mt-4 space-y-3">
              <div className="flex items-start gap-3.5 rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5 transition hover:border-zinc-700">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-lg">
                  🎙️
                </span>
                <div>
                  <div className="text-xs font-bold text-zinc-100">4문항 상황극 구술</div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    문항당 10초씩 편안하게 본인 사투리로 대화
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5 transition hover:border-zinc-700">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-lg">
                  🧠
                </span>
                <div>
                  <div className="text-xs font-bold text-zinc-100">4대 지표 정밀 계측</div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    어휘, 어미, 음운, 억양 4개 차원 농도 수치화
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3.5 rounded-2xl border border-zinc-800/60 bg-black/40 p-3.5 transition hover:border-zinc-700">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-lg">
                  📜
                </span>
                <div>
                  <div className="text-xs font-bold text-zinc-100">공식 감정서 교부</div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    5단계 공식 등급과 근거 분석이 담긴 증명서 발급
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button & Meta info */}
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-zinc-800/40 px-3.5 py-2 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>총 소요시간: 약 1분</span>
              </div>
              <div>설치·가입 없음</div>
            </div>

            <button
              onClick={onNext}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-white py-4 text-sm font-bold text-black shadow-xl shadow-white/10 transition-all hover:bg-zinc-200 active:scale-[0.98]"
            >
              <span>감정 시작하기</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>

            <div className="text-center text-[11px] text-zinc-400">
              🔒 녹음 음성은 판정 후 즉시 메모리에서 폐기됩니다.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
