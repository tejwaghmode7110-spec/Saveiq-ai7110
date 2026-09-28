type SavingsInsightInput = {
  name: string;
  target: number;
  saved: number;
  date: string;
  monthlyRate: number;
  savingAmount: number;
  savingFrequency: "daily" | "weekly" | "monthly" | "yearly";
};

export function createSavingsInsight(goal: SavingsInsightInput): string {
  const left = Math.max(goal.target - goal.saved, 0);
  const targetDate = new Date(`${goal.date}T23:59:59`);
  const days = Math.max(1, Math.ceil((targetDate.getTime() - Date.now()) / 86400000));
  const months = Math.max(days / 30.44, 1 / 30.44);
  const monthly = Math.ceil(left / months);
  const weekly = Math.ceil(left / Math.max(days / 7, 1 / 7));
  const daily = Math.ceil(left / days);
  const money = (amount: number) => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(amount);

  if (left === 0) {
    return `${goal.name} is fully funded. Keep the goal active until you are ready to move on to your next one.`;
  }

  const currentPace = goal.monthlyRate > 0
    ? `Your recent pace is ${money(goal.monthlyRate)} a month${goal.monthlyRate >= monthly ? ", which is on track." : `, so increase it by about ${money(monthly - goal.monthlyRate)} a month to stay on schedule.`}`
    : "You have not recorded a contribution yet, so start with one small transfer this week and build the habit.";
  const frequencyText = {
    daily: "each day",
    weekly: "each week",
    monthly: "each month",
    yearly: "each year",
  }[goal.savingFrequency];
  const suggested = goal.savingAmount > 0
    ? `Your chosen rhythm is ${money(goal.savingAmount)} ${frequencyText}; compare it with the monthly target and adjust the amount if needed.`
    : `Set an automatic transfer of ${money(monthly)} each month, or split it into ${money(weekly)} weekly transfers.`;

  return [
    `${goal.name} savings plan`,
    `You have ${money(left)} left and about ${days} days until ${targetDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
    `1. Set aside ${money(monthly)} per month (about ${money(weekly)} per week or ${money(daily)} per day).`,
    `2. ${suggested}`,
    `3. ${currentPace} Review your progress once a month and increase contributions after any month you save less than planned.`,
  ].join("\n");
}