import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useReportScans, useCamps } from "@/lib/hooks";
import { useCampScope } from "@/lib/session";
import {
  ArrowLeft,
  CalendarDays,
  Building2,
  Search,
  Download,
  ScanLine,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Filter,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/audit")({
  component: AuditPage,
  head: () => ({
    meta: [
      { title: "Audit Log — MyMeals" },
      {
        name: "description",
        content: "Per-employee scan audit log with timestamps, camp/session and scan status.",
      },
    ],
  }),
});

// The five scan statuses the backend records (ScanStatus enum, surfaced as the
// UI labels returned by /reports/scans).
type Status = "Eligible" | "Already Served" | "Not Eligible" | "Wrong Camp" | "Expired";
type Meal = "Breakfast" | "Lunch" | "Dinner";

const STATUS_TONE: Record<Status, string> = {
  Eligible: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "Already Served": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "Wrong Camp": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  "Not Eligible": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  Expired: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};

const todayIso = new Date().toISOString().slice(0, 10);

function AuditPage() {
  const scope = useCampScope();
  const { data: campsData } = useCamps();
  const camps = useMemo(() => campsData ?? [], [campsData]);
  const visibleCamps = useMemo(
    () => (scope ? camps.filter((c) => scope.includes(c.code)) : camps),
    [scope, camps],
  );
  const [date, setDate] = useState(todayIso);
  const [campFilter, setCampFilter] = useState<string>(scope ? scope[0] : "all");
  const [mealFilter, setMealFilter] = useState<"all" | Meal>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status | "mismatch">("all");
  const [query, setQuery] = useState("");

  // Real scan events for the selected day. Camp/meal/search are pushed to the
  // server; status (incl. the "mismatch" pseudo-filter) is applied client-side.
  const { data, isLoading } = useReportScans({
    from: date,
    to: date,
    campCode: campFilter !== "all" ? campFilter : undefined,
    meal: mealFilter !== "all" ? mealFilter : undefined,
    q: query || undefined,
  });
  const events = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (statusFilter === "mismatch") return e.status !== "Eligible";
        if (statusFilter !== "all" && e.status !== statusFilter) return false;
        return true;
      }),
    [events, statusFilter],
  );

  const counts = events.reduce(
    (acc, e) => {
      acc.total++;
      if (e.status === "Eligible") acc.eligible++;
      else acc.mismatch++;
      return acc;
    },
    { total: 0, eligible: 0, mismatch: 0 },
  );

  function exportCsv() {
    const rows = [
      ["Date", "Time", "Employee", "Labour ID", "Camp", "Meal", "Status"],
      ...filtered.map((e) => [e.date, e.time, e.name, e.labourId, e.camp, e.meal, e.status]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_log_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("MyMeals — Employee Scan Audit Log", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(
      `Date: ${date}    Events: ${filtered.length}    Mismatches: ${filtered.filter((e) => e.status !== "Eligible").length}`,
      14,
      22,
    );
    autoTable(doc, {
      head: [["Time", "Employee", "Labour ID", "Camp", "Meal", "Status"]],
      body: filtered.map((e) => [e.time, e.name, e.labourId, e.camp, e.meal, e.status]),
      startY: 28,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    });
    doc.save(`audit_log_${date}.pdf`);
  }

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
            Employee audit log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every recorded scan event with timestamp, camp, session and scan status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCsv}
            className="h-9 px-3 rounded-lg bg-card border border-border text-xs font-semibold inline-flex items-center gap-2 hover:bg-secondary"
          >
            <Download className="size-3.5" /> CSV
          </button>
          <button
            onClick={exportPdf}
            className="h-9 px-4 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold shadow-elegant inline-flex items-center gap-2"
          >
            <Download className="size-3.5" /> Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Total scan events" value={counts.total} icon={ScanLine} tone="primary" />
        <KpiTile label="Accepted" value={counts.eligible} icon={CheckCircle2} tone="success" />
        <KpiTile label="Mismatches" value={counts.mismatch} icon={AlertTriangle} tone="warn" />
        <KpiTile
          label="Compliance"
          value={counts.total ? Math.round((counts.eligible / counts.total) * 100) + "%" : "—"}
          icon={ShieldAlert}
          tone="muted"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2 text-xs uppercase tracking-[0.12em] font-bold text-muted-foreground">
            <Filter className="size-3.5" /> Filters
          </div>
          <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-secondary/60 border border-border text-xs">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-xs font-medium outline-none cursor-pointer"
            />
          </div>
          <div className="inline-flex items-center h-8 pl-2.5 pr-1 rounded-md bg-secondary/60 border border-border">
            <Building2 className="size-3.5 text-muted-foreground mr-2" />
            <select
              value={campFilter}
              onChange={(e) => setCampFilter(e.target.value)}
              className="bg-transparent text-xs font-medium pr-2 py-1 outline-none cursor-pointer"
            >
              {!scope && <option value="all">All camps</option>}
              {visibleCamps.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <select
            value={mealFilter}
            onChange={(e) => setMealFilter(e.target.value as "all" | Meal)}
            className="h-8 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none"
          >
            <option value="all">All meals</option>
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | Status | "mismatch")}
            className="h-8 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none"
          >
            <option value="all">All statuses</option>
            <option value="mismatch">Mismatches only</option>
            {(Object.keys(STATUS_TONE) as Status[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-secondary/60 border border-border flex-1 min-w-[200px]">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or labour ID…"
              className="bg-transparent text-xs outline-none w-full"
            />
          </div>
          <div className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filtered.length.toLocaleString()} events
          </div>
        </div>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground sticky top-0 z-10">
              <tr>
                {["Time", "Employee", "Camp", "Session", "Status"].map((h) => (
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
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-2.5 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                    <div className="font-semibold text-foreground">{e.time}</div>
                    <div className="text-[11px]">{e.date}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-[13px]">{e.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {e.labourId}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] font-medium">{e.camp}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{e.meal}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_TONE[e.status as Status] ?? "bg-secondary text-muted-foreground border-border"}`}
                    >
                      {e.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    {isLoading ? "Loading scan events…" : "No scan events match the filters."}
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

function KpiTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: typeof ScanLine;
  tone: "primary" | "success" | "warn" | "muted";
}) {
  const colors = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    muted: "bg-secondary text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-xl bg-card border border-border p-5 flex items-start justify-between gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">
          {label}
        </div>
        <div className="mt-2.5 font-display text-[26px] leading-none font-bold tracking-tight tabular-nums">
          {value}
        </div>
      </div>
      <div className={`size-9 rounded-lg grid place-items-center ${colors}`}>
        <Icon className="size-4" />
      </div>
    </div>
  );
}
