import {
  ScanLine, CheckCircle2, AlertTriangle, ShieldAlert,
  Users, Building2, Utensils, Percent, FileBarChart, TrendingDown,
} from "lucide-react";
import type { ReportData } from "@/components/app/ReportPreview";

type Tone = "primary" | "success" | "warn" | "muted" | "danger" | "info";

function KpiTile({ label, value, icon: Icon, tone }: {
  label: string; value: string | number; icon: typeof ScanLine; tone: Tone;
}) {
  const colors: Record<Tone, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    muted: "bg-secondary text-muted-foreground",
    danger: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    info: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  };
  return (
    <div className="rounded-xl bg-card border border-border p-5 flex items-start justify-between gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">{label}</div>
        <div className="mt-2.5 font-display text-[26px] leading-none font-bold tracking-tight tabular-nums">{value}</div>
      </div>
      <div className={`size-9 rounded-lg grid place-items-center ${colors[tone]}`}>
        <Icon className="size-4" />
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  Eligible: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "Already Served": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "Wrong Camp": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  "Not Eligible": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  Expired: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  Active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  Leave: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Vacation: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  Inactive: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  Healthy: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  Watch: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Critical: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  Online: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  Offline: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

function Badge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "bg-secondary text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${tone}`}>
      {status}
    </span>
  );
}

function num(n: number) {
  return n.toLocaleString("en-US");
}

function classifyVariance(variance: number, estimated: number): "Healthy" | "Watch" | "Critical" {
  const pct = estimated > 0 ? (Math.abs(variance) / estimated) * 100 : 0;
  return pct <= 5 ? "Healthy" : pct <= 10 ? "Watch" : "Critical";
}

export function ReportsLiveView({ data, loading }: { data: ReportData | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
        No data.
      </div>
    );
  }

  if (data.kind === "consumption") return <ConsumptionView rows={data.rows} />;
  if (data.kind === "camp") return <CampView rows={data.rows} />;
  if (data.kind === "wastage") return <WastageView rows={data.rows} />;
  if (data.kind === "scans") return <ScansView rows={data.rows} />;
  return <EmployeeView rows={data.rows} />;
}

// ---------------- Consumption ----------------

function ConsumptionView({ rows }: { rows: Extract<ReportData, { kind: "consumption" }>["rows"] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      served: acc.served + r.served,
      estimated: acc.estimated + r.estimated,
      breakfast: acc.breakfast + r.breakfast,
      lunch: acc.lunch + r.lunch,
      dinner: acc.dinner + r.dinner,
      variance: acc.variance + r.variance,
    }),
    { served: 0, estimated: 0, breakfast: 0, lunch: 0, dinner: 0, variance: 0 },
  );
  const wastagePct = totals.estimated > 0 ? ((totals.estimated - totals.served) / totals.estimated) * 100 : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Total served" value={num(totals.served)} icon={CheckCircle2} tone="success" />
        <KpiTile label="Estimated" value={num(totals.estimated)} icon={Utensils} tone="primary" />
        <KpiTile label="Variance" value={(totals.variance < 0 ? "−" : "+") + num(Math.abs(totals.variance))} icon={TrendingDown} tone={totals.variance < 0 ? "danger" : "success"} />
        <KpiTile label="Wastage" value={`${wastagePct.toFixed(1)}%`} icon={Percent} tone={wastagePct > 10 ? "danger" : wastagePct > 5 ? "warn" : "success"} />
      </div>

      <DataCard headers={["Camp", "Breakfast", "Lunch", "Dinner", "Total Served", "Estimated", "Variance", "Status"]} rowCount={rows.length}>
        {rows.map((r) => {
          const status = classifyVariance(r.variance, r.estimated);
          return (
            <tr key={r.code} className="border-t border-border hover:bg-secondary/30">
              <td className="px-4 py-2.5">
                <div className="font-semibold text-[13px]">{r.code}</div>
                <div className="text-[11px] text-muted-foreground">{r.name} · {r.site}</div>
              </td>
              <td className="px-4 py-2.5 tabular-nums">{num(r.breakfast)}</td>
              <td className="px-4 py-2.5 tabular-nums">{num(r.lunch)}</td>
              <td className="px-4 py-2.5 tabular-nums">{num(r.dinner)}</td>
              <td className="px-4 py-2.5 tabular-nums font-semibold">{num(r.served)}</td>
              <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{num(r.estimated)}</td>
              <td className={`px-4 py-2.5 tabular-nums font-semibold ${r.variance < 0 ? "text-rose-400/80 dark:text-rose-300/80" : r.variance > 0 ? "text-emerald-400/80 dark:text-emerald-300/80" : "text-muted-foreground"}`}>
                {r.variance < 0 ? "−" : r.variance > 0 ? "+" : ""}{num(Math.abs(r.variance))}
              </td>
              <td className="px-4 py-2.5"><Badge status={status} /></td>
            </tr>
          );
        })}
      </DataCard>
    </>
  );
}

