import { createFileRoute } from "@tanstack/react-router";
import { KpiCard } from "@/components/app/KpiCard";
import { Building2, Users, Utensils, Target, AlertTriangle, Smartphone, TrendingUp, Activity, Coffee, Sun, Moon, CalendarDays, Clock, ChevronRight } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { useCampScope } from "@/lib/session";
import { useOverview, useCamps, useCompanies, useScans, type Scan } from "@/lib/hooks";

// Human-readable reason for a non-eligible scan result, mirroring the messages
// the scanner produces. Derived from the stored status + meal (the Scan record
// doesn't persist the exact reason code).
function scanReason(status: Scan["status"], meal: Scan["meal"]): string {
  switch (status) {
    case "Already Served": return `Already scanned for ${meal.toLowerCase()}`;
    case "Not Eligible": return "Not eligible — meal plan / HR record";
    case "Wrong Camp": return "Worker is from another company";
    case "Expired": return "Outside the meal window";
    default: return ""; // Eligible — no reason needed
  }
}

const MEAL_COLORS: Record<string, string> = {
  Breakfast: "var(--chart-3)",
  Lunch: "var(--chart-1)",
  Dinner: "var(--chart-2)",
};
const DEFAULT_KPIS = {
  totalCamps: 0, activeEmployees: 0, servedToday: 0, estimatedToday: 0,
  balance: 0, duplicates: 0, onlineDevices: 0, totalDevices: 0,
};

// Standard service windows (hours, 24h). Matches the cards' window labels.
const MEAL_WINDOWS: Record<"breakfast" | "lunch" | "dinner", [number, number]> = {
  breakfast: [5, 9],
  lunch: [11, 14.5],
  dinner: [18, 21.5],
};

function sessionStatus(meal: "breakfast" | "lunch" | "dinner"): "Completed" | "In progress" | "Upcoming" {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  const [start, end] = MEAL_WINDOWS[meal];
  if (h < start) return "Upcoming";
  if (h > end) return "Completed";
  return "In progress";
}

export const Route = createFileRoute("/overview")({
  component: Overview,
  head: () => ({ meta: [{ title: "Overview — MyMeals" }] }),
});

