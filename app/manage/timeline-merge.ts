/** Merge one player's schedule entries into the fewest timeline blocks.
 * Same court: overlapping or back-to-back ranges become one taller block.
 * Neighbouring courts with the exact same range become one wider block.
 */
export type TimelineEntry<T> = {item: T; groupKey: string; column: number; start: number; end: number};
export type TimelineBlock<T> = {key: string; groupKey: string; column: number; span: number; start: number; end: number; items: T[]};

export function mergeTimelineEntries<T>(entries: TimelineEntry<T>[]): TimelineBlock<T>[] {
  const groups = new Map<string, TimelineEntry<T>[]>();
  for (const entry of entries) {
    if (!(entry.end > entry.start) || entry.column < 0) continue;
    groups.set(entry.groupKey, [...(groups.get(entry.groupKey) || []), entry]);
  }
  const blocks: TimelineBlock<T>[] = [];
  for (const [groupKey, group] of groups) {
    group.sort((a, b) => a.column - b.column || a.start - b.start);
    const ranges: {column: number; start: number; end: number; items: T[]}[] = [];
    for (const entry of group) {
      const previous = ranges.at(-1);
      if (previous && previous.column === entry.column && entry.start <= previous.end) {
        previous.end = Math.max(previous.end, entry.end);
        if (!previous.items.includes(entry.item)) previous.items.push(entry.item);
      } else ranges.push({column: entry.column, start: entry.start, end: entry.end, items: [entry.item]});
    }
    const merged: TimelineBlock<T>[] = [];
    for (const range of ranges) {
      const wide = merged.find(block => block.column + block.span === range.column && block.start === range.start && block.end === range.end);
      if (wide) {
        wide.span += 1;
        for (const item of range.items) if (!wide.items.includes(item)) wide.items.push(item);
      } else merged.push({key: `${groupKey}:${range.column}:${range.start}`, groupKey, column: range.column, span: 1, start: range.start, end: range.end, items: [...range.items]});
    }
    blocks.push(...merged);
  }
  return blocks.sort((a, b) => a.start - b.start || a.column - b.column);
}
