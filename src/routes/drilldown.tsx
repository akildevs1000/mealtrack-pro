import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { camps, hourlyDistribution, employees } from "@/lib/mock-data";
import { useCampScope } from "@/lib/session";
import { ArrowLeft, CalendarDays, Building2, Download, TrendingUp, Activity, Coffee, Sun, Moon, X, ChevronRight, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/drilldown")({
  component: DrilldownPage,
  head: () => ({
    meta: [
      { title: "Drilldown Report — MyMeals" },
      { name: "description", content: "Hourly and per-camp served vs estimated drilldown for the selected date and branch." },
    ],
  }),
});

const todayIso = new Date().toISOString().slice(0, 10);

type Meal = "all" | "breakfast" | "lunch" | "dinner";
const MEAL_SHARE: Record<Exclude<Meal, "all">, number> = { breakfast: 0.27, lunch: 0.42, dinner: 0.31 };

function DrilldownPage() {
  const scope = useCampScope();
  const visibleCamps = useMemo(() => (scope ? camps.filter((c) => scope.includes(c.code)) : camps), [scope]);
  const [date, setDate] = useState<string>(todayIso);
  const [branch, setBranch] = useState<string>(scope ? scope[0] : "all");
  const [meal, setMeal] = useState<Meal>("all");
  const [detail, setDetail] = useState<{ kind: "camp" | "hour"; campCode?: string; hour?: string } | null>(null);

  const seed = useMemo(() => hashString(`${date}-${branch}`), [date, branch]);
  const dayFactor = 0.85 + ((seed % 30) / 100); // 0.85..1.14

  const filteredCamps = branch === "all" ? visibleCamps : visibleCamps.filter((c) => c.code === branch);

  // Per-camp totals
  const perCamp = useMemo(() => filteredCamps.map((c) => {
    const estimatedAll = Math.round(c.employees * 2.9 * dayFactor);
    const variancePct = ((((c.employees + seed) % 23) - 11) / 100); // -0.11..0.11
    const servedAll = Math.max(0, Math.round(estimatedAll * (0.92 + variancePct)));
    const breakfast = Math.round(servedAll * MEAL_SHARE.breakfast);
    const lunch = Math.round(servedAll * MEAL_SHARE.lunch);
    const dinner = servedAll - breakfast - lunch;
    const served = meal === "all" ? servedAll : meal === "breakfast" ? breakfast : meal === "lunch" ? lunch : dinner;
    const estimated = meal === "all" ? estimatedAll : Math.round(estimatedAll * MEAL_SHARE[meal]);
    return {
      code: c.code,
      name: c.name,
      site: c.site,
      employees: c.employees,
      breakfast,
      lunch,
      dinner,
      served,
      estimated,
      variance: served - estimated,
      pct: estimated ? Math.round((served / estimated) * 100) : 0,
    };
  }), [filteredCamps, dayFactor, seed, meal]);

  // Hourly distribution scaled to selection
  const hourly = useMemo(() => {
    const totalEmpl = filteredCamps.reduce((s, c) => s + c.employees, 0);
    const baseTotal = camps.reduce((s, c) => s + c.employees, 0);
    const scale = baseTotal > 0 ? (totalEmpl / baseTotal) * dayFactor : 0;
    return hourlyDistribution.map((h) => {
      const breakfast = Math.round(h.breakfast * scale);
      const lunch = Math.round(h.lunch * scale);
      const dinner = Math.round(h.dinner * scale);
      const totalAll = breakfast + lunch + dinner;
      const total = meal === "all" ? totalAll : meal === "breakfast" ? breakfast : meal === "lunch" ? lunch : dinner;
      return { hour: h.hour, breakfast, lunch, dinner, total };
    });
  }, [filteredCamps, dayFactor, meal]);

  const totals = perCamp.reduce(
    (a, r) => ({
      served: a.served + r.served,
      estimated: a.estimated + r.estimated,
      breakfast: a.breakfast + r.breakfast,
      lunch: a.lunch + r.lunch,
      dinner: a.dinner + r.dinner,
    }),
    { served: 0, estimated: 0, breakfast: 0, lunch: 0, dinner: 0 },
  );
  const totalCompletion = totals.estimated ? Math.round((totals.served / totals.estimated) * 100) : 0;
  const peak = hourly.reduce((m, h) => (h.total > m.total ? h : m), { hour: "—", total: 0 } as typeof hourly[number]);

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("MyMeals — Drilldown Report", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Date: ${date}    Branch: ${branch}    Meal: ${meal}    Served: ${totals.served} of ${totals.estimated} (${totalCompletion}%)`, 14, 22);

    autoTable(doc, {
      head: [["Hour", "Breakfast", "Lunch", "Dinner", "Total"]],
      body: hourly.map((h) => [h.hour, h.breakfast, h.lunch, h.dinner, h.total]),
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      didDrawPage: () => {
        doc.setFontSize(11);
        doc.text("Hourly distribution", 14, 28 - 2);
      },
    });

    autoTable(doc, {
      head: [["Camp", "Site", "Breakfast", "Lunch", "Dinner", "Served", "Estimated", "Variance", "%"]],
      body: perCamp.map((r) => [r.code, r.site, r.breakfast, r.lunch, r.dinner, r.served, r.estimated, r.variance, r.pct + "%"]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    });
    doc.save(`drilldown_${date}_${branch}_${meal}.pdf`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-border">
        <div>
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary mb-1.5">
            <ArrowLeft className="size-3" /> Back to reports
          </Link>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">Drilldown report</h1>
          <p className="text-sm text-muted-foreground mt-1">Hourly and per-camp served vs estimated for the selected date and branch.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center h-9 p-1 rounded-lg bg-card border border-border" role="tablist" aria-label="Meal session">
            {([
              { k: "all", label: "All", Icon: Activity },
              { k: "breakfast", label: "Breakfast", Icon: Coffee },
              { k: "lunch", label: "Lunch", Icon: Sun },
              { k: "dinner", label: "Dinner", Icon: Moon },
            ] as const).map(({ k, label, Icon }) => {
              const active = meal === k;
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMeal(k)}
                  className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-semibold transition-colors ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              );
            })}
          </div>
          <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-border text-xs">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-xs font-medium outline-none cursor-pointer"
              aria-label="Select date"
            />
          </div>
          <div className="inline-flex items-center h-9 pl-3 pr-1 rounded-lg bg-card border border-border">
            <Building2 className="size-3.5 text-muted-foreground mr-2" />
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="bg-transparent text-xs font-medium pr-2 py-1 outline-none cursor-pointer text-foreground [&>option]:bg-card [&>option]:text-foreground"
              aria-label="Filter by branch"
            >
              {!scope && <option value="all">All branches</option>}
              {visibleCamps.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <button onClick={exportPdf} className="h-9 px-4 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold shadow-elegant inline-flex items-center gap-2">
            <Download className="size-3.5" /> Export PDF
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Served" value={totals.served.toLocaleString()} hint={`${totalCompletion}% of estimate`} icon={Activity} progress={totalCompletion} />
        <SummaryCard label="Estimated" value={totals.estimated.toLocaleString()} hint={`${(totals.estimated - totals.served).toLocaleString()} balance`} icon={TrendingUp} />
        <SummaryCard label="Peak Hour" value={peak.hour} hint={`${peak.total.toLocaleString()} meals`} icon={Sun} />
        <SummaryCard label="Camps in Scope" value={perCamp.length} hint={branch === "all" ? "All branches" : `Branch ${branch}`} icon={Building2} />
      </div>

      {/* Meal split */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MealStatCard label="Breakfast" icon={Coffee} value={totals.breakfast} color="var(--chart-3)" />
        <MealStatCard label="Lunch" icon={Sun} value={totals.lunch} color="var(--chart-1)" />
        <MealStatCard label="Dinner" icon={Moon} value={totals.dinner} color="var(--chart-2)" />
      </div>

      {/* Hourly chart */}
      <div className="rounded-xl bg-card border border-border p-5">
        <SectionHead title="Hourly distribution" subtitle={`Service throughput on ${date} · click an hour to drill down`} right={<Legend />} />
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={hourly} onClick={(s: any) => { const h = s?.activeLabel; if (h) setDetail({ kind: "hour", hour: String(h) }); }} style={{ cursor: "pointer" }}>
              <defs>
                <linearGradient id="dB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.6} /><stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} /></linearGradient>
                <linearGradient id="dL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} /><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} /></linearGradient>
                <linearGradient id="dD" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.6} /><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine x={peak.hour} stroke="var(--chart-1)" strokeDasharray="3 3" label={{ value: "Peak", fill: "var(--muted-foreground)", fontSize: 10 }} />
              <Area type="monotone" dataKey="breakfast" stroke="var(--chart-3)" fill="url(#dB)" strokeWidth={2} />
              <Area type="monotone" dataKey="lunch" stroke="var(--chart-1)" fill="url(#dL)" strokeWidth={2} />
              <Area type="monotone" dataKey="dinner" stroke="var(--chart-2)" fill="url(#dD)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hourly.map((h) => (
            <button key={h.hour} onClick={() => setDetail({ kind: "hour", hour: h.hour })}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-xs font-medium tabular-nums">
              <span className="text-muted-foreground">{h.hour}</span>
              <span className="font-bold">{h.total.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Per-camp comparison */}
      <div className="rounded-xl bg-card border border-border p-5">
        <SectionHead title="Per-camp served vs estimated" subtitle={(branch === "all" ? "All branches" : `Branch ${branch}`) + " · click a bar to drill down"} />
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={perCamp} barCategoryGap="22%" onClick={(s: any) => { const code = s?.activeLabel; if (code) setDetail({ kind: "camp", campCode: String(code) }); }} style={{ cursor: "pointer" }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="code" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="estimated" fill="var(--muted)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="served" radius={[6, 6, 0, 0]}>
                {perCamp.map((r) => (
                  <Cell key={r.code} fill={r.pct >= 90 ? "var(--chart-1)" : r.pct >= 75 ? "var(--chart-3)" : "var(--chart-2)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-camp detail table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-5 w-1 rounded-full gradient-primary" />
            <div>
              <div className="font-display font-semibold text-[15px] leading-tight">Per-camp detail</div>
              <div className="text-xs text-muted-foreground mt-0.5">{perCamp.length} camps · {date} · click a row to drill down</div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr>
                {["Camp", "Site", "Breakfast", "Lunch", "Dinner", "Served", "Estimated", "Variance", "Completion", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perCamp.map((r) => (
                <tr key={r.code} onClick={() => setDetail({ kind: "camp", campCode: r.code })} className="border-t border-border hover:bg-secondary/40 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.code}</div>
                    <div className="text-xs text-muted-foreground">{r.name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.site}</td>
                  <td className="px-4 py-3 tabular-nums">{r.breakfast.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{r.lunch.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{r.dinner.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold">{r.served.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.estimated.toLocaleString()}</td>
                  <td className={`px-4 py-3 tabular-nums font-semibold ${r.variance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {r.variance >= 0 ? "+" : ""}{r.variance.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[80px] h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div className={`h-full rounded-full ${r.pct >= 90 ? "bg-emerald-500" : r.pct >= 75 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums w-10 text-right">{r.pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground"><ChevronRight className="size-4" /></td>
                </tr>
              ))}
              {perCamp.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No camps in scope.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {detail && (
        <EmployeeDrilldown
          detail={detail}
          date={date}
          meal={meal}
          seed={seed}
          campsInScope={filteredCamps.map((c) => c.code)}
          onClose={() => setDetail(null)}
        />
      )}
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

function SectionHead({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
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

function Legend() {
  return (
    <div className="flex items-center gap-3 text-xs">
      {[
        { c: "var(--chart-3)", l: "Breakfast" },
        { c: "var(--chart-1)", l: "Lunch" },
        { c: "var(--chart-2)", l: "Dinner" },
      ].map((x) => (
        <div key={x.l} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: x.c }} />
          {x.l}
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, hint, icon: Icon, progress }: { label: string; value: string | number; hint?: string; icon: typeof Activity; progress?: number }) {
  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">{label}</div>
          <div className="mt-2.5 font-display text-[28px] leading-none font-bold tracking-tight tabular-nums">{value}</div>
          {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <Icon className="size-4" />
        </div>
      </div>
      {typeof progress === "number" && (
        <div className="mt-3 h-1 rounded-full bg-secondary overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
    </div>
  );
}

function MealStatCard({ label, icon: Icon, value, color }: { label: string; icon: typeof Coffee; value: number; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card border border-border p-5">
      <div aria-hidden className="absolute -top-12 -right-12 size-32 rounded-full opacity-15 blur-2xl" style={{ background: color }} />
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-lg grid place-items-center" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">{label}</div>
          <div className="font-display text-2xl font-bold tracking-tight tabular-nums">{value.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type EmpStatus = "Served" | "Missed" | "Already Served" | "Wrong Camp" | "Not Eligible" | "Late Arrival";
const STATUS_TONE: Record<EmpStatus, string> = {
  "Served": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "Missed": "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "Already Served": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "Wrong Camp": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  "Not Eligible": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  "Late Arrival": "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
};
const REASONS: Record<EmpStatus, string[]> = {
  "Served": ["Scan accepted", "Verified at counter", "Window match"],
  "Missed": ["No scan during window", "On unscheduled leave", "Off-site assignment"],
  "Already Served": ["Duplicate scan attempt", "Re-scanned within 5 min"],
  "Wrong Camp": ["Scanned at non-assigned camp", "Visiting other site"],
  "Not Eligible": ["Meal not in plan", "Status: Vacation/Leave"],
  "Late Arrival": ["Scanned after window close", "Manual override pending"],
};

function EmployeeDrilldown({
  detail, date, meal, seed, campsInScope, onClose,
}: {
  detail: { kind: "camp" | "hour"; campCode?: string; hour?: string };
  date: string;
  meal: Meal;
  seed: number;
  campsInScope: string[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmpStatus>("all");

  const mealLabel = meal === "all" ? "All meals" : meal[0].toUpperCase() + meal.slice(1);
  const title = detail.kind === "camp" ? `Camp ${detail.campCode}` : `Hour ${detail.hour}`;

  // Build employee-level synthetic dataset
  const rows = useMemo(() => {
    const inferMeal = (h?: string): Exclude<Meal, "all"> => {
      if (!h) return "lunch";
      if (/PM/i.test(h)) {
        const n = parseInt(h);
        if (n >= 6) return "dinner";
        return "lunch";
      }
      return "breakfast";
    };
    const effectiveMeal: Exclude<Meal, "all"> =
      meal !== "all" ? meal : detail.kind === "hour" ? inferMeal(detail.hour) : "lunch";

    const pool = employees.filter((e) => {
      if (detail.kind === "camp") return e.camp === detail.campCode;
      return campsInScope.includes(e.camp);
    });

    return pool.map((e, i) => {
      const key = hashString(`${seed}-${e.id}-${detail.campCode ?? ""}-${detail.hour ?? ""}-${effectiveMeal}`);
      const eligibleFlag = effectiveMeal === "breakfast" ? e.breakfast : effectiveMeal === "dinner" ? e.dinner : e.lunch;
      let status: EmpStatus;
      if (e.status === "Vacation" || e.status === "Leave" || e.status === "Inactive") status = "Not Eligible";
      else if (!eligibleFlag) status = "Not Eligible";
      else {
        const r = key % 100;
        if (r < 78) status = "Served";
        else if (r < 86) status = "Missed";
        else if (r < 91) status = "Already Served";
        else if (r < 95) status = "Wrong Camp";
        else status = "Late Arrival";
      }
      const reasonList = REASONS[status];
      const reason = reasonList[key % reasonList.length];
      const minute = (key % 60).toString().padStart(2, "0");
      const hourPart = detail.kind === "hour" && detail.hour ? detail.hour : "—";
      const time = status === "Served" || status === "Already Served" || status === "Wrong Camp" || status === "Late Arrival"
        ? `${hourPart} :${minute}`
        : "—";
      return { ...e, idx: i, status, reason, time, meal: effectiveMeal };
    });
  }, [detail, meal, seed, campsInScope]);

  const counts = rows.reduce((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {} as Record<EmpStatus, number>);
  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.labourId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const served = counts["Served"] ?? 0;
  const mismatches = rows.length - served - (counts["Not Eligible"] ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl h-full bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">Employee drilldown</div>
            <div className="font-display text-xl font-bold tracking-tight mt-0.5">{title}</div>
            <div className="text-xs text-muted-foreground mt-1">{date} · {mealLabel} · {rows.length} employees in scope</div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground" aria-label="Close drilldown">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-3 grid grid-cols-3 gap-2 border-b border-border">
          <Stat label="Served" value={served} icon={CheckCircle2} tone="text-emerald-600 dark:text-emerald-400" />
          <Stat label="Mismatches" value={mismatches} icon={AlertTriangle} tone="text-amber-600 dark:text-amber-400" />
          <Stat label="Not Eligible" value={counts["Not Eligible"] ?? 0} icon={X} tone="text-muted-foreground" />
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-border">
          <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-secondary/60 border border-border flex-1 min-w-[180px]">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or labour ID" className="bg-transparent text-xs outline-none w-full" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-8 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_TONE) as EmpStatus[]).map((s) => <option key={s} value={s}>{s} ({counts[s] ?? 0})</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground sticky top-0">
              <tr>
                {["Employee", "Camp", "Status", "Reason", "Time"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-[13px]">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{r.labourId} · {r.designation}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.camp}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_TONE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.reason}</td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">{r.time}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">No employees match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Activity; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground"><Icon className={`size-3 ${tone}`} />{label}</div>
      <div className={`mt-1 font-display text-xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
