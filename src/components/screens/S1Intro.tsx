'use client';

interface S1IntroProps {
  onNext: () => void;
}

export default function S1Intro({ onNext }: S1IntroProps) {
  return (
    <div className="flex flex-col gap-5 p-4 text-stone-900">
      {/* 서류 공고문 상단 박스 */}
      <div className="border border-stone-400 bg-white p-4 shadow-xs">
        <div className="text-center">
          <div className="inline-block border-b border-stone-400 pb-1 text-xs font-semibold tracking-widest text-stone-600">
            공 고 제 2026 - 1114 호
          </div>
          <h2 className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">
            방언 권역 및 농도 감정 신청
          </h2>
          <p className="mt-1 text-xs text-stone-600">
            음성 분석 기반 사투리 권역 및 농도 판정 및 감정서 교부
          </p>
        </div>

        <hr className="my-3 border-stone-200" />

        {/* 규격 안내 테이블 */}
        <div className="overflow-hidden rounded border border-stone-300 text-xs">
          <table className="w-full border-collapse text-left">
            <tbody>
              <tr className="border-b border-stone-200">
                <th className="w-24 bg-stone-100 p-2 font-semibold text-stone-700">신청 사무</th>
                <td className="p-2 text-stone-800">한국어 방언 원산지증명서 발급</td>
              </tr>
              <tr className="border-b border-stone-200">
                <th className="bg-stone-100 p-2 font-semibold text-stone-700">감정 대상</th>
                <td className="p-2 text-stone-800">6개 권역 (서울경기, 강원, 충청, 경상, 전라, 제주)</td>
              </tr>
              <tr className="border-b border-stone-200">
                <th className="bg-stone-100 p-2 font-semibold text-stone-700">감정 지표</th>
                <td className="p-2 text-stone-800">어휘, 어미, 음운, 억양 4개 영역 정밀 계측</td>
              </tr>
              <tr className="border-b border-stone-200">
                <th className="bg-stone-100 p-2 font-semibold text-stone-700">소요 시간</th>
                <td className="p-2 text-stone-800">약 1분 (상황극 4문항 × 각 10초 녹음)</td>
              </tr>
              <tr>
                <th className="bg-stone-100 p-2 font-semibold text-stone-700">수 수 료</th>
                <td className="p-2 font-medium text-emerald-800">면제 (대회 기간 한정)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 안내 사항 */}
        <div className="mt-4 rounded bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-600">
          <p className="font-semibold text-stone-800">※ 신청인 유의사항</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>본 감정은 마이크 녹음이 가능한 모바일 브라우저 환경에서 진행됩니다.</li>
            <li>녹음된 음성은 판정 즉시 폐기되며 영구 저장되지 않습니다(랭킹 등록 희망 시 별도 동의).</li>
            <li>판정 결과는 공인 규격 서식의 감정서(PNG)로 발급 및 공유 가능합니다.</li>
          </ul>
        </div>

        {/* 관인 도장 연출 */}
        <div className="mt-5 flex items-center justify-between border-t border-dashed border-stone-300 pt-3 text-xs text-stone-600">
          <div>
            발행처: 국립방언품질평가원장<br />
            감정관: AI 전문감정위원회
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-700 font-serif text-[10px] font-bold text-red-700">
            방언원인
          </div>
        </div>
      </div>

      {/* 신청 버튼 */}
      <button
        onClick={onNext}
        className="w-full rounded bg-stone-900 py-3.5 text-sm font-bold tracking-wide text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.99]"
      >
        감정 신청서 작성 및 접수 (시작)
      </button>

      <p className="text-center text-[11px] text-stone-500">
        별도의 회원가입이나 개인정보 입력 없이 즉시 진행됩니다.
      </p>
    </div>
  );
}
