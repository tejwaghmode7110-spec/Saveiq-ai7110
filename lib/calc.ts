export type SavingFrequency = "daily" | "weekly" | "monthly" | "yearly";
export type Goal = { id: string; name: string; target_amount: number; start_amount: number; target_date: string; created_at: string; saving_amount?: number; saving_frequency?: SavingFrequency; archived_at?: string | null };
export type Contribution = { id: string; goal_id: string; amount: number; note: string | null; created_at: string };
export const MILESTONES = [25, 50, 75, 100];
export const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
const DAY = 864e5;

export function plan(g: Goal, saved: number) {
  const left = Math.max(Number(g.target_amount) - saved, 0);
  const days = Math.max(Math.ceil((new Date(g.target_date).getTime() - Date.now()) / DAY), 0);
  const months = days / 30.44;
  const pct = Math.min(100, (saved / Number(g.target_amount)) * 100);
  const span = Math.max(new Date(g.target_date).getTime() - new Date(g.created_at).getTime(), DAY);
  const elapsed = Math.min(Math.max(Date.now() - new Date(g.created_at).getTime(), 0), span);
  const expected = Number(g.start_amount) + (Number(g.target_amount) - Number(g.start_amount)) * (elapsed / span);
  return {
    left, days, pct,
    perMonth: months > 0 ? left / months : left,
    perWeek: days > 0 ? left / (days / 7) : left,
    behindBy: Math.max(expected - saved, 0),
    done: left === 0,
  };
}

/** What-if: how long until the goal if the user saves `monthly` each month? */
export function whatIf(left: number, monthly: number) {
  if (monthly <= 0 || left <= 0) return null;
  const months = Math.ceil(left / monthly);
  const date = new Date(); date.setMonth(date.getMonth() + months);
  return { months, date };
}

export function savingMetrics(goal: Goal, contributions: Contribution[], saved: number) {
  const goalContributions = contributions
    .filter((contribution) => contribution.goal_id === goal.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const now = Date.now();
  const recent = goalContributions.filter((contribution) => now - new Date(contribution.created_at).getTime() <= 30 * DAY);
  const recentMonthly = recent.reduce((sum, contribution) => sum + Number(contribution.amount), 0);
  const firstDate = goalContributions[0] ? new Date(goalContributions[0].created_at).getTime() : now;
  const elapsedMonths = Math.max((now - firstDate) / (30.44 * DAY), 1);
  const historicalMonthly = goalContributions.reduce((sum, contribution) => sum + Number(contribution.amount), 0) / elapsedMonths;
  const monthlyRate = recentMonthly > 0 ? recentMonthly : historicalMonthly;
  const left = Math.max(Number(goal.target_amount) - saved, 0);
  const projectedMonths = monthlyRate > 0 ? Math.ceil(left / monthlyRate) : null;
  const projectedDate = projectedMonths === null ? null : new Date(now + projectedMonths * 30.44 * DAY);
  const uniqueDays = [...new Set(goalContributions.map((contribution) => new Date(contribution.created_at).toISOString().slice(0, 10)))];
  let streak = 0;
  let cursor = new Date();
  for (const day of uniqueDays.reverse()) {
    const difference = Math.floor((new Date(cursor.toISOString().slice(0, 10)).getTime() - new Date(day).getTime()) / DAY);
    if (difference > 1) break;
    streak += 1;
    cursor = new Date(day);
  }
  const progress = Math.min(100, (saved / Number(goal.target_amount)) * 100);
  const targetDate = new Date(goal.target_date).getTime();
  const timelineScore = projectedDate ? Math.max(0, Math.min(100, 100 - Math.max(0, projectedDate.getTime() - targetDate) / (30 * DAY) * 12)) : 20;
  const consistencyScore = Math.min(100, goalContributions.length * 12 + Math.min(streak, 7) * 5);
  const health = Math.round(progress * 0.4 + timelineScore * 0.4 + consistencyScore * 0.2);
  return { monthlyRate, projectedMonths, projectedDate, streak, progress, health, hasPattern: goalContributions.length > 0 };
}