function Overview() {
  const campScope = useCampScope();
  const { data: camps = [] } = useCamps();
  const { data: companies = [] } = useCompanies();
  // Parent-company filter. "all" = no company restriction; camps are siblings,
  // so picking a company narrows the branch dropdown to that company's camps.
  const [company, setCompany] = useState<string>("all");
  const visibleCamps = useMemo(() => {
    let cs = campScope ? camps.filter((c) => campScope.includes(c.code)) : camps;
    if (company !== "all") cs = cs.filter((c) => c.companyCode === company);
    return cs;
  }, [campScope, camps, company]);
  const [branch, setBranch] = useState<string>("all");
  useEffect(() => {
    if (campScope && visibleCamps[0] && branch === "all") setBranch(visibleCamps[0].code);
  }, [campScope, visibleCamps, branch]);
  // If the selected branch no longer belongs to the chosen company, reset it.
  useEffect(() => {
    if (branch !== "all" && !visibleCamps.some((c) => c.code === branch)) setBranch("all");
  }, [visibleCamps, branch]);

  // "YYYY-MM-DD" — defaults to today, but the date picker lets the whole
  // dashboard look back at any single day instead of only ever "live".
  const todayIso = useMemo(() => new Date().toLocaleDateString("en-CA"), []);
  const [date, setDate] = useState<string>(todayIso);
  const isToday = date === todayIso;

  // Backend filters the entire overview payload by the chosen camp + company + date.
  const { data: overview } = useOverview(
    branch === "all" ? null : branch,
    company === "all" ? null : company,
    date,
  );
  const { data: recentScans = [] } = useScans(20);

  const kpis = overview?.kpis ?? DEFAULT_KPIS;
  const hourlyDistribution = overview?.hourlyDistribution ?? [];
  const weeklyTrend = overview?.weeklyTrend ?? [];
  const mealSplit = (overview?.mealSplit ?? []).map((m) => ({ ...m, color: MEAL_COLORS[m.name] ?? "var(--chart-1)" }));
  const campComparison = overview?.campComparison ?? [];
  const sessions = overview?.mealSessions ?? {
    breakfast: { served: 0, estimated: 0 },
    lunch: { served: 0, estimated: 0 },
    dinner: { served: 0, estimated: 0 },
  };

  const filteredCamps = branch === "all" ? visibleCamps : visibleCamps.filter((c) => c.code === branch);
  const filteredCampComparison = campComparison;

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  // A "live" concept — only meaningful when looking at today.
  const activeMealLabel = isToday
    ? sessionStatus("breakfast") === "In progress"
      ? "Breakfast"
      : sessionStatus("lunch") === "In progress"
        ? "Lunch"
        : sessionStatus("dinner") === "In progress"
          ? "Dinner"
          : null
    : null;

  const completion = Math.round((kpis.servedToday / kpis.estimatedToday) * 100);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-border">
        <div>
          <nav className="flex items-center text-[10px] font-bold tracking-[0.14em] uppercase text-muted-foreground">
            <span>Head Office</span>
            <ChevronRight className="size-3 mx-1 opacity-60" />
            <span className="text-primary">Live Overview</span>
          </nav>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight mt-1.5">
            {isToday ? "Live Distribution Overview" : "Distribution Overview"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isToday ? "Real-time monitoring" : `Snapshot for ${new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}`}
            {" "}across {visibleCamps.length} active regional {visibleCamps.length === 1 ? "camp" : "camps"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-border text-xs cursor-pointer">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <input
              type="date"
              value={date}
              max={todayIso}
              onChange={(e) => setDate(e.target.value || todayIso)}
              className="bg-transparent font-medium outline-none cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
              aria-label="Filter by date"
            />
          </label>
          {isToday && (
            <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-border text-xs">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="font-mono font-semibold tabular-nums">{timeStr}</span>
            </div>
          )}
          <div className="inline-flex items-center h-9 pl-3 pr-1 rounded-lg bg-card border border-border">
            <Building2 className="size-3.5 text-muted-foreground mr-2" />
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="bg-transparent text-xs font-medium pr-2 py-1 outline-none cursor-pointer text-foreground [&>option]:bg-card [&>option]:text-foreground"
              aria-label="Filter by company"
            >
              <option value="all">All companies</option>
              {companies.map((co) => (
                <option key={co.code} value={co.code}>{co.code} — {co.name}</option>
              ))}
            </select>
          </div>
          <div className="inline-flex items-center h-9 pl-3 pr-1 rounded-lg bg-card border border-border">
            <Building2 className="size-3.5 text-muted-foreground mr-2" />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="bg-transparent text-xs font-medium pr-2 py-1 outline-none cursor-pointer text-foreground [&>option]:bg-card [&>option]:text-foreground"
              aria-label="Filter by branch"
            >
              {!campScope && <option value="all">All branches</option>}
              {visibleCamps.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          {activeMealLabel && (
            <div className="h-9 px-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" /> {activeMealLabel} active
            </div>
          )}
        </div>
      </div>

      <SectionHeader title="Key metrics" subtitle="Operational pulse across all branches" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 -mt-4">
        <KpiCard label="Total Camps" value={branch === "all" ? visibleCamps.length : 1} icon={Building2} tone="primary" hint={branch === "all" ? "Across all branches" : `Branch ${branch}`} />
        <KpiCard label="Active Employees" value={kpis.activeEmployees.toLocaleString()} icon={Users} delta="+ 124 this week" />
        <KpiCard label={isToday ? "Meals Served Today" : "Meals Served"} value={kpis.servedToday.toLocaleString()} icon={Utensils} tone="accent" hint={`${completion}% of estimate`} progress={completion} />
        <KpiCard label={isToday ? "Estimated Today" : "Estimated"} value={kpis.estimatedToday.toLocaleString()} icon={Target} hint={`${kpis.balance.toLocaleString()} balance`} />
        <KpiCard label="Duplicate Attempts" value={kpis.duplicates} icon={AlertTriangle} tone="warm" hint="Auto-blocked" />
        <KpiCard label="Online Devices" value={`${kpis.onlineDevices}/${kpis.totalDevices}`} icon={Smartphone} tone="accent" delta="All synced" />
        <KpiCard label="Peak Throughput" value="312 / min" icon={TrendingUp} hint="12:14 PM today" />
        <KpiCard label="Live Scans" value="48 / min" icon={Activity} tone="primary" hint="Last 60 seconds" />
      </div>

      <div>
        <SectionHeader
          title="Meal sessions"
          subtitle={isToday ? "Today's distribution by service window" : "Distribution by service window"}
          right={<span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">{isToday ? "All camps · live" : "All camps"}</span>}
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SessionCard
            label="Breakfast"
            window="5:00 — 9:00 AM"
            icon={Coffee}
            served={sessions.breakfast.served}
            estimated={sessions.breakfast.estimated}
            color="var(--chart-3)"
            status={isToday ? sessionStatus("breakfast") : "Completed"}
          />
          <SessionCard
            label="Lunch"
            window="11:00 AM — 2:30 PM"
            icon={Sun}
            served={sessions.lunch.served}
            estimated={sessions.lunch.estimated}
            color="var(--chart-1)"
            status={isToday ? sessionStatus("lunch") : "Completed"}
            active={isToday && sessionStatus("lunch") === "In progress"}
          />
          <SessionCard
            label="Dinner"
            window="6:00 — 9:30 PM"
            icon={Moon}
            served={sessions.dinner.served}
            estimated={sessions.dinner.estimated}
            color="var(--chart-2)"
            status={isToday ? sessionStatus("dinner") : "Completed"}
            active={isToday && sessionStatus("dinner") === "In progress"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-1 rounded-full gradient-primary" />
              <div>
                <div className="font-display font-semibold text-[15px] leading-tight">Hourly distribution</div>
                <div className="text-xs text-muted-foreground mt-0.5">Today, all camps</div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Legend2 color="var(--chart-3)" label="Breakfast" />
              <Legend2 color="var(--chart-1)" label="Lunch" />
              <Legend2 color="var(--chart-2)" label="Dinner" />
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={hourlyDistribution}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="breakfast" stroke="var(--chart-3)" fill="url(#g3)" strokeWidth={2} />
                <Area type="monotone" dataKey="lunch" stroke="var(--chart-1)" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="dinner" stroke="var(--chart-2)" fill="url(#g2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-3">
            <div className="h-5 w-1 rounded-full gradient-primary" />
            <div>
              <div className="font-display font-semibold text-[15px] leading-tight">Today's meal split</div>
              <div className="text-xs text-muted-foreground mt-0.5">Served by session</div>
            </div>
          </div>
          <div className="h-56 mt-2">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={mealSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} stroke="none" paddingAngle={3}>
                  {mealSplit.map((m, i) => <Cell key={i} fill={m.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {mealSplit.map((m) => (
              <div key={m.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: m.color }} />
                  {m.name}
                </div>
                <span className="font-medium">{m.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-1 rounded-full gradient-primary" />
              <div>
                <div className="font-display font-semibold text-[15px] leading-tight">Camp comparison</div>
                <div className="text-xs text-muted-foreground mt-0.5">Served vs estimated, last 7 days</div>
              </div>
            </div>
            <button className="text-[11px] font-bold text-primary hover:underline uppercase tracking-wider">View report</button>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={filteredCampComparison}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--secondary)", opacity: 0.6 }} />
                <Bar dataKey="estimated" fill="var(--muted)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="served" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="h-5 w-1 rounded-full gradient-primary" />
              <div className="font-display font-semibold text-[15px] leading-tight">Live scan feed</div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              <span className="relative flex size-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full size-1.5 bg-emerald-500" />
              </span>
              Streaming
            </span>
          </div>
          <div className="space-y-1 max-h-80 overflow-auto pr-1 -mx-1">
            {recentScans.map((s) => {
              const tone =
                s.status === "Eligible" ? "bg-success/10 text-success"
                : s.status === "Already Served" ? "bg-warning/10 text-warning"
                : "bg-destructive/10 text-destructive";
              const reason = scanReason(s.status, s.meal);
              return (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary">
                  <div className="size-9 rounded-full gradient-primary grid place-items-center text-primary-foreground text-xs font-bold">
                    {s.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.labourId} · {s.camp} · {s.time}</div>
                    {reason && <div className="text-xs text-muted-foreground/80 italic truncate">{reason}</div>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${tone}`}>{s.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-5 w-1 rounded-full gradient-primary" />
            <div>
              <div className="font-display font-semibold text-[15px] leading-tight">Weekly trend</div>
              <div className="text-xs text-muted-foreground mt-0.5">Served vs estimated</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={weeklyTrend}>
                <defs>
                  <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="estimated" stroke="var(--muted-foreground)" strokeDasharray="4 4" fill="transparent" />
                <Area type="monotone" dataKey="served" stroke="var(--chart-1)" fill="url(#wg)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl bg-card border border-border p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-5 w-1 rounded-full gradient-primary" />
            <div className="font-display font-semibold text-[15px] leading-tight">Camp status</div>
          </div>
          <div className="space-y-2">
            {filteredCamps.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary">
                <div className="flex items-center gap-3">
                  <span className={`size-2 rounded-full ${c.online ? "bg-success animate-pulse" : "bg-destructive"}`} />
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.code} · {c.site}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{c.employees.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">employees</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
};

function Legend2({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </div>
  );
}

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="h-5 w-1 rounded-full gradient-primary" />
        <div>
          <div className="font-display font-semibold text-[15px] leading-tight">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

function SessionCard({
  label, window: timeWindow, icon: Icon, served, estimated, color, status, active,
}: {
  label: string;
  window: string;
  icon: React.ComponentType<{ className?: string }>;
  served: number;
  estimated: number;
  color: string;
  status: string;
  active?: boolean;
}) {
  const pct = estimated > 0 ? Math.min(100, Math.round((served / estimated) * 100)) : 0;
  const tone =
    status === "In progress" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20"
    : status === "Completed" ? "bg-secondary text-foreground/70"
    : "border border-border text-muted-foreground";
  return (
    <div className={`relative overflow-hidden rounded-xl bg-card border p-5 transition-all ${active ? "border-primary/50 ring-1 ring-primary/15 shadow-elegant" : "border-border"}`}>
      <div
        aria-hidden
        className="absolute -top-12 -right-12 size-32 rounded-full opacity-15 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg grid place-items-center" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
            <Icon className="size-5" />
          </div>
          <div>
            <div className="font-display font-semibold text-[15px] leading-tight">{label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">{timeWindow}</div>
          </div>
        </div>
        <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md font-bold inline-flex items-center gap-1.5 ${tone}`}>
          {active && <span className="size-1.5 rounded-full bg-success animate-pulse" />}
          {status}
        </span>
      </div>

      <div className="mt-5 flex items-end justify-between">
        <div>
          <div className="text-[28px] font-display font-bold tracking-tight tabular-nums leading-none">{served.toLocaleString()}</div>
          <div className="text-[11px] text-muted-foreground mt-1.5">Served of {estimated.toLocaleString()}</div>
        </div>
        <div className="text-right">
          <div className="text-base font-bold tabular-nums" style={{ color }}>{pct}%</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">completion</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}