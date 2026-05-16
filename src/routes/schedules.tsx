import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { useAppUsers } from "@/lib/hooks";
import { camps, employees } from "@/lib/mock-data";
import {
  CalendarClock, Mail, Plus, Trash2, Send, Power, FileText, FileSpreadsheet,
  Clock, Users, ChevronRight, AlertTriangle, CheckCircle2, ArrowLeft,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/schedules")({
  component: SchedulesPage,
  head: () => ({ meta: [{ title: "Scheduled Reports — MyMeals" }] }),
});

type Frequency = "daily" | "weekly" | "monthly";
type ReportType = "daily_summary" | "weekly_camp" | "monthly_consumption" | "audit_log";
type Format = "pdf" | "excel" | "both";

type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  reportType: ReportType;
  format: Format;
  frequency: Frequency;
  time: string;          // "HH:MM"
  weekday?: number;      // 0..6 Sun..Sat (weekly)
  dayOfMonth?: number;   // 1..28 (monthly)
  recipientIds: string[];
  lastRunAt?: string;
  lastRunStatus?: "success" | "queued" | "failed";
};

const STORAGE = "mealops.schedules.v1";

const REPORT_LABEL: Record<ReportType, string> = {
  daily_summary: "Daily distribution summary",
  weekly_camp: "Weekly camp performance",
  monthly_consumption: "Monthly consumption + wastage",
  audit_log: "Employee audit log",
};

