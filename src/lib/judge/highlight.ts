/**
 * 받아쓰기 안에서 근거 인용 구절을 강조하기 위한 구간 나누기(S5 문항별 카드).
 * 화면과 테스트가 함께 쓰므로 서버 전용 코드를 넣지 않는다.
 */
export interface HighlightPart {
  text: string;
  highlighted: boolean;
}

/**
 * text에서 quotes가 나오는 자리를 모두 강조 구간으로 나눈다. 겹치거나 맞닿은 구간은 하나로 합친다.
 * 빈 인용은 무시한다. 서버가 근거 검증에 쓴 것과 같은 정리된 받아쓰기와 인용을 그대로 비교한다.
 */
export function splitHighlights(text: string, quotes: readonly string[]): HighlightPart[] {
  const ranges: Array<[number, number]> = [];
  for (const quote of quotes) {
    if (!quote) continue;
    for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + quote.length)) {
      ranges.push([at, at + quote.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const parts: HighlightPart[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), highlighted: false });
    parts.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });
  return parts;
}
