import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCamps, useReportConsumption, useReportScans, type ReportScanRow } from "@/lib/hooks";
import { useCampScope } from "@/lib/session";
import {
  ArrowLeft,
  CalendarDays,
  Building2,
  TrendingUp,
  Activity,
  Coffee,
  Sun,
  Moon,
  X,
  ChevronRight,
  Search,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";

export const Route = createFileRoute("/drilldown")({
  component: DrilldownPage,
  head: () => ({
    meta: [
      { title: "Drilldown Report — MyMeals" },
      {
        name: "description",
        content:
          "Hourly and per-camp served vs estimated drilldown for the selected date and branch.",
      },
    ],
  }),
});

const todayIso = new Date().toISOString().slice(0, 10);

type Meal = "all" | "breakfast" | "lunch" | "dinner";

// 24h hour → "12PM" style label, shared by the bucketed chart and the modal.
function formatHour(h: number) {
  if (Number.isNaN(h)) return "—";
  const period = h < 12 ? "AM" : "PM";
  const hr12 = h % 12 === 0 ? 12 : h % 12;
  return `${hr12}${period}`;
}

function DrilldownPage() {
  const scope = useCampScope();
  const { data: campsData } = useCamps();
  const camps = useMemo(() => campsData ?? [], [campsData]);
  const visibleCamps = useMemo(
    () => (scope ? camps.filter((c) => scope.includes(c.code)) : camps),
    [scope, camps],
  );
  const [date, setDate] = useState<string>(todayIso);
  const [branch, setBranch] = useState<string>(scope ? scope[0] : "all");
  const [meal, setMeal] = useState<Meal>("all");
  const [detail, setDetail] = useState<{
    kind: "camp" | "hour";
    campCode?: string;
    hour?: string;
  } | null>(null);

  const campCode = branch !== "all" ? branch : undefined;
  const consumption = useReportConsumption({ from: date, to: date, campCode });
  const { data: scanData } = useReportScans({ from: date, to: date, campCode });
  const scanRows = useMemo(() => scanData ?? [], [scanData]);

  // Per-camp served vs estimated, from the real consumption aggregation. The
  // backend's "estimated" is a formula (employees × days × 0.85); for a single
  // meal we apportion it evenly across the three sessions.
  const perCamp = useMemo(() => {
    const rows = consumption.data?.rows ?? [];
    return rows.map((c) => {
      const servedAll = c.served;
      const served =
        meal === "all"
          ? servedAll
          : meal === "breakfast"
            ? c.breakfast
            : meal === "lunch"
              ? c.lunch
              : c.dinner;
      const estimated = meal === "all" ? c.estimated : Math.round(c.estimated / 3);
      return {
        code: c.code,
        name: c.name,
        site: c.site,
        employees: c.employees,
        breakfast: c.breakfast,
        lunch: c.lunch,
        dinner: c.dinner,
        served,
        estimated,
        variance: served - estimated,
        pct: estimated ? Math.round((served / estimated) * 100) : 0,
      };
    });
  }, [consumption.data, meal]);

  // Hourly throughput, bucketed from the real scan rows for the day.
  const hourly = useMemo(() => {
    const buckets = new Map<number, { breakfast: number; lunch: number; dinner: number }>();
    for (const s of scanRows) {
      const hr = parseInt(s.time.slice(0, 2), 10);
      if (Number.isNaN(hr)) continue;
      const b = buckets.get(hr) ?? { breakfast: 0, lunch: 0, dinner: 0 };
      if (s.meal === "Breakfast") b.breakfast++;
      else if (s.meal === "Lunch") b.lunch++;
      else if (s.meal === "Dinner") b.dinner++;
      buckets.set(hr, b);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hr, b]) => {
        const totalAll = b.breakfast + b.lunch + b.dinner;
        const total =
          meal === "all"
            ? totalAll
            : meal === "breakfast"
              ? b.breakfast
              : meal === "lunch"
                ? b.lunch
                : b.dinner;
        return {
          hour: formatHour(hr),
          breakfast: b.breakfast,
          lunch: b.lunch,
          dinner: b.dinner,
          total,
        };
      });
  }, [scanRows, meal]);

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
  const totalCompletion = totals.estimated
    ? Math.round((totals.served / totals.estimated) * 100)
    : 0;
  const peak = hourly.reduce((m, h) => (h.total > m.total ? h : m), {
    hour: "—",
    total: 0,
  } as (typeof hourly)[number]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-border">
        <div>
          <Link
            to="/reports"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary mb-1.5"
          >
            <ArrowLeft className="size-3" /> Back to reports
          </Link>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">
            Drilldown report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hourly and per-camp served vs estimated for the selected date and branch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center h-9 p-1 rounded-lg bg-card border border-border"
            role="tablist"
            aria-label="Meal session"
          >
            {(
              [
                { k: "all", label: "All", Icon: Activity },
                { k: "breakfast", label: "Breakfast", Icon: Coffee },
                { k: "lunch", label: "Lunch", Icon: Sun },
                { k: "dinner", label: "Dinner", Icon: Moon },
              ] as const
            ).map(({ k, label, Icon }) => {
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
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Served"
          value={totals.served.toLocaleString()}
          hint={`${totalCompletion}% of estimate`}
          icon={Activity}
          progress={totalCompletion}
        />
        <SummaryCard
          label="Estimated"
          value={totals.estimated.toLocaleString()}
          hint={`${(totals.estimated - totals.served).toLocaleString()} balance`}
          icon={TrendingUp}
        />
        <SummaryCard
          label="Peak Hour"
          value={peak.hour}
          hint={`${peak.total.toLocaleString()} meals`}
          icon={Sun}
        />
        <SummaryCard
          label="Camps in Scope"
          value={perCamp.length}
          hint={branch === "all" ? "All branches" : `Branch ${branch}`}
          icon={Building2}
        />
      </div>

      {/* Meal split */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MealStatCard
          label="Breakfast"
          icon={Coffee}
          value={totals.breakfast}
          color="var(--chart-3)"
        />
        <MealStatCard label="Lunch" icon={Sun} value={totals.lunch} color="var(--chart-1)" />
        <MealStatCard label="Dinner" icon={Moon} value={totals.dinner} color="var(--chart-2)" />
      </div>

      {/* Hourly chart */}
      <div className="rounded-xl bg-card border border-border p-5">
        <SectionHead
          title="Hourly distribution"
          subtitle={`Service throughput on ${date} · click an hour to drill down`}
          right={<Legend />}
        />
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart
              data={hourly}
              onClick={(s: { activeLabel?: string }) => {
                const h = s?.activeLabel;
                if (h) setDetail({ kind: "hour", hour: String(h) });
              }}
              style={{ cursor: "pointer" }}
            >
              <defs>
                <linearGradient id="dB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="dD" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine
                x={peak.hour}
                stroke="var(--chart-1)"
                strokeDasharray="3 3"
                label={{ value: "Peak", fill: "var(--muted-foreground)", fontSize: 10 }}
              />
              <Area
                type="monotone"
                dataKey="breakfast"
                stroke="var(--chart-3)"
                fill="url(#dB)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="lunch"
                stroke="var(--chart-1)"
                fill="url(#dL)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="dinner"
                stroke="var(--chart-2)"
                fill="url(#dD)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hourly.map((h) => (
            <button
              key={h.hour}
              onClick={() => setDetail({ kind: "hour", hour: h.hour })}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary text-xs font-medium tabular-nums"
            >
              <span className="text-muted-foreground">{h.hour}</span>
              <span className="font-bold">{h.total.toLocaleString()}</span>
            </button>
          ))}
          {hourly.length === 0 && (
            <span className="text-xs text-muted-foreground">No scans recorded for this day.</span>
          )}
        </div>
      </div>

      {/* Per-camp comparison */}
      <div className="rounded-xl bg-card border border-border p-5">
        <SectionHead
          title="Per-camp served vs estimated"
          subtitle={
            (branch === "all" ? "All branches" : `Branch ${branch}`) +
            " · click a bar to drill down"
          }
        />
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart
              data={perCamp}
              barCategoryGap="22%"
              onClick={(s: { activeLabel?: string }) => {
                const code = s?.activeLabel;
                if (code) setDetail({ kind: "camp", campCode: String(code) });
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="code"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="estimated" fill="var(--muted)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="served" radius={[6, 6, 0, 0]}>
                {perCamp.map((r) => (
                  <Cell
                    key={r.code}
                    fill={
                      r.pct >= 90
                        ? "var(--chart-1)"
                        : r.pct >= 75
                          ? "var(--chart-3)"
                          : "var(--chart-2)"
                    }
                  />
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
              <div className="font-display font-semibold text-[15px] leading-tight">
                Per-camp detail
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {perCamp.length} camps · {date} · click a row to drill down
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr>
                {[
                  "Camp",
                  "Site",
                  "Breakfast",
                  "Lunch",
                  "Dinner",
                  "Served",
                  "Estimated",
                  "Variance",
                  "Completion",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 font-medium text-xs uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perCamp.map((r) => (
                <tr
                  key={r.code}
                  onClick={() => setDetail({ kind: "camp", campCode: r.code })}
                  className="border-t border-border hover:bg-secondary/40 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{r.code}</div>
                    <div className="text-xs text-muted-foreground">{r.name}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.site}</td>
                  <td className="px-4 py-3 tabular-nums">{r.breakfast.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{r.lunch.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">{r.dinner.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold">
                    {r.served.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {r.estimated.toLocaleString()}
                  </td>
                  <td
                    className={`px-4 py-3 tabular-nums font-semibold ${r.variance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {r.variance >= 0 ? "+" : ""}
                    {r.variance.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-[80px] h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.pct >= 90 ? "bg-emerald-500" : r.pct >= 75 ? "bg-amber-500" : "bg-rose-500"}`}
                          style={{ width: `${Math.min(100, r.pct)}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold tabular-nums w-10 text-right">
                        {r.pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </td>
                </tr>
              ))}
              {perCamp.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    No camps in scope.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {detail && (
        <ScanDrilldown
          detail={detail}
          date={date}
          scanRows={scanRows}
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

function SectionHead({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
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

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  progress,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Activity;
  progress?: number;
}) {
  return (
    <div className="rounded-xl bg-card border border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">
            {label}
          </div>
          <div className="mt-2.5 font-display text-[28px] leading-none font-bold tracking-tight tabular-nums">
            {value}
          </div>
          {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
          <Icon className="size-4" />
        </div>
      </div>
      {typeof progress === "number" && (
        <div className="mt-3 h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function MealStatCard({
  label,
  icon: Icon,
  value,
  color,
}: {
  label: string;
  icon: typeof Coffee;
  value: number;
  color: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card border border-border p-5">
      <div
        aria-hidden
        className="absolute -top-12 -right-12 size-32 rounded-full opacity-15 blur-2xl"
        style={{ background: color }}
      />
      <div className="flex items-center gap-3">
        <div
          className="size-10 rounded-lg grid place-items-center"
          style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">
            {label}
          </div>
          <div className="font-display text-2xl font-bold tracking-tight tabular-nums">
            {value.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

type ScanStatus = ReportScanRow["status"];
const STATUS_TONE: Record<ScanStatus, string> = {
  Eligible: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "Already Served": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "Wrong Camp": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  "Not Eligible": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  Expired: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

function ScanDrilldown({
  detail,
  date,
  scanRows,
  onClose,
}: {
  detail: { kind: "camp" | "hour"; campCode?: string; hour?: string };
  date: string;
  scanRows: ReportScanRow[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ScanStatus>("all");

  const title = detail.kind === "camp" ? `Camp ${detail.campCode}` : `Hour ${detail.hour}`;

  // Real scan events scoped to the clicked camp or hour.
  const rows = useMemo(() => {
    return scanRows.filter((s) => {
      if (detail.kind === "camp") return s.camp === detail.campCode;
      return formatHour(parseInt(s.time.slice(0, 2), 10)) === detail.hour;
    });
  }, [scanRows, detail]);

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ScanStatus, number>,
  );
  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.labourId.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const served = counts["Eligible"] ?? 0;
  const notEligible = counts["Not Eligible"] ?? 0;
  const mismatches = rows.length - served - notEligible;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-2xl h-full bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Scan drilldown
            </div>
            <div className="font-display text-xl font-bold tracking-tight mt-0.5">{title}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {date} · {rows.length} scan event(s)
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground"
            aria-label="Close drilldown"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-3 grid grid-cols-3 gap-2 border-b border-border">
          <Stat
            label="Served"
            value={served}
            icon={CheckCircle2}
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <Stat
            label="Mismatches"
            value={mismatches}
            icon={AlertTriangle}
            tone="text-amber-600 dark:text-amber-400"
          />
          <Stat label="Not Eligible" value={notEligible} icon={X} tone="text-muted-foreground" />
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-border">
          <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-secondary/60 border border-border flex-1 min-w-[180px]">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or labour ID"
              className="bg-transparent text-xs outline-none w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | ScanStatus)}
            className="h-8 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none"
          >
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_TONE) as ScanStatus[]).map((s) => (
              <option key={s} value={s}>
                {s} ({counts[s] ?? 0})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground sticky top-0">
              <tr>
                {["Employee", "Camp", "Meal", "Status", "Time"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-[13px]">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {r.labourId}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.camp}</td>
                  <td className="px-4 py-2.5 text-xs">{r.meal}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_TONE[r.status]}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground">
                    {r.time}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No scan events match the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
        <Icon className={`size-3 ${tone}`} />
        {label}
      </div>
      <div className={`mt-1 font-display text-xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
