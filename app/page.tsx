"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Archive, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign, History, Home, Plus, Sparkles, Target, TrendingUp } from "lucide-react";
import { Contribution, Goal, MILESTONES, SavingFrequency, inr, plan, savingMetrics, whatIf } from "@/lib/calc";
import { buildCalendarPeriods, CalendarStatus, CalendarUnit } from "@/lib/calendar";
import { createSavingsInsight } from "@/lib/insights";
import { type Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "saveiq-demo-v1";
const goalSchema = z.object({
  name: z.string().trim().min(1, "Give the goal a name").max(80),
  target_amount: z.coerce.number().positive("Enter an amount above 0"),
  saving_amount: z.coerce.number().positive("Enter a saving amount above 0"),
  saving_frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  start_amount: z.coerce.number().min(0, "Can't be negative"),
  target_date: z.string().refine((date) => new Date(`${date}T23:59:59`) > new Date(), "Pick a future date"),
});

type GoalForm = z.infer<typeof goalSchema>;
type View = "dashboard" | "plan" | "progress" | "calendar" | "history";
type StoredData = { goals: Goal[]; contributions: Contribution[] };
const frequencyLabel: Record<SavingFrequency, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

function createDemoData(): StoredData {
  const now = new Date();
  const deadline = new Date(now);
  deadline.setMonth(deadline.getMonth() + 6);
  const contributionDate = new Date(now);
  contributionDate.setDate(contributionDate.getDate() - 10);
  const goalId = "demo-emergency-fund";

  return {
    goals: [{
      id: goalId,
      name: "Emergency fund",
      target_amount: 100000,
      start_amount: 15000,
      saving_amount: 10000,
      saving_frequency: "monthly",
      target_date: deadline.toISOString().slice(0, 10),
      created_at: now.toISOString(),
      archived_at: null,
    }],
    contributions: [{
      id: "demo-contribution",
      goal_id: goalId,
      amount: 5000,
      note: "Demo contribution",
      created_at: contributionDate.toISOString(),
    }],
  };
}

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setAuthReady(true);
      }
    }).catch(() => {
      if (mounted) setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!authReady) return <main className="min-h-screen bg-paper" />;
  if (!supabase) return <LoginScreen configured={false} />;
  if (!session) return <LoginScreen configured />;

  return <SavingsApp key={session.user.id} userId={session.user.id} userEmail={session.user.email ?? "Account"} onSignOut={() => { void supabase?.auth.signOut(); }} />;
}

function LoginScreen({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) setError(authError.message);
    } catch {
      setError("Unable to sign in right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.href,
          queryParams: { prompt: "select_account" },
        },
      });
      if (authError) {
        setError(authError.message);
        setBusy(false);
      }
    } catch {
      setError("Unable to start Google sign-in. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center gap-2 p-5 md:p-8">
        <span className="grid size-10 place-items-center rounded-xl bg-moss font-display text-xl font-bold text-white">S</span>
        <span className="font-display text-2xl font-bold">SaveIQ</span>
      </header>
      <section className="mx-auto max-w-md px-5 pb-12 pt-12">
        <form onSubmit={signIn} className="rounded-xl border border-line bg-white p-6 shadow-sm md:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-moss">Welcome back</p>
          <h1 className="mt-2 font-display text-3xl font-bold">Sign in to SaveIQ</h1>
          <p className="mt-2 text-sm text-ink/60">Use the email and password for your SaveIQ account.</p>
          <label className="mt-6 block text-sm font-medium">Email address
            <input className="mt-2" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="mt-4 block text-sm font-medium">Password
            <input className="mt-2" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p role="alert" className="mt-4 text-sm text-rust">{error}</p>}
          {!configured && <p role="alert" className="mt-4 text-sm text-rust">Configure NEXT_PUBLIC_SUPABASE_URL and a Supabase publishable or anon key to enable sign-in.</p>}
          <button className="btn mt-6 w-full justify-center" type="submit" disabled={busy || !configured}>{busy ? "Signing in..." : "Sign in"}</button>
          <div className="relative mt-5 text-center text-xs text-ink/45 before:absolute before:left-0 before:right-0 before:top-1/2 before:border-t before:border-line"><span className="relative bg-white px-2">or</span></div>
          <button className="mt-4 w-full rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-medium hover:border-moss hover:text-moss disabled:opacity-50" type="button" onClick={continueWithGoogle} disabled={busy || !configured}>
            {busy ? "Redirecting to Google..." : "Continue with Google"}
          </button>
        </form>
        <p className="mt-4 text-sm text-ink/55">New accounts are managed in the Supabase project. Sign-up is disabled here.</p>
      </section>
    </main>
  );
}

