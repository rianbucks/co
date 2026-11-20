'use client';

interface S1IntroProps {
  onNext: () => void;
  /** 감정 없이 농도 랭킹(S7)을 본다. */
  onViewRanking: () => void;
}

const REGIONS = ['서울·경기', '강원', '충청', '경상', '전라', '제주'];

const STEPS = [
  { title: '네 가지 질문에 답하기', detail: '문항마다 최대 10초, 평소 말투로 답합니다.' },
  { title: '말소리 특징 살펴보기', detail: '어휘, 어미, 음운, 억양을 함께 확인합니다.' },
  { title: '결과 확인하기', detail: '권역별 결과와 농도 점수를 확인하고 저장합니다.' },
];

export default function S1Intro({ onNext, onViewRanking }: S1IntroProps) {
  return (
    <div className="screen-glass mx-auto w-full max-w-6xl p-5 sm:p-8 lg:p-12">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
        <section className="glass-panel flex flex-col justify-between p-6 sm:p-9 lg:col-span-7 lg:p-11">
          <div>
            <p className="text-sm font-medium tracking-wide text-sky-200/80">원산지증명서 · 방언 감정 안내</p>
            <h1 className="mt-5 max-w-2xl text-balance text-3xl font-semibold leading-[1.18] tracking-tight text-white sm:text-4xl lg:text-[3.25rem]">
              평소 말투에 담긴
              <br />
              지역의 특징을 살펴봅니다
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-zinc-300">
              네 가지 일상 상황에 평소 말투로 답해 주세요. 녹음된 말소리를 바탕으로 방언의 특징과
              권역별 결과, 농도 점수를 안내합니다.
            </p>
          </div>

          <div className="mt-10 border-t border-white/10 pt-5">
            <h2 className="text-sm font-semibold text-zinc-300">확인하는 권역</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-base text-zinc-200 sm:grid-cols-3">
              {REGIONS.map((region) => (
                <li key={region} className="border-b border-white/10 py-2">
                  {region}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="glass-panel flex flex-col justify-between p-6 sm:p-8 lg:col-span-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">진행 순서</h2>
            <ol className="mt-3 divide-y divide-white/10">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4 py-4">
                  <span className="pt-0.5 font-mono text-xs text-zinc-500">
                    0{index + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-medium text-zinc-100">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-6 space-y-3">
            <p className="border-t border-white/10 pt-4 text-sm text-zinc-400">
              예상 시간 약 1분 · 설치나 회원가입이 필요하지 않습니다.
            </p>
            <button
              onClick={onNext}
              className="w-full rounded-xl border border-white/20 bg-sky-100/90 px-4 py-3.5 text-base font-semibold text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_24px_rgba(91,145,204,0.18)] transition hover:bg-white"
            >
              감정 신청
            </button>
            <button
              onClick={onViewRanking}
              className="w-full rounded-xl border border-white/15 bg-white/[0.045] px-4 py-3 text-base font-medium text-zinc-200 transition hover:bg-white/10"
            >
              농도 랭킹 보기
            </button>
            <p className="text-center text-sm leading-6 text-zinc-400">
              녹음 음성은 판정 처리 후 서버에 보관하지 않습니다.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
