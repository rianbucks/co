'use client';

import { JudgeResult } from '@/lib/judge/contract';
import { REGION_KOREAN_NAMES, PART_KOREAN_NAMES } from '@/types/screen';

interface S5ResultProps {
  result: JudgeResult;
  onGoToCertificate?: () => void;
  onResetAll: () => void;
}

export default function S5Result({ result, onGoToCertificate, onResetAll }: S5ResultProps) {
  const { region, intensity, evidence, opinion, transcript, certificateNo, issuedAt } = result;

  // 발급 일시 포맷 (YYYY년 MM월 DD일 HH:mm)
  const formattedDate = new Date(issuedAt).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // 권역 확률 정렬 (높은 순서대로)
  const probEntries = Object.entries(region.probabilities).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4 p-4 text-stone-900">
      {/* 공식 결과 통지서 카드 */}
      <div className="border border-stone-400 bg-white p-4 shadow-xs">
        {/* 상단 서식 헤더 */}
        <div className="border-b border-stone-300 pb-2 text-center">
          <div className="flex justify-between text-[11px] font-mono text-stone-500">
            <span>문서번호: {certificateNo}</span>
            <span>일자: {formattedDate}</span>
          </div>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">
            방언 감정 결과 통지서
          </h2>
          <p className="mt-0.5 text-xs text-stone-600">
            인공지능 다차원 음성 계측에 따른 방언 원산지 판정 결과입니다.
          </p>
        </div>

        {/* 1. 핵심 판정 결과 요약 (지역 및 농도) */}
        <div className="my-4 rounded border-2 border-stone-800 bg-stone-50 p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-stone-600">최종 판정 권역</span>
              <div className="mt-0.5 text-2xl font-black text-stone-900">
                {region.mixed ? '혼합 방언' : region.label}
              </div>
            </div>
            {/* 등급 스탬프 */}
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-red-700 bg-red-50/50 px-3 py-1.5 text-red-800">
              <span className="text-[10px] font-bold tracking-wider">농도 {intensity.grade}등급</span>
              <span className="text-xs font-black">{intensity.gradeName}</span>
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between border-t border-stone-200 pt-2 text-xs">
            <span className="text-stone-600">방언 농도 총점</span>
            <div className="text-right">
              <span className="font-mono text-xl font-black text-stone-900">{intensity.score}</span>
              <span className="text-stone-600"> / 100점</span>
            </div>
          </div>
        </div>

        {/* 2. 6대 권역 확률 분포 바 */}
        <div className="mt-4">
          <h3 className="text-xs font-bold text-stone-800">[6대 권역별 추정 확률]</h3>
          <div className="mt-2 space-y-2 rounded border border-stone-200 bg-stone-50/60 p-3">
            {probEntries.map(([regKey, prob]) => {
              const label = REGION_KOREAN_NAMES[regKey] || regKey;
              const isTop = regKey === region.top;

              return (
                <div key={regKey} className="text-xs">
                  <div className="flex justify-between font-medium">
                    <span className={isTop ? 'font-bold text-stone-900' : 'text-stone-600'}>
                      {label} {isTop && '★ (1순위)'}
                    </span>
                    <span className="font-mono text-stone-700">{prob}%</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isTop ? 'bg-stone-900' : 'bg-stone-400'
                      }`}
                      style={{ width: `${prob}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. 4대 세부 영역 점수 (어휘, 어미, 음운, 억양) */}
        <div className="mt-4">
          <h3 className="text-xs font-bold text-stone-800">[4대 영역별 세부 계측 점수]</h3>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
            {Object.entries(intensity.parts).map(([key, val]) => (
              <div key={key} className="rounded border border-stone-300 bg-stone-50 p-2">
                <div className="text-[11px] text-stone-600">{PART_KOREAN_NAMES[key] || key}</div>
                <div className="mt-1 font-mono text-base font-bold text-stone-900">{val}점</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. 음성 받아쓰기 및 근거 인용 */}
        {transcript && (
          <div className="mt-4 rounded border border-stone-300 bg-stone-50 p-3">
            <h3 className="text-xs font-bold text-stone-800">[구술 음성 채록문 (Transcript)]</h3>
            <p className="mt-1.5 text-xs leading-relaxed font-serif text-stone-800 bg-white p-2.5 rounded border border-stone-200">
              &quot;{transcript}&quot;
            </p>
          </div>
        )}

        {/* 5. 감정 근거 목록 */}
        {evidence && evidence.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-bold text-stone-800">[주요 판정 근거 (Evidence)]</h3>
            <div className="mt-2 space-y-1.5 text-xs">
              {evidence.map((item, idx) => (
                <div key={idx} className="rounded border border-stone-200 bg-stone-50 p-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-stone-900">
                    <span className="rounded bg-stone-200 px-1 py-0.5 text-[10px] text-stone-700">
                      {PART_KOREAN_NAMES[item.type] || item.type}
                    </span>
                    <span className="text-red-700 font-mono">&quot;{item.quote}&quot;</span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-600 pl-1">
                    ↳ {item.note}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. 종합 감정 소견 */}
        <div className="mt-4 rounded border border-stone-300 bg-stone-100 p-3 text-xs leading-relaxed">
          <div className="font-bold text-stone-900">[감정관 종합 소견]</div>
          <p className="mt-1 text-stone-800 font-serif">
            {opinion}
          </p>
        </div>

        {/* 하단 관인 서명 */}
        <div className="mt-5 flex items-center justify-between border-t border-dashed border-stone-300 pt-3 text-xs text-stone-600">
          <div>
            발급기관: 국립방언품질평가원<br />
            수석감정관: AI 전문감정위원회
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-700 font-serif text-[10px] font-bold text-red-700">
            방언원인
          </div>
        </div>
      </div>

      {/* 하단 조작 버튼 */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => {
            if (onGoToCertificate) onGoToCertificate();
            else alert('감정서(S6) 정식 발급 및 이미지 저장 기능은 다음 단계에서 구현될 예정입니다.');
          }}
          className="w-full rounded bg-stone-900 py-3.5 text-sm font-bold text-white shadow-xs transition hover:bg-stone-800 active:scale-[0.99]"
        >
          원산지증명서 발급 및 확인 (S6)
        </button>
        <button
          onClick={onResetAll}
          className="w-full rounded border border-stone-400 bg-white py-3 text-xs font-bold text-stone-800 shadow-xs hover:bg-stone-50"
        >
          새로운 감정 재신청
        </button>
      </div>
    </div>
  );
}
