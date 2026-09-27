import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({ goal: z.object({
  name: z.string().trim().min(1).max(80),
  target: z.number().positive(),
  saved: z.number().min(0),
  date: z.string(),
  monthlyRate: z.number().min(0),
  savingAmount: z.number().min(0),
  savingFrequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
}) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { goal } = parsed.data;
  const left = Math.max(goal.target - goal.saved, 0);
  const targetDate = new Date(`${goal.date}T23:59:59`);
  if (!Number.isFinite(targetDate.getTime())) return NextResponse.json({ error: "Choose a valid target date." }, { status: 400 });

  const days = Math.max(1, Math.ceil((targetDate.getTime() - Date.now()) / 86400000));
  const months = Math.max(days / 30.44, 1 / 30.44);
  const monthly = Math.ceil(left / months);
  const weekly = Math.ceil(left / Math.max(days / 7, 1 / 7));
  const daily = Math.ceil(left / days);
  const money = (amount: number) => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(amount);

  if (left === 0) {
    return NextResponse.json({ text: `${goal.name} is fully funded. Keep the goal active until you are ready to move on to your next one.` });
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
  const text = [
    `${goal.name} savings plan`,
    `You have ${money(left)} left and about ${days} days until ${targetDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
    `1. Set aside ${money(monthly)} per month (about ${money(weekly)} per week or ${money(daily)} per day).`,
    `2. ${suggested}`,
    `3. ${currentPace} Review your progress once a month and increase contributions after any month you save less than planned.`,
  ].join("\n");

  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-2.5-flash"}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `You are a practical savings coach. Give a short, specific plan in INR to reach this goal on time. Include the calculated monthly target of ${money(monthly)}, recommend an achievable saving routine, and give three actionable steps. Do not suggest investments, loans, or crypto. Goal data: ${JSON.stringify(goal)}` }] }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const result = await response.json();
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof generatedText === "string" && generatedText.trim()) {
          return NextResponse.json({ text: generatedText.trim() });
        }
      }
    } catch {
    }
  }

  return NextResponse.json({ text });
}
