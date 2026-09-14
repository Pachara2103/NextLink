import type { CapstoneTopic } from "./capstone-types";

/** Application IDs are scoped to one topic and one round, never to a person. */
export function validateRanking(topic: CapstoneTopic, round: string, order: string[]): boolean {
  if (!topic.companyId || !topic.rounds.includes(round)) return order.length === 0;
  const eligible = new Set(topic.applications.filter(a => a.round === round && a.status === "active").map(a => a.id));
  return new Set(order).size === order.length && order.every(id => eligible.has(id));
}

export function rankingRows(topic: CapstoneTopic, round: string) {
  const order = topic.rankings.find(r => r.round === round)?.applicationIds ?? [];
  const ranks = new Map<string, number>();
  order.forEach((id, index) => { if (!ranks.has(id)) ranks.set(id, index + 1); });
  return topic.applications.filter(a => a.round === round && a.status === "active")
    .map(application => {
      return { application, rank: ranks.get(application.id) ?? null };
    }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
}

export function moveRank(order: string[], id: string, direction: -1 | 1): string[] {
  const index = order.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
