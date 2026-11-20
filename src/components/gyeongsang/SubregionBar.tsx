import { SUBREGION_NAMES, type SubregionRatios } from '@/lib/gyeongsang/contract';

/** 경북권과 경남권의 색. 결과 화면(어두운 배경)과 감정서(종이)에서 같은 색 계열을 쓴다. */
export const SUBREGION_COLORS = {
  dark: { gyeongbuk: 'bg-amber-400', gyeongnam: 'bg-teal-400', track: 'bg-zinc-800' },
  paper: { gyeongbuk: 'bg-[#b7791f]', gyeongnam: 'bg-[#2f6f73]', track: 'bg-[#e5dccb]' },
} as const;

interface SubregionBarProps {
  subregions: SubregionRatios;
  variant?: keyof typeof SUBREGION_COLORS;
}

/** 감정 성분 막대: 왼쪽이 경북권, 오른쪽이 경남권이고 두 비율의 합은 100이다. */
export default function SubregionBar({ subregions, variant = 'dark' }: SubregionBarProps) {
  const colors = SUBREGION_COLORS[variant];
  const label = `${SUBREGION_NAMES.gyeongbuk} ${subregions.gyeongbuk}%, ${SUBREGION_NAMES.gyeongnam} ${subregions.gyeongnam}%`;
  return (
    <div>
      <div role="img" aria-label={label} className={`flex h-3.5 w-full overflow-hidden rounded-full ${colors.track}`}>
        <div className={`h-full ${colors.gyeongbuk}`} style={{ width: `${subregions.gyeongbuk}%` }} />
        <div className={`h-full ${colors.gyeongnam}`} style={{ width: `${subregions.gyeongnam}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-semibold">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full ${colors.gyeongbuk}`} />
          {SUBREGION_NAMES.gyeongbuk} {subregions.gyeongbuk}%
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {SUBREGION_NAMES.gyeongnam} {subregions.gyeongnam}%
          <span className={`h-2 w-2 rounded-full ${colors.gyeongnam}`} />
        </span>
      </div>
    </div>
  );
}
