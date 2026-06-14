export function reciprocalRankFusion<T extends { id: string }>(
  lists: T[][],
  k = 60
): Array<{ item: T; score: number }> {
  const scores = new Map<string, { item: T; score: number }>();

  for (const list of lists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const current = scores.get(item.id) || { item, score: 0 };
      current.score += 1 / (k + (rank + 1));
      scores.set(item.id, current);
    }
  }

  return Array.from(scores.values()).sort((a, b) => b.score - a.score);
}
