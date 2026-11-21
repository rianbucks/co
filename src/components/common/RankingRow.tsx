import type { RankingEntryView } from '@/lib/ranking/contract';
import { REGION_KOREAN_NAMES } from '@/types/screen';

function rankColor(rank: number): string {
  if (rank === 1) return 'text-amber-300';
  if (rank === 2) return 'text-zinc-200';
  if (rank === 3) return 'text-orange-300';
  return 'text-zinc-500';
}

export default function RankingRow({ item, isMine = false }: { item: RankingEntryView; isMine?: boolean }) {
  return (
    <li
      className="ranking-entry flex items-center gap-3" data-mine={isMine || undefined}
    >
      <span className={`w-9 shrink-0 text-center font-mono text-sm font-black ${rankColor(item.rank)}`}>
        {item.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-white">{item.nickname}</span>
          {isMine && (
            <span className="shrink-0 rounded-full bg-indigo-500/25 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
              나
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-zinc-400">
          {REGION_KOREAN_NAMES[item.region] || item.region} · {item.grade}등급 {item.gradeName}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <span className="font-mono text-lg font-black text-white">{item.intensity}</span>
        <span className="ml-0.5 text-[10px] text-zinc-500">점</span>
      </div>
    </li>
  );
}
