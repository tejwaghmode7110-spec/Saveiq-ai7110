import type { Contribution, Goal, SavingFrequency } from "@/lib/calc";

export type CalendarUnit = "daily" | "weekly" | "monthly" | "yearly";
export type CalendarStatus = "complete" | "missed" | "upcoming" | "inactive";
export type CalendarPeriod = {
  key: string;
  label: string;
  start: Date;
  actual: number;
  target: number;
  status: CalendarStatus;
};

const DAY = 86400000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

function monthlyTarget(goal: Goal) {
  const amount = Number(goal.saving_amount ?? 0);
  const frequency: SavingFrequency = goal.saving_frequency ?? "monthly";
  const monthlyFactor: Record<SavingFrequency, number> = {
    daily: 365.2425 / 12,
    weekly: 52.1775 / 12,
    monthly: 1,
    yearly: 1 / 12,
  };
  return amount * monthlyFactor[frequency];
}

function targetFor(goal: Goal, unit: CalendarUnit) {
  const month = monthlyTarget(goal);
  const unitFactor: Record<CalendarUnit, number> = {
    daily: 12 / 365.2425,
    weekly: 12 / 52.1775,
    monthly: 1,
    yearly: 12,
  };
  return month * unitFactor[unit];
}

function eligibleDays(start: Date, end: Date, created: Date, today: Date) {
  const first = new Date(Math.max(start.getTime(), created.getTime()));
  const last = new Date(Math.min(end.getTime(), today.getTime()));
  return first > last ? 0 : Math.floor((last.getTime() - first.getTime()) / DAY) + 1;
}

function totalInRange(contributions: Contribution[], start: Date, end: Date, goalStart: Date) {
  const first = new Date(Math.max(start.getTime(), goalStart.getTime()));
  return contributions.reduce((total, contribution) => {
    const date = startOfDay(new Date(contribution.created_at));
    return date >= first && date <= end ? total + Number(contribution.amount) : total;
  }, 0);
}

function statusFor(actual: number, target: number, started: boolean, future: boolean) {
  if (!started) return "inactive" as const;
  if (future) return "upcoming" as const;
  return actual >= target ? "complete" as const : "missed" as const;
}

function amountPeriod(
  key: string,
  label: string,
  start: Date,
  end: Date,
  fullTarget: number,
  totalDays: number,
  goal: Goal,
  contributions: Contribution[],
  created: Date,
  today: Date,
): CalendarPeriod {
  const days = eligibleDays(start, end, created, today);
  const actual = totalInRange(contributions, start, end, created);
  const target = totalDays > 0 ? fullTarget * days / totalDays : 0;
  const started = days > 0;
  return {
    key,
    label,
    start,
    actual,
    target,
    status: statusFor(actual, target, started, start > today),
  };
}

export function buildCalendarPeriods(goal: Goal, contributions: Contribution[], unit: CalendarUnit, anchor: Date): CalendarPeriod[] {
  const created = startOfDay(new Date(goal.created_at));
  const today = startOfDay(new Date());
  const year = anchor.getFullYear();

  if (unit === "daily") {
    const month = anchor.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    const target = targetFor(goal, "daily");
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(year, month, index + 1);
      const actual = totalInRange(contributions, date, date, created);
      const started = date >= created;
      return {
        key: date.toISOString(),
        label: date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        start: date,
        actual,
        target,
        status: statusFor(actual, target, started && date <= today, date > today),
      };
    });
  }

  if (unit === "weekly") {
    const month = anchor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth = new Date(year, month + 1, 0);
    const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
    let cursor = addDays(firstOfMonth, -mondayOffset);
    const target = targetFor(goal, "weekly");
    const weeks: CalendarPeriod[] = [];
    while (cursor <= lastOfMonth) {
      const end = addDays(cursor, 6);
      const label = `${cursor.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
      weeks.push(amountPeriod(cursor.toISOString(), label, cursor, end, target, 7, goal, contributions, created, today));
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }

  if (unit === "monthly") {
    const target = targetFor(goal, "monthly");
    return Array.from({ length: 12 }, (_, month) => {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return amountPeriod(
        `${year}-${month}`,
        start.toLocaleDateString("en-IN", { month: "long" }),
        start,
        end,
        target,
        end.getDate(),
        goal,
        contributions,
        created,
        today,
      );
    });
  }

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  return [amountPeriod(
    String(year),
    String(year),
    start,
    end,
    targetFor(goal, "yearly"),
    Math.round((end.getTime() - start.getTime()) / DAY) + 1,
    goal,
    contributions,
    created,
    today,
  )];
}