const REPORT_DEFAULT_FORMAT: Record<ReportType, Format> = {
  daily_summary: "pdf",
  weekly_camp: "excel",
  monthly_consumption: "both",
  audit_log: "excel",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Meal service windows used to warn when delivery time falls outside ops hours.
const MEAL_WINDOWS: { name: string; start: string; end: string }[] = [
  { name: "Breakfast", start: "06:00", end: "09:30" },
  { name: "Lunch",     start: "12:00", end: "14:30" },
  { name: "Dinner",    start: "18:00", end: "21:00" },
];

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

type Issue = { level: "error" | "warning"; message: string };

function validateSchedule(s: Schedule, all: Schedule[]): Issue[] {
  const issues: Issue[] = [];

  // Missing weekday / day-of-month
  if (s.frequency === "weekly" && (s.weekday === undefined || s.weekday === null)) {
    issues.push({ level: "error", message: "Pick a day of the week for this weekly schedule." });
  }
  if (s.frequency === "monthly" && (s.dayOfMonth === undefined || s.dayOfMonth === null)) {
    issues.push({ level: "error", message: "Pick a day of the month for this monthly schedule." });
  }

  // Overlapping daily schedules — same time-of-day on another daily schedule
  if (s.frequency === "daily" && s.time) {
    const conflict = all.find(
      (o) => o.id !== s.id && o.frequency === "daily" && o.time === s.time,
    );
    if (conflict) {
      issues.push({
        level: "error",
        message: `Overlaps with “${conflict.name}” which already runs daily at ${s.time}. Pick a different time.`,
      });
    }
  }

  // Outside meal windows — warn only
  if (s.time) {
    const t = toMin(s.time);
    const inWindow = MEAL_WINDOWS.some((w) => t >= toMin(w.start) && t <= toMin(w.end));
    if (!inWindow) {
      issues.push({
        level: "warning",
        message: `Time ${s.time} falls outside meal windows (Breakfast 06:00–09:30, Lunch 12:00–14:30, Dinner 18:00–21:00).`,
      });
    }
  }

  return issues;
}

function defaultSchedules(): Schedule[] {
  return [
    {
      id: "s_daily", name: "Daily ops summary — 07:30",
      enabled: true, reportType: "daily_summary", format: "pdf",
      frequency: "daily", time: "07:30", recipientIds: [],
    },
    {
      id: "s_weekly", name: "Weekly camp performance — Mon 08:00",
      enabled: true, reportType: "weekly_camp", format: "excel",
      frequency: "weekly", time: "08:00", weekday: 1, recipientIds: [],
    },
    {
      id: "s_monthly", name: "Monthly consumption — 1st @ 09:00",
      enabled: false, reportType: "monthly_consumption", format: "both",
      frequency: "monthly", time: "09:00", dayOfMonth: 1, recipientIds: [],
    },
  ];
}

function SchedulesPage() {
  const { currentUser } = useSession();
  const { data: users = [] } = useAppUsers();
  const adminRecipients = useMemo(
    () => users.filter((u) => (u.role === "admin" || u.role === "operator") && u.status === "Active"),
    [users],
  );

  const [schedules, setSchedules] = useState<Schedule[]>(() => {
    if (typeof window === "undefined") return defaultSchedules();
    try {
      const raw = window.localStorage.getItem(STORAGE);
      if (raw) return JSON.parse(raw) as Schedule[];
    } catch { /* ignore */ }
    const seed = defaultSchedules();
    // pre-fill recipients with the active admins
    const ids = adminRecipients.map((u) => u.id);
    return seed.map((s) => ({ ...s, recipientIds: ids }));
  });

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE, JSON.stringify(schedules)); } catch { /* ignore */ }
  }, [schedules]);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "operator";

  function update(id: string, patch: Partial<Schedule>) {
    setSchedules((arr) => arr.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function remove(id: string) {
    setSchedules((arr) => arr.filter((s) => s.id !== id));
  }
  function add() {
    const id = `s_${Date.now().toString(36)}`;
    setSchedules((arr) => [
      {
        id, name: "New scheduled report",
        enabled: false, reportType: "daily_summary", format: "pdf",
        frequency: "daily", time: "08:00",
        recipientIds: adminRecipients.map((u) => u.id),
      }, ...arr,
    ]);
  }

  function sendNow(s: Schedule) {
    try {
      const files = generateReportFiles(s);
      files.forEach((f) => downloadBlob(f.blob, f.filename));
      update(s.id, { lastRunAt: new Date().toISOString(), lastRunStatus: "success" });
    } catch (e) {
      console.error(e);
      update(s.id, { lastRunAt: new Date().toISOString(), lastRunStatus: "failed" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-border">
        <div>
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary mb-1.5">
            <ArrowLeft className="size-3" /> Back to reports
          </Link>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">Scheduled reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure automated daily, weekly and monthly PDF/Excel reports delivered to admin recipients.
          </p>
        </div>
        {isAdmin && (
          <button onClick={add} className="h-9 px-4 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold shadow-elegant inline-flex items-center gap-2">
            <Plus className="size-3.5" /> New schedule
          </button>
        )}
      </div>

      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 flex items-start gap-3">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed">
          <div className="font-semibold text-amber-700 dark:text-amber-400">Scheduling is configured — automatic delivery needs Lovable Cloud + Emails</div>
          <div className="text-muted-foreground mt-1">
            Use <span className="font-semibold">Send now</span> to generate exactly the file the cron will email. When you're ready, enable Lovable Cloud + Lovable Emails and I'll wire the cron worker that drains these schedules at their configured times.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {schedules.map((s) => (
          <ScheduleCard
            key={s.id} schedule={s} adminRecipients={adminRecipients}
            issues={validateSchedule(s, schedules)}
            onChange={(patch) => update(s.id, patch)}
            onRemove={() => remove(s.id)}
            onSendNow={() => sendNow(s)}
            readOnly={!isAdmin}
          />
        ))}
        {schedules.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground col-span-full">
            No schedules yet. Click “New schedule”.
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleCard({
  schedule: s, adminRecipients, issues, onChange, onRemove, onSendNow, readOnly,
}: {
  schedule: Schedule;
  adminRecipients: { id: string; name: string; email: string; role: string }[];
  issues: Issue[];
  onChange: (patch: Partial<Schedule>) => void;
  onRemove: () => void;
  onSendNow: () => void;
  readOnly: boolean;
}) {
  const next = nextRunDate(s);
  const hasError = issues.some((i) => i.level === "error");
  const recipientChips = s.recipientIds
    .map((id) => adminRecipients.find((u) => u.id === id))
    .filter(Boolean) as { id: string; name: string; email: string }[];

  return (
    <div className={`rounded-xl border bg-card p-5 space-y-4 ${
      hasError ? "border-rose-500/50" : s.enabled ? "border-border" : "border-border/60 opacity-90"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <input
            value={s.name}
            disabled={readOnly}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full bg-transparent font-display font-bold text-[17px] leading-tight tracking-tight outline-none focus:bg-secondary/40 rounded px-1 -ml-1"
          />
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
            <CalendarClock className="size-3.5" />
            {humanCadence(s)}
            <span className="text-muted-foreground/40">·</span>
            <span>Next: {next ? next.toLocaleString() : "—"}</span>
          </div>
        </div>
        <button
          onClick={() => {
            if (!s.enabled && hasError) return;
            onChange({ enabled: !s.enabled });
          }}
          disabled={readOnly || (hasError && !s.enabled)}
          title={hasError && !s.enabled ? "Resolve validation errors before enabling" : undefined}
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-semibold border transition ${
            s.enabled
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
              : "bg-secondary text-muted-foreground border-border"
          } ${hasError && !s.enabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Power className="size-3" /> {s.enabled ? "Active" : "Paused"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Report">
          <select
            value={s.reportType}
            disabled={readOnly}
            onChange={(e) => {
              const rt = e.target.value as ReportType;
              onChange({ reportType: rt, format: REPORT_DEFAULT_FORMAT[rt] });
            }}
            className="w-full h-9 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none"
          >
            {Object.entries(REPORT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>

        <Field label="Format">
          <div className="inline-flex items-center h-9 p-1 rounded-md bg-secondary/60 border border-border w-full">
            {(["pdf", "excel", "both"] as Format[]).map((f) => {
              const active = s.format === f;
              const Icon = f === "excel" ? FileSpreadsheet : FileText;
              return (
                <button key={f} disabled={readOnly} onClick={() => onChange({ format: f })}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded text-[11px] font-semibold capitalize ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="size-3" /> {f === "both" ? "PDF + XLSX" : f.toUpperCase()}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Frequency">
          <div className="inline-flex items-center h-9 p-1 rounded-md bg-secondary/60 border border-border w-full">
            {(["daily", "weekly", "monthly"] as Frequency[]).map((f) => {
              const active = s.frequency === f;
              return (
                <button key={f} disabled={readOnly}
                  onClick={() => onChange({ frequency: f, weekday: f === "weekly" ? (s.weekday ?? 1) : undefined, dayOfMonth: f === "monthly" ? (s.dayOfMonth ?? 1) : undefined })}
                  className={`flex-1 inline-flex items-center justify-center h-7 rounded text-[11px] font-semibold capitalize ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {f}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Time of day">
          <div className="inline-flex items-center gap-2 h-9 px-2.5 rounded-md bg-secondary/60 border border-border">
            <Clock className="size-3.5 text-muted-foreground" />
            <input type="time" value={s.time} disabled={readOnly}
              onChange={(e) => onChange({ time: e.target.value })}
              className="bg-transparent text-xs font-medium outline-none w-full" />
          </div>
        </Field>

        {s.frequency === "weekly" && (
          <Field label="Day of week" full>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d, i) => {
                const active = s.weekday === i;
                return (
                  <button key={d} disabled={readOnly} onClick={() => onChange({ weekday: i })}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-semibold border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 text-muted-foreground border-border"}`}>
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {s.frequency === "monthly" && (
          <Field label="Day of month" full>
            <input type="number" min={1} max={28} value={s.dayOfMonth ?? 1} disabled={readOnly}
              onChange={(e) => onChange({ dayOfMonth: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })}
              className="h-9 px-2.5 rounded-md bg-secondary/60 border border-border text-xs w-24 outline-none tabular-nums" />
            <div className="text-[11px] text-muted-foreground mt-1">Capped at 28 to safely run every month.</div>
          </Field>
        )}
      </div>

      <Field label={`Recipients (${recipientChips.length})`} full>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {recipientChips.length === 0 && <span className="text-[11px] text-muted-foreground">No recipients</span>}
          {recipientChips.map((r) => (
            <button key={r.id} disabled={readOnly}
              onClick={() => onChange({ recipientIds: s.recipientIds.filter((x) => x !== r.id) })}
              className="inline-flex items-center gap-1 h-6 pl-2 pr-1.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold border border-primary/20">
              <Mail className="size-3" /> {r.name}
              {!readOnly && <span className="opacity-60 hover:opacity-100 ml-0.5">×</span>}
            </button>
          ))}
        </div>
        {!readOnly && (
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v && !s.recipientIds.includes(v)) onChange({ recipientIds: [...s.recipientIds, v] });
            }}
            className="h-8 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none">
            <option value="">+ Add recipient…</option>
            {adminRecipients
              .filter((u) => !s.recipientIds.includes(u.id))
              .map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
          </select>
        )}
      </Field>

      {issues.length > 0 && (
        <div className="space-y-1.5">
          {issues.map((iss, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed ${
                iss.level === "error"
                  ? "border-rose-500/40 bg-rose-500/5 text-rose-700 dark:text-rose-300"
                  : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300"
              }`}
            >
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>{iss.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
          {s.lastRunStatus === "success" && <CheckCircle2 className="size-3.5 text-emerald-500" />}
          {s.lastRunStatus === "failed" && <AlertTriangle className="size-3.5 text-amber-500" />}
          {s.lastRunAt
            ? <>Last run {new Date(s.lastRunAt).toLocaleString()} · <span className="capitalize">{s.lastRunStatus}</span></>
            : <>Never run yet</>}
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button onClick={onRemove} className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5">
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
          <button
            onClick={onSendNow}
            disabled={hasError}
            title={hasError ? "Resolve validation errors before sending" : undefined}
            className={`h-8 px-3 rounded-md gradient-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 ${
              hasError ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <Send className="size-3.5" /> Send now
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-1.5">{label}</div>
      {children}
    </div>
  );
}

/* ---------- Cadence helpers ---------- */

function humanCadence(s: Schedule) {
  if (s.frequency === "daily") return `Daily at ${s.time}`;
  if (s.frequency === "weekly") return `Weekly on ${WEEKDAYS[s.weekday ?? 1]} at ${s.time}`;
  return `Monthly on day ${s.dayOfMonth ?? 1} at ${s.time}`;
}

function nextRunDate(s: Schedule): Date | null {
  if (!s.enabled) return null;
  const [h, m] = s.time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const now = new Date();
  const cand = new Date(now);
  cand.setSeconds(0, 0);
  cand.setHours(h, m, 0, 0);

  if (s.frequency === "daily") {
    if (cand <= now) cand.setDate(cand.getDate() + 1);
    return cand;
  }
  if (s.frequency === "weekly") {
    const target = s.weekday ?? 1;
    const delta = (target - cand.getDay() + 7) % 7;
    cand.setDate(cand.getDate() + delta);
    if (cand <= now) cand.setDate(cand.getDate() + 7);
    return cand;
  }
  // monthly
  const day = Math.min(28, s.dayOfMonth ?? 1);
  cand.setDate(day);
  if (cand <= now) cand.setMonth(cand.getMonth() + 1);
  return cand;
}

/* ---------- Report generators (same code path as the future cron worker) ---------- */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function generateReportFiles(s: Schedule): { blob: Blob; filename: string }[] {
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${s.reportType}_${stamp}`;
  const files: { blob: Blob; filename: string }[] = [];
  const wantPdf = s.format === "pdf" || s.format === "both";
  const wantXlsx = s.format === "excel" || s.format === "both";
  const data = buildReportData(s.reportType);

  if (wantPdf) files.push({ filename: `${base}.pdf`, blob: buildPdf(s, data) });
  if (wantXlsx) files.push({ filename: `${base}.xlsx`, blob: buildXlsx(s, data) });
  return files;
}

type ReportData = {
  title: string;
  subtitle: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
};

function buildReportData(t: ReportType): ReportData {
  if (t === "daily_summary") {
    const rows = camps.map((c) => {
      const est = Math.round(c.employees * 2.9);
      const served = Math.round(est * (0.85 + Math.random() * 0.12));
      return [c.code, c.name, c.employees, est, served, served - est, `${Math.round((served / est) * 100)}%`];
    });
    return {
      title: "Daily distribution summary",
      subtitle: new Date().toLocaleDateString(),
      columns: ["Camp", "Name", "Employees", "Estimated", "Served", "Variance", "Completion"],
      rows,
    };
  }
  if (t === "weekly_camp") {
    const rows: (string | number)[][] = [];
    camps.forEach((c) => {
      let total = 0, est = 0;
      for (let d = 6; d >= 0; d--) {
        const e = Math.round(c.employees * 2.9);
        const s = Math.round(e * (0.84 + Math.random() * 0.14));
        total += s; est += e;
      }
      rows.push([c.code, c.name, c.employees, est, total, total - est, `${Math.round((total / est) * 100)}%`]);
    });
    return {
      title: "Weekly camp performance",
      subtitle: "Last 7 days",
      columns: ["Camp", "Name", "Employees", "Estimated", "Served", "Variance", "Completion"],
      rows,
    };
  }
  if (t === "monthly_consumption") {
    const rows = camps.map((c) => {
      const e = c.employees * 2.9 * 30;
      const served = Math.round(e * 0.91);
      const wastage = Math.round(e * 0.06);
      return [c.code, c.name, Math.round(e), served, wastage, `${Math.round((served / e) * 100)}%`];
    });
    return {
      title: "Monthly consumption + wastage",
      subtitle: new Date().toLocaleString(undefined, { month: "long", year: "numeric" }),
      columns: ["Camp", "Name", "Estimated meals", "Served", "Wastage", "Compliance"],
      rows,
    };
  }
  // audit_log
  const sample = employees.slice(0, 60);
  const rows = sample.map((e, i) => {
    const meal = ["Breakfast", "Lunch", "Dinner"][i % 3];
    const ok = i % 7 !== 0;
    return [
      `${(7 + i % 14).toString().padStart(2, "0")}:${(i * 3 % 60).toString().padStart(2, "0")}`,
      e.name, e.labourId, e.camp, meal,
      ok ? "Eligible" : "Wrong Camp",
      ok ? "Scan accepted" : "Scanned at non-assigned camp",
    ];
  });
  return {
    title: "Employee audit log",
    subtitle: "Period: last 24 h",
    columns: ["Time", "Employee", "Labour ID", "Camp", "Meal", "Status", "Reason"],
    rows,
  };
}

function buildPdf(s: Schedule, d: ReportData): Blob {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(`MyMeals — ${d.title}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${d.subtitle}    Schedule: ${s.name}`, 14, 22);
  autoTable(doc, {
    head: [d.columns],
    body: d.rows,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
  });
  return doc.output("blob");
}

function buildXlsx(s: Schedule, d: ReportData): Blob {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [d.title],
    [d.subtitle],
    [`Schedule: ${s.name}`],
    [],
    d.columns,
    ...d.rows,
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