// ---------------- Camp Performance ----------------

function CampView({ rows }: { rows: Extract<ReportData, { kind: "camp" }>["rows"] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      employees: acc.employees + r.employees,
      served: acc.served + r.served,
      estimated: acc.estimated + r.estimated,
      online: acc.online + (r.online ? 1 : 0),
    }),
    { employees: 0, served: 0, estimated: 0, online: 0 },
  );
  const coverage = totals.estimated > 0 ? Math.round((totals.served / totals.estimated) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Active camps" value={`${totals.online} / ${rows.length}`} icon={Building2} tone="primary" />
        <KpiTile label="Employees" value={num(totals.employees)} icon={Users} tone="info" />
        <KpiTile label="Total served" value={num(totals.served)} icon={CheckCircle2} tone="success" />
        <KpiTile label="Coverage" value={`${coverage}%`} icon={Percent} tone={coverage >= 85 ? "success" : coverage >= 75 ? "warn" : "danger"} />
      </div>

      <DataCard headers={["Camp", "Employees", "Served", "Coverage", "Balance", "Duplicates", "Devices", "Status"]} rowCount={rows.length}>
        {rows.map((r) => (
          <tr key={r.code} className="border-t border-border hover:bg-secondary/30">
            <td className="px-4 py-2.5">
              <div className="font-semibold text-[13px]">{r.code}</div>
              <div className="text-[11px] text-muted-foreground">{r.name} · {r.site}</div>
            </td>
            <td className="px-4 py-2.5 tabular-nums">{num(r.employees)}</td>
            <td className="px-4 py-2.5 tabular-nums font-semibold">{num(r.served)}</td>
            <td className="px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-[120px]">
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full ${r.coverage >= 85 ? "bg-emerald-500/70" : r.coverage >= 75 ? "bg-amber-500/70" : "bg-rose-500/70"}`}
                    style={{ width: `${Math.min(r.coverage, 100)}%` }}
                  />
                </div>
                <span className="tabular-nums text-xs font-semibold w-9 text-right">{r.coverage}%</span>
              </div>
            </td>
            <td className="px-4 py-2.5 tabular-nums">{num(r.balance)}</td>
            <td className="px-4 py-2.5 tabular-nums">{num(r.duplicates)}</td>
            <td className="px-4 py-2.5 tabular-nums text-xs">{r.devicesOnline} / {r.devicesTotal}</td>
            <td className="px-4 py-2.5"><Badge status={r.online ? "Online" : "Offline"} /></td>
          </tr>
        ))}
      </DataCard>
    </>
  );
}

// ---------------- Wastage ----------------

function WastageView({ rows }: { rows: Extract<ReportData, { kind: "wastage" }>["rows"] }) {
  const sorted = [...rows].sort((a, b) => a.pct - b.pct);
  const totals = sorted.reduce(
    (acc, r) => ({
      estimated: acc.estimated + r.estimated,
      served: acc.served + r.served,
      wastage: acc.wastage + r.wastage,
      critical: acc.critical + (r.status === "critical" ? 1 : 0),
    }),
    { estimated: 0, served: 0, wastage: 0, critical: 0 },
  );
  const avgPct = totals.estimated > 0 ? (totals.wastage / totals.estimated) * 100 : 0;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Estimated" value={num(totals.estimated)} icon={Utensils} tone="primary" />
        <KpiTile label="Served" value={num(totals.served)} icon={CheckCircle2} tone="success" />
        <KpiTile label="Wastage" value={num(totals.wastage)} icon={TrendingDown} tone={avgPct > 10 ? "danger" : "warn"} />
        <KpiTile label="Avg %" value={`${avgPct.toFixed(1)}%`} icon={Percent} tone={avgPct > 10 ? "danger" : avgPct > 5 ? "warn" : "success"} />
      </div>

      <DataCard headers={["Camp", "Estimated", "Served", "Wastage", "% Wastage", "Status"]} rowCount={sorted.length}>
        {sorted.map((r) => {
          const widthPct = Math.min((r.pct / 10) * 50, 100);
          const fillColor = r.status === "healthy" ? "bg-emerald-500/70" : r.status === "watch" ? "bg-amber-500/70" : "bg-rose-500/70";
          const statusLabel = r.status === "healthy" ? "Healthy" : r.status === "watch" ? "Watch" : "Critical";
          return (
            <tr key={r.code} className="border-t border-border hover:bg-secondary/30">
              <td className="px-4 py-2.5">
                <div className="font-semibold text-[13px]">{r.code}</div>
                <div className="text-[11px] text-muted-foreground">{r.name} · {r.site}</div>
              </td>
              <td className="px-4 py-2.5 tabular-nums">{num(r.estimated)}</td>
              <td className="px-4 py-2.5 tabular-nums">{num(r.served)}</td>
              <td className="px-4 py-2.5 tabular-nums text-rose-400/75 dark:text-rose-300/75 font-medium">{num(r.wastage)}</td>
              <td className="px-4 py-2.5 min-w-[180px]">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden relative">
                    <div className={`h-full ${fillColor}`} style={{ width: `${widthPct}%` }} />
                    <div className="absolute top-0 bottom-0 w-px bg-sky-400/60" style={{ left: "50%" }} />
                  </div>
                  <span className="tabular-nums text-xs font-medium text-muted-foreground w-12 text-right">{r.pct.toFixed(1)}%</span>
                </div>
              </td>
              <td className="px-4 py-2.5"><Badge status={statusLabel} /></td>
            </tr>
          );
        })}
      </DataCard>
    </>
  );
}

// ---------------- Scans ----------------

function ScansView({ rows }: { rows: Extract<ReportData, { kind: "scans" }>["rows"] }) {
  const counts = rows.reduce(
    (acc, s) => {
      acc.total += 1;
      if (s.status === "Eligible") acc.eligible += 1;
      else acc.mismatch += 1;
      if (s.status === "Already Served") acc.duplicates += 1;
      return acc;
    },
    { total: 0, eligible: 0, mismatch: 0, duplicates: 0 },
  );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Total scans" value={num(counts.total)} icon={ScanLine} tone="primary" />
        <KpiTile label="Eligible" value={num(counts.eligible)} icon={CheckCircle2} tone="success" />
        <KpiTile label="Mismatches" value={num(counts.mismatch)} icon={AlertTriangle} tone="warn" />
        <KpiTile label="Duplicates" value={num(counts.duplicates)} icon={ShieldAlert} tone="danger" />
      </div>

      <DataCard
        headers={["Time", "Labour ID", "Employee", "Camp", "Device", "Meal", "Status", "Reason"]}
        rowCount={rows.length}
      >
        {rows.map((s) => (
          <tr key={s.id} className="border-t border-border hover:bg-secondary/30">
            <td className="px-4 py-2.5 whitespace-nowrap">
              <div className="font-semibold text-[13px] tabular-nums">{s.time}</div>
              <div className="text-[11px] text-muted-foreground">{s.date}</div>
            </td>
            <td className="px-4 py-2.5 tabular-nums text-xs font-mono">{s.labourId}</td>
            <td className="px-4 py-2.5 text-[13px]">{s.name}</td>
            <td className="px-4 py-2.5 text-xs font-medium">{s.camp}</td>
            <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">
              {s.device ?? "—"}
            </td>
            <td className="px-4 py-2.5 text-xs">{s.meal}</td>
            <td className="px-4 py-2.5"><Badge status={s.status} /></td>
            <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[260px]">
              {s.reason ?? "—"}
            </td>
          </tr>
        ))}
      </DataCard>
    </>
  );
}

// ---------------- Employees ----------------

function EmployeeView({ rows }: { rows: Extract<ReportData, { kind: "employee" }>["rows"] }) {
  const counts = rows.reduce(
    (acc, e) => {
      acc.total += 1;
      if (e.status === "Active") acc.active += 1;
      else acc.off += 1;
      if (e.breakfast && e.lunch && e.dinner) acc.threeMeal += 1;
      acc.companies.add(e.company);
      return acc;
    },
    { total: 0, active: 0, off: 0, threeMeal: 0, companies: new Set<string>() },
  );

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Employees" value={num(counts.total)} icon={Users} tone="primary" />
        <KpiTile label="Active" value={num(counts.active)} icon={CheckCircle2} tone="success" />
        <KpiTile label="Leave / Vacation / Inactive" value={num(counts.off)} icon={AlertTriangle} tone="warn" />
        <KpiTile label="3-meal eligible" value={num(counts.threeMeal)} icon={FileBarChart} tone="info" />
      </div>

      <DataCard headers={["Labour ID", "Employee", "Camp", "Company", "B / L / D", "Status"]} rowCount={rows.length}>
        {rows.map((e, i) => (
          <tr key={`${e.labourId}-${i}`} className="border-t border-border hover:bg-secondary/30">
            <td className="px-4 py-2.5 tabular-nums text-xs font-mono">{e.labourId}</td>
            <td className="px-4 py-2.5">
              <div className="font-semibold text-[13px]">{e.name}</div>
              <div className="text-[11px] text-muted-foreground">{e.designation}</div>
            </td>
            <td className="px-4 py-2.5 text-xs font-medium">{e.camp}</td>
            <td className="px-4 py-2.5 text-xs">{e.company}</td>
            <td className="px-4 py-2.5">
              <div className="flex gap-1.5">
                <Pill on={e.breakfast} label="B" tone="amber" />
                <Pill on={e.lunch} label="L" tone="rose" />
                <Pill on={e.dinner} label="D" tone="violet" />
              </div>
            </td>
            <td className="px-4 py-2.5"><Badge status={e.status} /></td>
          </tr>
        ))}
      </DataCard>
    </>
  );
}

function Pill({ on, label, tone }: { on: boolean; label: string; tone: "amber" | "rose" | "violet" }) {
  if (!on) {
    return <span className="size-5 grid place-items-center rounded text-[10px] text-muted-foreground bg-secondary/60 border border-border">—</span>;
  }
  const cls =
    tone === "amber" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
      : tone === "rose" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
        : "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30";
  return <span className={`size-5 grid place-items-center rounded text-[10px] font-bold border ${cls}`}>{label}</span>;
}

// ---------------- Shared table shell ----------------

function DataCard({ headers, rowCount, children }: { headers: string[]; rowCount: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-muted-foreground sticky top-0 z-10">
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {children}
            {rowCount === 0 && (
              <tr><td colSpan={headers.length} className="px-4 py-12 text-center text-muted-foreground">No records match the filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