function SavingsApp({ userId, userEmail, onSignOut }: { userId: string; userEmail: string; onSignOut: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [historyGoalId, setHistoryGoalId] = useState("");
  const [calendarGoalId, setCalendarGoalId] = useState("");
  const [calendarUnit, setCalendarUnit] = useState<CalendarUnit>("daily");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [amount, setAmount] = useState("");
  const [planText, setPlanText] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const userStorageKey = `${STORAGE_KEY}:${userId}`;
  const form = useForm<GoalForm>({
    resolver: zodResolver(goalSchema) as any,
    defaultValues: { start_amount: 0, saving_frequency: "monthly", saving_amount: 0 },
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(userStorageKey);
      const legacy = stored ? null : localStorage.getItem(STORAGE_KEY);
      const data = stored ? JSON.parse(stored) as StoredData : legacy ? JSON.parse(legacy) as StoredData : createDemoData();
      setGoals(data.goals ?? []);
      setContributions(data.contributions ?? []);
      setSelectedGoalId(data.goals?.find((goal) => !goal.archived_at)?.id ?? "");
      setCalendarGoalId(data.goals?.find((goal) => !goal.archived_at)?.id ?? data.goals?.[0]?.id ?? "");
      if (!stored) {
        localStorage.setItem(userStorageKey, JSON.stringify(data));
        if (legacy) localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      const demo = createDemoData();
      setGoals(demo.goals);
      setContributions(demo.contributions);
      setSelectedGoalId(demo.goals[0].id);
      setCalendarGoalId(demo.goals[0].id);
      setError("Demo data could not be read from this browser. Your current changes will remain until you refresh.");
    }
    setReady(true);
  }, [userStorageKey]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(userStorageKey, JSON.stringify({ goals, contributions }));
    } catch {
      setError("Browser storage is unavailable. Changes may not persist after refresh.");
    }
  }, [ready, goals, contributions, userStorageKey]);

  const activeGoals = goals.filter((goal) => !goal.archived_at);
  const archivedGoals = goals.filter((goal) => Boolean(goal.archived_at)).sort((a, b) => b.archived_at!.localeCompare(a.archived_at!));
  const selected = activeGoals.find((goal) => goal.id === selectedGoalId) ?? activeGoals[0];
  const savedOf = (goal: Goal) => Number(goal.start_amount) + contributions
    .filter((contribution) => contribution.goal_id === goal.id)
    .reduce((total, contribution) => total + Number(contribution.amount), 0);
  const selectedSaved = selected ? savedOf(selected) : 0;
  const selectedPlan = selected ? plan(selected, selectedSaved) : null;
  const metrics = selected ? savingMetrics(selected, contributions, selectedSaved) : null;
  const adaptivePlan = selectedPlan && metrics?.monthlyRate ? whatIf(selectedPlan.left, metrics.monthlyRate) : null;
  const calendarGoal = goals.find((goal) => goal.id === calendarGoalId) ?? selected;
  const calendarPeriods = useMemo(
    () => calendarGoal ? buildCalendarPeriods(calendarGoal, contributions.filter((item) => item.goal_id === calendarGoal.id), calendarUnit, calendarDate) : [],
    [calendarGoal, contributions, calendarUnit, calendarDate],
  );
  const openedHistoryGoal = archivedGoals.find((goal) => goal.id === historyGoalId) ?? archivedGoals[0];
  const historyContributions = openedHistoryGoal ? contributions
    .filter((item) => item.goal_id === openedHistoryGoal.id)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];
  const historyContributionTotal = historyContributions.reduce((total, item) => total + Number(item.amount), 0);

  const series = useMemo(() => {
    if (!selected) return [];
    let runningTotal = Number(selected.start_amount);
    return [
      { date: "Start", saved: runningTotal },
      ...contributions
        .filter((contribution) => contribution.goal_id === selected.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((contribution) => ({
          date: new Date(contribution.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
          saved: (runningTotal += Number(contribution.amount)),
        })),
    ];
  }, [selected, contributions]);

  const addGoal = form.handleSubmit((values) => {
    const now = new Date().toISOString();
    const newGoal: Goal = { ...values, id: crypto.randomUUID(), created_at: now, archived_at: null };
    setGoals((current) => [...current.map((goal) => goal.archived_at ? goal : { ...goal, archived_at: now }), newGoal]);
    setSelectedGoalId(newGoal.id);
    setCalendarGoalId(newGoal.id);
    setPlanText("");
    setError("");
    form.reset({ start_amount: 0, saving_frequency: "monthly", saving_amount: 0 } as any);
    setView("dashboard");
  });

  const addSaving = () => {
    const saving = Number(amount);
    if (!selected || !(saving > 0)) return;
    setContributions((current) => [...current, {
      id: crypto.randomUUID(),
      goal_id: selected.id,
      amount: saving,
      note: null,
      created_at: new Date().toISOString(),
    }]);
    setAmount("");
    setPlanText("");
    setError("");
  };

  const generatePlan = async () => {
    if (!selected || !metrics) return;
    setPlanBusy(true);
    setPlanText("");
    setError("");
    try {
      setPlanText(createSavingsInsight({
        name: selected.name,
        target: Number(selected.target_amount),
        saved: selectedSaved,
        date: selected.target_date,
        monthlyRate: metrics.monthlyRate,
        savingAmount: Number(selected.saving_amount ?? 0),
        savingFrequency: selected.saving_frequency ?? "monthly",
      }));
    } catch {
      setPlanText("A savings plan could not be generated right now.");
    } finally {
      setPlanBusy(false);
    }
  };

  const moveCalendar = (offset: number) => setCalendarDate((current) => {
    const next = new Date(current);
    next.setDate(1);
    if (calendarUnit === "daily" || calendarUnit === "weekly") next.setMonth(next.getMonth() + offset);
    else next.setFullYear(next.getFullYear() + offset);
    return next;
  });

  if (!ready) return <main className="min-h-screen bg-paper" />;

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-5 md:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <button className="flex items-center gap-2" onClick={() => setView("dashboard")}>
          <span className="grid size-10 place-items-center rounded-xl bg-moss font-display text-xl font-bold text-white">S</span>
          <span className="font-display text-3xl font-bold">SaveIQ</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="inline-flex max-w-[60vw] items-center gap-2 rounded-full border border-line bg-white px-3 py-2 text-sm text-ink/70">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint font-medium text-moss">{userEmail.slice(0, 1).toUpperCase()}</span>
            <span className="truncate">{userEmail}</span>
          </div>
          <button className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium hover:border-moss hover:text-moss" onClick={onSignOut} title="Sign out and choose another account">Switch account</button>
        </div>
      </header>

      <nav className="mt-7 flex gap-1 overflow-x-auto border-b border-line" aria-label="Main navigation">
        {([
          ["dashboard", "Dashboard", Home],
          ["plan", "Plan", Sparkles],
          ["progress", "Progress", TrendingUp],
          ["calendar", "Calendar", CalendarDays],
          ["history", "History", History],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setView(key)} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium ${view === key ? "border-moss text-moss" : "border-transparent text-ink/55 hover:text-ink"}`}>
            <Icon size={16} />{label}
          </button>
        ))}
      </nav>

      {error && <p role="alert" className="mt-5 rounded-lg border border-rust/30 bg-rust/10 p-3 text-sm text-rust">{error}</p>}

      {view === "dashboard" && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <div>
              <p className="text-sm font-medium uppercase text-moss">Active goal</p>
              {activeGoals.length === 0 && <p className="mt-2 text-sm text-ink/60">Create a goal to get started.</p>}
              {activeGoals.map((goal) => {
                const goalPlan = plan(goal, savedOf(goal));
                return (
                  <button key={goal.id} onClick={() => setSelectedGoalId(goal.id)} className={`mt-2 w-full rounded-xl border p-4 text-left ${goal.id === selected?.id ? "border-moss bg-mint" : "border-line bg-white"}`}>
                    <div className="flex justify-between font-medium"><span>{goal.name}</span><span>{Math.round(goalPlan.pct)}%</span></div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><motion.div className="h-full bg-moss" initial={false} animate={{ width: `${goalPlan.pct}%` }} /></div>
                    <p className="mt-2 text-sm">{inr(savedOf(goal))} of {inr(Number(goal.target_amount))}</p>
                  </button>
                );
              })}
            </div>

            <form onSubmit={addGoal} className="space-y-3 rounded-xl border border-line bg-white p-4">
              <div><h2 className="font-display text-lg font-semibold">Create a new goal</h2><p className="mt-1 text-sm text-ink/60">A new goal moves your current one into History.</p></div>
              <Field label="Goal name"><input placeholder="For example, laptop" aria-label="Goal name" {...form.register("name")} /></Field>
              <Field label="Target amount (₹)"><input type="number" placeholder="Total amount" aria-label="Target amount" {...form.register("target_amount")} /></Field>
              <Field label="Saving amount (₹)"><input type="number" placeholder="Amount each time" aria-label="Saving amount" {...form.register("saving_amount")} /></Field>
              <Field label="Saving frequency">
                <select className="w-full rounded-lg border border-line bg-white px-3 py-2" aria-label="Saving frequency" {...form.register("saving_frequency")}>
                  <option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option>
                </select>
              </Field>
              <Field label="Already saved (₹)"><input type="number" placeholder="0" aria-label="Already saved" {...form.register("start_amount")} /></Field>
              <Field label="Target date"><input type="date" aria-label="Target date" {...form.register("target_date")} /></Field>
              {Object.values(form.formState.errors).map((fieldError, index) => <p key={index} role="alert" className="text-sm text-rust">{fieldError?.message as string}</p>)}
              <button className="btn w-full justify-center"><Plus size={16} />Create goal</button>
            </form>
          </aside>

          <section className="space-y-6">
            {selected && selectedPlan && metrics ? (
              <>
                <div>
                  <p className="font-medium uppercase tracking-[0.16em] text-moss">Your current focus</p>
                  <h1 className="mt-2 font-display text-5xl font-bold">{selected.name}</h1>
                  <p className="mt-2 text-lg">{selectedPlan.done ? "Goal reached." : `Save ${inr(selectedPlan.perMonth)} a month to reach your target on time.`}</p>
                  <p className="mt-1 text-sm text-moss">Your target rhythm: {inr(Number(selected.saving_amount))} every {frequencyLabel[selected.saving_frequency ?? "monthly"]}.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Saved so far" value={inr(selectedSaved)} detail={`of ${inr(Number(selected.target_amount))}`} />
                  <Metric label="Still needed" value={inr(selectedPlan.left)} detail={`${Math.round(selectedPlan.pct)}% complete`} />
                  <Metric label="Target pace" value={inr(selectedPlan.perMonth)} detail="per month" />
                </div>

                {adaptivePlan && !selectedPlan.done && metrics.monthlyRate !== selectedPlan.perMonth && (
                  <div className="rounded-xl border border-coin bg-coin/20 p-4 text-sm">At your recent pace of {inr(metrics.monthlyRate)} a month, you may reach the goal by {adaptivePlan.date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.</div>
                )}

                <div className="flex gap-2">
                  <input type="number" min="1" placeholder="Add a contribution (₹)" aria-label="Contribution amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
                  <button className="btn shrink-0" onClick={addSaving}><Plus size={16} />Add saving</button>
                </div>

                <div className="h-56 rounded-xl border border-line bg-white p-3">
                  <ResponsiveContainer><AreaChart data={series}><XAxis dataKey="date" /><Tooltip formatter={(value) => inr(Number(value))} /><Area dataKey="saved" stroke="#0E6B5C" fill="#CFE9E1" /></AreaChart></ResponsiveContainer>
                </div>

                <div className="rounded-xl border border-line bg-white p-4">
                  <div className="flex items-center gap-2"><CircleDollarSign size={18} className="text-moss" /><h2 className="font-display text-lg font-semibold">Recent contributions</h2></div>
                  {contributions.filter((item) => item.goal_id === selected.id).length === 0 ? <p className="mt-3 text-sm text-ink/60">Your contributions will appear here.</p> : (
                    <ul className="mt-2 divide-y divide-line text-sm">
                      {contributions.filter((item) => item.goal_id === selected.id).slice().reverse().slice(0, 5).map((item) => <li key={item.id} className="flex justify-between py-2"><span>{new Date(item.created_at).toLocaleDateString("en-IN")}</span><span>{inr(Number(item.amount))}</span></li>)}
                    </ul>
                  )}
                </div>
              </>
            ) : <div className="rounded-xl border border-dashed border-line bg-white p-8 text-ink/65">Create a savings goal to see your dashboard.</div>}
          </section>
        </div>
      )}

      {view === "plan" && (
        <section className="mt-8 space-y-6">
          {selected && selectedPlan && metrics ? <>
            <div><p className="font-medium uppercase tracking-[0.16em] text-moss">Savings plan</p><h1 className="mt-2 font-display text-5xl font-bold">A route to {selected.name}</h1><p className="mt-3 text-lg text-ink/65">A concrete schedule based on your target amount and deadline.</p></div>
            <div className="grid gap-4 md:grid-cols-3"><Metric label="Monthly pace" value={inr(selectedPlan.perMonth)} detail="to meet your deadline" /><Metric label="Weekly pace" value={inr(selectedPlan.perWeek)} detail="to keep on track" /><Metric label="Days remaining" value={String(selectedPlan.days)} detail={new Date(selected.target_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} /></div>
            <div className="rounded-2xl bg-ink p-6 text-paper">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-paper/60">Personalized guidance</p><h2 className="mt-1 font-display text-2xl font-semibold">Your saving plan</h2></div><button className="btn !bg-coin !text-ink" onClick={generatePlan} disabled={planBusy}><Sparkles size={16} />{planBusy ? "Building plan..." : "Generate plan"}</button></div>
              {planText ? <p className="mt-5 whitespace-pre-line text-paper/85">{planText}</p> : <p className="mt-5 text-paper/70">Generate a step-by-step schedule with suggested daily, weekly, and monthly savings.</p>}
            </div>
            <div className="rounded-xl border border-line bg-white p-5"><h2 className="font-display text-xl font-semibold">Milestones</h2><div className="mt-4 flex flex-wrap gap-2">{MILESTONES.map((milestone) => <span key={milestone} className={`rounded-full px-3 py-1 text-sm ${selectedPlan.pct >= milestone ? "bg-coin text-ink" : "bg-line"}`}>{milestone}% {selectedPlan.pct >= milestone ? "complete" : "ahead"}</span>)}</div></div>
          </> : <EmptyState text="Create an active goal to build a savings plan." />}
        </section>
      )}

      {view === "progress" && (
        <section className="mt-8 space-y-6">
          {selected && selectedPlan && metrics ? <>
            <div><p className="font-medium uppercase tracking-[0.16em] text-moss">Goal progress</p><h1 className="mt-2 font-display text-5xl font-bold">Every contribution adds up.</h1><p className="mt-3 text-lg text-ink/65">Your {selected.name} snapshot.</p></div>
            <div className="rounded-xl border border-line bg-white p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-sm text-ink/55">Total saved</p><p className="mt-1 font-display text-4xl font-bold">{inr(selectedSaved)}</p></div><p className="text-right text-sm text-ink/60">of {inr(Number(selected.target_amount))}<br /><span className="font-medium text-moss">{Math.round(metrics.progress)}% complete</span></p></div><div className="mt-5 h-3 rounded-full bg-line"><motion.div className="h-full rounded-full bg-moss" animate={{ width: `${metrics.progress}%` }} /></div></div>
            <div className="grid gap-3 sm:grid-cols-3"><Metric label="Saving streak" value={`${metrics.streak} days`} detail="Keep showing up" /><Metric label="Saving health" value={`${metrics.health} / 100`} detail="Progress and consistency" /><Metric label="Predicted finish" value={metrics.projectedDate?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) ?? "Need a saving"} detail="Based on your contribution history" /></div>
            <div className="rounded-xl border border-line bg-white p-5"><h2 className="font-display text-xl font-semibold">Milestones</h2><div className="mt-5 space-y-4">{MILESTONES.map((milestone) => { const complete = metrics.progress >= milestone; return <div key={milestone} className="flex items-center gap-3"><span className={`grid size-8 place-items-center rounded-full ${complete ? "bg-moss text-white" : "bg-line text-ink/45"}`}>{complete ? <Check size={16} /> : <span className="text-xs">{milestone}</span>}</span><div className="flex-1"><div className="flex justify-between text-sm"><span>{milestone}% milestone</span><span className="text-ink/55">{complete ? "Complete" : `${inr(Math.max(Number(selected.target_amount) * milestone / 100 - selectedSaved, 0))} to go`}</span></div><div className="mt-2 h-2 rounded-full bg-line"><div className="h-full rounded-full bg-moss" style={{ width: `${complete ? 100 : Math.max(0, Math.min(100, metrics.progress / milestone * 100))}%` }} /></div></div></div>; })}</div></div>
          </> : <EmptyState text="Create an active goal to track progress." />}
        </section>
      )}

      {view === "calendar" && (
        <section className="mt-8 space-y-6">
          <div><p className="font-medium uppercase tracking-[0.16em] text-moss">Saving activity</p><h1 className="mt-2 font-display text-5xl font-bold">Savings calendar</h1><p className="mt-3 text-lg text-ink/65">Green periods meet your saving target; red periods are below it.</p></div>
          {calendarGoal ? <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="block min-w-52 text-sm font-medium">Goal
                <select className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2" value={calendarGoal.id} onChange={(event) => setCalendarGoalId(event.target.value)}>
                  {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}{goal.archived_at ? " (History)" : ""}</option>)}
                </select>
              </label>
              <div className="flex gap-1 rounded-lg bg-white p-1" role="group" aria-label="Calendar period">
                {(["daily", "weekly", "monthly", "yearly"] as const).map((unit) => <button key={unit} className={`rounded-md px-3 py-2 text-sm capitalize ${calendarUnit === unit ? "bg-moss text-white" : "text-ink/60 hover:bg-mint"}`} onClick={() => setCalendarUnit(unit)}>{unit}</button>)}
              </div>
            </div>
            <div className="flex items-center justify-between border-y border-line py-3">
              <button className="grid size-9 place-items-center rounded-lg border border-line bg-white" aria-label="Previous calendar period" onClick={() => moveCalendar(-1)}><ChevronLeft size={18} /></button>
              <h2 className="font-display text-2xl font-semibold">{calendarUnit === "daily" || calendarUnit === "weekly" ? calendarDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : calendarDate.getFullYear()}</h2>
              <button className="grid size-9 place-items-center rounded-lg border border-line bg-white" aria-label="Next calendar period" onClick={() => moveCalendar(1)}><ChevronRight size={18} /></button>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <StatusLegend status="complete" label="Target met" />
              <StatusLegend status="missed" label="Below target" />
              <StatusLegend status="upcoming" label="Upcoming" />
            </div>
            {calendarUnit === "daily" ? (
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="py-2 text-center text-xs font-medium text-ink/55">{day}</div>)}
                {Array.from({ length: (new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() + 6) % 7 }, (_, index) => <div key={`blank-${index}`} />)}
                {calendarPeriods.map((period) => <div key={period.key} className={`min-h-24 rounded-lg border p-1.5 sm:min-h-28 sm:p-2 ${calendarTone(period.status)}`}>
                  <p className="text-sm font-semibold">{period.start.getDate()}</p>
                  <p className="mt-1 text-xs">{inr(period.actual)}</p>
                  <p className="text-[10px] opacity-70">of {inr(Math.ceil(period.target))}</p>
                </div>)}
              </div>
            ) : (
              <div className={`grid gap-3 ${calendarUnit === "weekly" ? "sm:grid-cols-2" : calendarUnit === "monthly" ? "sm:grid-cols-3 lg:grid-cols-4" : ""}`}>
                {calendarPeriods.map((period) => <article key={period.key} className={`rounded-xl border p-4 ${calendarTone(period.status)}`}>
                  <div className="flex items-center justify-between gap-3"><h3 className="font-display text-lg font-semibold">{period.label}</h3><span className="text-xs font-medium">{statusLabel(period.status)}</span></div>
                  <p className="mt-3 text-xl font-semibold">{inr(period.actual)}</p>
                  <p className="mt-1 text-sm opacity-75">of {inr(Math.ceil(period.target))} target</p>
                </article>)}
              </div>
            )}
            <p className="text-sm text-ink/55">Target amounts follow {inr(Number(calendarGoal.saving_amount))} per {frequencyLabel[calendarGoal.saving_frequency ?? "monthly"]}, converted to the selected calendar period. Total saved for this goal: {inr(savedOf(calendarGoal))}.</p>
          </> : <EmptyState text="Create a goal to start tracking your saving calendar." />}
        </section>
      )}

      {view === "history" && (
        <section className="mt-8 space-y-5">
          <div><p className="font-medium uppercase tracking-[0.16em] text-moss">Past goals</p><h1 className="mt-2 font-display text-5xl font-bold">Your history</h1><p className="mt-3 text-lg text-ink/65">Goals you moved on from stay here, separate from your dashboard.</p></div>
          {archivedGoals.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-white p-8 text-ink/65">No past goals yet. Creating a new goal will move your current goal here.</div> : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="divide-y divide-line border-y border-line">
                {archivedGoals.map((goal) => {
                  const contributed = contributions.filter((item) => item.goal_id === goal.id).reduce((total, item) => total + Number(item.amount), 0);
                  return <button key={goal.id} className={`flex w-full items-center justify-between gap-3 py-4 text-left ${goal.id === openedHistoryGoal?.id ? "text-moss" : "text-ink hover:text-moss"}`} onClick={() => setHistoryGoalId(goal.id)}>
                    <span><span className="flex items-center gap-2 font-display text-xl font-semibold"><Archive size={16} />{goal.name}</span><span className="mt-1 block text-sm text-ink/55">{inr(contributed)} contributed · {new Date(goal.archived_at!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></span>
                    <ChevronRight size={18} />
                  </button>;
                })}
              </div>
              {openedHistoryGoal && <section aria-label={`${openedHistoryGoal.name} details`}>
                <p className="text-sm font-medium uppercase tracking-[0.16em] text-moss">Archived goal</p>
                <h2 className="mt-2 font-display text-3xl font-bold">{openedHistoryGoal.name}</h2>
                <p className="mt-1 text-sm text-ink/55">Moved to history {new Date(openedHistoryGoal.archived_at!).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Metric label="Total saved" value={inr(savedOf(openedHistoryGoal))} detail={`of ${inr(Number(openedHistoryGoal.target_amount))}`} />
                  <Metric label="Total contributed" value={inr(historyContributionTotal)} detail="Recorded savings" />
                  <Metric label="Starting balance" value={inr(Number(openedHistoryGoal.start_amount))} detail="Already saved at goal creation" />
                  <Metric label="Contributions" value={String(historyContributions.length)} detail="Individual deposits" />
                </div>
                <h3 className="mt-6 font-display text-xl font-semibold">Contribution history</h3>
                {historyContributions.length === 0 ? <p className="mt-2 text-sm text-ink/55">No contributions were recorded for this goal.</p> : <ul className="mt-2 divide-y divide-line border-y border-line">
                  {historyContributions.map((item) => <li key={item.id} className="flex justify-between gap-4 py-3 text-sm"><span>{new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</span><span className="font-medium">{inr(Number(item.amount))}</span></li>)}
                </ul>}
              </section>}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm font-medium">{label}{children}</label>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-ink/55">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-sm text-ink/60">{detail}</p></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-line bg-white p-8 text-ink/65"><Target size={20} className="mb-3 text-moss" />{text}</div>;
}

function calendarTone(status: CalendarStatus) {
  if (status === "complete") return "border-green-300 bg-green-100 text-green-950";
  if (status === "missed") return "border-red-300 bg-red-100 text-red-950";
  return "border-line bg-white text-ink/55";
}

function statusLabel(status: CalendarStatus) {
  if (status === "complete") return "Target met";
  if (status === "missed") return "Below target";
  return status === "upcoming" ? "Upcoming" : "Not started";
}

function StatusLegend({ status, label }: { status: CalendarStatus; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className={`size-3 rounded-sm ${status === "complete" ? "bg-green-500" : status === "missed" ? "bg-red-500" : "bg-line"}`} />{label}</span>;
}
