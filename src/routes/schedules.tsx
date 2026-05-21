import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import {
  useAppUsers,
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useRunSchedule,
  useFtpConfig,
  useSaveFtpConfig,
  useDeleteFtpConfig,
  useMailConfig,
  useSaveMailConfig,
  useDeleteMailConfig,
  type Schedule,
  type ScheduleInput,
  type ScheduleFormat,
  type ScheduleFrequency,
  type ScheduleDestination,
  type ScheduleReportType,
  type FtpConfigView,
  type FtpConfigInput,
  type MailConfigView,
  type MailConfigInput,
} from "@/lib/hooks";
import {
  CalendarClock,
  Mail,
  Plus,
  Trash2,
  Send,
  Power,
  FileText,
  FileSpreadsheet,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Server,
  X,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/schedules")({
  component: SchedulesPage,
  head: () => ({ meta: [{ title: "Scheduled Reports — MyMeals" }] }),
});

const REPORT_LABEL: Record<ScheduleReportType, string> = {
  consumption: "Daily Meal Consumption",
  employee: "Employee Master",
  scans: "Scan Activity Log",
  camp: "Camp Performance",
  wastage: "Wastage & Variance",
};

const REPORT_DEFAULT_FORMAT: Record<ScheduleReportType, ScheduleFormat> = {
  consumption: "pdf",
  employee: "excel",
  scans: "excel",
  camp: "both",
  wastage: "pdf",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MEAL_WINDOWS: { name: string; start: string; end: string }[] = [
  { name: "Breakfast", start: "06:00", end: "09:30" },
  { name: "Lunch", start: "12:00", end: "14:30" },
  { name: "Dinner", start: "18:00", end: "21:00" },
];

function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

type Issue = { level: "error" | "warning"; message: string };

function validateSchedule(s: Schedule, all: Schedule[]): Issue[] {
  const issues: Issue[] = [];

  if (s.frequency === "weekly" && (s.weekday === undefined || s.weekday === null)) {
    issues.push({ level: "error", message: "Pick a day of the week for this weekly schedule." });
  }
  if (s.frequency === "monthly" && (s.dayOfMonth === undefined || s.dayOfMonth === null)) {
    issues.push({ level: "error", message: "Pick a day of the month for this monthly schedule." });
  }

  if (s.frequency === "daily" && s.time) {
    const conflict = all.find((o) => o.id !== s.id && o.frequency === "daily" && o.time === s.time);
    if (conflict) {
      issues.push({
        level: "error",
        message: `Overlaps with “${conflict.name}” which already runs daily at ${s.time}. Pick a different time.`,
      });
    }
  }

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

function SchedulesPage() {
  const session = useSession();
  const canView = session.can("automation", "view");
  const canEdit = session.can("automation", "edit");
  const canDelete = session.can("automation", "delete");
  const { data: users = [] } = useAppUsers();
  const adminRecipients = useMemo(
    () =>
      users.filter((u) => (u.role === "admin" || u.role === "operator") && u.status === "Active"),
    [users],
  );

  const { data: schedules = [], isLoading } = useSchedules();
  const { data: ftpConfig = null } = useFtpConfig();
  const { data: mailConfig = null } = useMailConfig();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const runSchedule = useRunSchedule();
  const saveFtpConfig = useSaveFtpConfig();
  const deleteFtpConfig = useDeleteFtpConfig();
  const saveMailConfig = useSaveMailConfig();
  const deleteMailConfig = useDeleteMailConfig();

  const [ftpOpen, setFtpOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  if (!canView) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <ShieldCheck className="size-10 mx-auto text-muted-foreground" />
        <h2 className="mt-4 font-display text-lg font-semibold">Restricted</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role does not have access to automation.
        </p>
      </div>
    );
  }

  function add() {
    const body: ScheduleInput = {
      name: "New scheduled report",
      enabled: false,
      reportType: "consumption",
      format: "pdf",
      frequency: "daily",
      time: "08:00",
      weekday: null,
      dayOfMonth: null,
      destination: "email",
      recipientIds: [],
      recipientEmails: adminRecipients.map((u) => u.email).filter(Boolean),
    };
    createSchedule.mutate(body, {
      onError: (e) =>
        setToast({ ok: false, msg: e instanceof Error ? e.message : "Create failed" }),
    });
  }

  function patch(id: string, body: Partial<ScheduleInput>) {
    updateSchedule.mutate(
      { id, ...body },
      {
        onError: (e) =>
          setToast({ ok: false, msg: e instanceof Error ? e.message : "Update failed" }),
      },
    );
  }

  function remove(id: string) {
    deleteSchedule.mutate(id, {
      onError: (e) =>
        setToast({ ok: false, msg: e instanceof Error ? e.message : "Delete failed" }),
    });
  }

  function sendNow(s: Schedule) {
    runSchedule.mutate(s.id, {
      onSuccess: (r) => setToast({ ok: r.ok, msg: r.detail }),
      onError: (e) => setToast({ ok: false, msg: e instanceof Error ? e.message : "Run failed" }),
    });
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
            Scheduled reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure automated daily, weekly and monthly PDF/Excel reports delivered to admin
            recipients or your FTP server.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMailOpen(true)}
            className="h-9 px-4 rounded-lg bg-secondary hover:bg-secondary/80 text-xs font-semibold inline-flex items-center gap-2"
          >
            <Mail className="size-3.5" /> Mail settings
            {mailConfig && <span className="ml-0.5 size-1.5 rounded-full bg-emerald-500" />}
          </button>
          <button
            onClick={() => setFtpOpen(true)}
            className="h-9 px-4 rounded-lg bg-secondary hover:bg-secondary/80 text-xs font-semibold inline-flex items-center gap-2"
          >
            <Server className="size-3.5" /> FTP settings
            {ftpConfig && <span className="ml-0.5 size-1.5 rounded-full bg-emerald-500" />}
          </button>
          {canEdit && (
            <button
              onClick={add}
              disabled={createSchedule.isPending}
              className="h-9 px-4 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold shadow-elegant inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Plus className="size-3.5" /> New schedule
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 flex items-start gap-3">
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
        <div className="text-xs leading-relaxed">
          <div className="font-semibold text-emerald-700 dark:text-emerald-400">
            Background scheduler is active
          </div>
          <div className="text-muted-foreground mt-1">
            The MyMeal server checks for due schedules every minute and delivers reports
            automatically — both FTP upload and SMTP email are live. Email runs require Mail
            settings to be configured; FTP runs require FTP settings.
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Loading schedules…
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {schedules.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              adminRecipients={adminRecipients}
              ftpConfig={ftpConfig}
              mailConfig={mailConfig}
              issues={validateSchedule(s, schedules)}
              onChange={(p) => patch(s.id, p)}
              onRemove={() => remove(s.id)}
              onSendNow={() => sendNow(s)}
              onOpenFtpSettings={() => setFtpOpen(true)}
              onOpenMailSettings={() => setMailOpen(true)}
              readOnly={!canEdit}
              canDelete={canDelete}
              running={runSchedule.isPending && runSchedule.variables === s.id}
            />
          ))}
          {schedules.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground col-span-full">
              No schedules yet. Click “New schedule”.
            </div>
          )}
        </div>
      )}

      {ftpOpen && (
        <FtpDialog
          initial={ftpConfig}
          onClose={() => setFtpOpen(false)}
          onSave={async (body) => {
            try {
              await saveFtpConfig.mutateAsync(body);
              setToast({ ok: true, msg: "FTP settings saved." });
              setFtpOpen(false);
            } catch (e) {
              setToast({ ok: false, msg: e instanceof Error ? e.message : "Save failed" });
            }
          }}
          onDelete={async () => {
            try {
              await deleteFtpConfig.mutateAsync();
              setToast({ ok: true, msg: "FTP settings cleared." });
              setFtpOpen(false);
            } catch (e) {
              setToast({ ok: false, msg: e instanceof Error ? e.message : "Delete failed" });
            }
          }}
        />
      )}

      {mailOpen && (
        <MailDialog
          initial={mailConfig}
          onClose={() => setMailOpen(false)}
          onSave={async (body) => {
            try {
              await saveMailConfig.mutateAsync(body);
              setToast({ ok: true, msg: "Mail settings saved." });
              setMailOpen(false);
            } catch (e) {
              setToast({ ok: false, msg: e instanceof Error ? e.message : "Save failed" });
            }
          }}
          onDelete={async () => {
            try {
              await deleteMailConfig.mutateAsync();
              setToast({ ok: true, msg: "Mail settings cleared." });
              setMailOpen(false);
            } catch (e) {
              setToast({ ok: false, msg: e instanceof Error ? e.message : "Delete failed" });
            }
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-xl border p-4 shadow-elegant flex items-start gap-3 ${
            toast.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
          }`}
        >
          {toast.ok ? (
            <CheckCircle2 className="size-5 mt-0.5" />
          ) : (
            <AlertCircle className="size-5 mt-0.5" />
          )}
          <div className="text-sm">{toast.msg}</div>
          <button onClick={() => setToast(null)} className="ml-auto">
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function ScheduleCard({
  schedule: s,
  adminRecipients,
  ftpConfig,
  mailConfig,
  issues,
  onChange,
  onRemove,
  onSendNow,
  onOpenFtpSettings,
  onOpenMailSettings,
  readOnly,
  canDelete,
  running,
}: {
  schedule: Schedule;
  adminRecipients: { id: string; name: string; email: string; role: string }[];
  ftpConfig: FtpConfigView;
  mailConfig: MailConfigView;
  issues: Issue[];
  onChange: (patch: Partial<ScheduleInput>) => void;
  onRemove: () => void;
  onSendNow: () => void;
  onOpenFtpSettings: () => void;
  onOpenMailSettings: () => void;
  readOnly: boolean;
  canDelete: boolean;
  running: boolean;
}) {
  const next = s.nextRunAt ? new Date(s.nextRunAt) : null;
  const ftpMissing = s.destination === "ftp" && !ftpConfig;
  const emails = s.recipientEmails ?? [];
  const emailMissingRecipients = s.destination === "email" && emails.length === 0;
  const mailMissing = s.destination === "email" && !mailConfig;
  const hasError = issues.some((i) => i.level === "error") || ftpMissing || emailMissingRecipients;

  return (
    <div
      className={`rounded-xl border bg-card p-5 space-y-4 ${
        hasError
          ? "border-rose-500/50"
          : s.enabled
            ? "border-border"
            : "border-border/60 opacity-90"
      }`}
    >
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
              const rt = e.target.value as ScheduleReportType;
              onChange({ reportType: rt, format: REPORT_DEFAULT_FORMAT[rt] });
            }}
            className="w-full h-9 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none"
          >
            {Object.entries(REPORT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Format">
          <div className="inline-flex items-center h-9 p-1 rounded-md bg-secondary/60 border border-border w-full">
            {(["pdf", "excel", "both"] as ScheduleFormat[]).map((f) => {
              const active = s.format === f;
              const Icon = f === "excel" ? FileSpreadsheet : FileText;
              return (
                <button
                  key={f}
                  disabled={readOnly}
                  onClick={() => onChange({ format: f })}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded text-[11px] font-semibold capitalize ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="size-3" /> {f === "both" ? "PDF + XLSX" : f.toUpperCase()}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Frequency">
          <div className="inline-flex items-center h-9 p-1 rounded-md bg-secondary/60 border border-border w-full">
            {(["daily", "weekly", "monthly"] as ScheduleFrequency[]).map((f) => {
              const active = s.frequency === f;
              return (
                <button
                  key={f}
                  disabled={readOnly}
                  onClick={() =>
                    onChange({
                      frequency: f,
                      weekday: f === "weekly" ? (s.weekday ?? 1) : null,
                      dayOfMonth: f === "monthly" ? (s.dayOfMonth ?? 1) : null,
                    })
                  }
                  className={`flex-1 inline-flex items-center justify-center h-7 rounded text-[11px] font-semibold capitalize ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Time of day">
          <div className="inline-flex items-center gap-2 h-9 px-2.5 rounded-md bg-secondary/60 border border-border">
            <Clock className="size-3.5 text-muted-foreground" />
            <input
              type="time"
              value={s.time}
              disabled={readOnly}
              onChange={(e) => onChange({ time: e.target.value })}
              className="bg-transparent text-xs font-medium outline-none w-full"
            />
          </div>
        </Field>

        {s.frequency === "weekly" && (
          <Field label="Day of week" full>
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d, i) => {
                const active = s.weekday === i;
                return (
                  <button
                    key={d}
                    disabled={readOnly}
                    onClick={() => onChange({ weekday: i })}
                    className={`h-7 px-2.5 rounded-md text-[11px] font-semibold border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/60 text-muted-foreground border-border"}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {s.frequency === "monthly" && (
          <Field label="Day of month" full>
            <input
              type="number"
              min={1}
              max={28}
              value={s.dayOfMonth ?? 1}
              disabled={readOnly}
              onChange={(e) =>
                onChange({ dayOfMonth: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })
              }
              className="h-9 px-2.5 rounded-md bg-secondary/60 border border-border text-xs w-24 outline-none tabular-nums"
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Capped at 28 to safely run every month.
            </div>
          </Field>
        )}
      </div>

      <Field label="Delivery" full>
        <div className="inline-flex items-center h-9 p-1 rounded-md bg-secondary/60 border border-border">
          {(["email", "ftp"] as ScheduleDestination[]).map((d) => {
            const active = s.destination === d;
            const Icon = d === "email" ? Mail : Server;
            return (
              <button
                key={d}
                disabled={readOnly}
                onClick={() => onChange({ destination: d })}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-[11px] font-semibold capitalize ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3" /> {d === "ftp" ? "FTP" : "Email"}
              </button>
            );
          })}
        </div>
      </Field>

      {s.destination === "email" ? (
        <Field label={`Recipients (${emails.length})`} full>
          {mailMissing && (
            <div className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              No SMTP server configured.{" "}
              <button onClick={onOpenMailSettings} className="font-semibold underline">
                Configure mail settings
              </button>{" "}
              before this can send.
            </div>
          )}
          <EmailRecipients
            emails={emails}
            suggestions={adminRecipients.map((u) => u.email).filter(Boolean)}
            readOnly={readOnly}
            onChange={(next) => onChange({ recipientEmails: next })}
          />
        </Field>
      ) : (
        <Field label="FTP destination" full>
          {ftpConfig ? (
            <div className="rounded-md border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed">
              <div className="flex items-center gap-1.5 font-mono text-foreground">
                <Server className="size-3.5 text-muted-foreground" />
                ftp://{ftpConfig.user}@{ftpConfig.host}:{ftpConfig.port}
                {ftpConfig.remotePath}
              </div>
              <button
                disabled={readOnly}
                onClick={onOpenFtpSettings}
                className="mt-2 text-primary hover:underline text-[11px] font-semibold"
              >
                Change FTP settings…
              </button>
            </div>
          ) : (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/5 p-3 text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
              No FTP server configured yet.{" "}
              <button onClick={onOpenFtpSettings} className="font-semibold underline">
                Configure FTP settings
              </button>{" "}
              to enable delivery.
            </div>
          )}
        </Field>
      )}

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
          {s.lastRunAt ? (
            <>
              Last run {new Date(s.lastRunAt).toLocaleString()}
              {/* ·{" "}
              <span className="capitalize">{s.lastRunStatus}</span>
              {s.lastRunDetail ? ` · ${s.lastRunDetail}` : ""} */}
            </>
          ) : (
            <>Never run yet</>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              onClick={onRemove}
              className="h-8 px-2.5 rounded-md text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          )}
          <button
            onClick={onSendNow}
            disabled={hasError || running}
            title={hasError ? "Resolve validation errors before sending" : undefined}
            className={`h-8 px-3 rounded-md gradient-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 ${
              hasError || running ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            {running ? "Running…" : "Send now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function humanCadence(s: Schedule) {
  if (s.frequency === "daily") return `Daily at ${s.time}`;
  if (s.frequency === "weekly") return `Weekly on ${WEEKDAYS[s.weekday ?? 1]} at ${s.time}`;
  return `Monthly on day ${s.dayOfMonth ?? 1} at ${s.time}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Editable email-chip list: pick from a datalist of app-user emails or type any
// address. Enter / comma / blur commits the typed value.
function EmailRecipients({
  emails,
  suggestions,
  readOnly,
  onChange,
}: {
  emails: string[];
  suggestions: string[];
  readOnly: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useMemo(() => `emails_${Math.random().toString(36).slice(2)}`, []);

  function commit(raw: string) {
    const v = raw.trim().replace(/,$/, "").trim();
    if (!v) return;
    if (!EMAIL_RE.test(v)) return; // ignore invalid; input border could flag it
    if (emails.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...emails, v]);
    setDraft("");
  }

  const remaining = suggestions.filter((e) => !emails.includes(e));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {emails.length === 0 && (
          <span className="text-[11px] text-muted-foreground">No recipients</span>
        )}
        {emails.map((e) => (
          <span
            key={e}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md bg-primary/10 text-primary text-[11px] font-semibold border border-primary/20"
          >
            <Mail className="size-3" /> {e}
            {!readOnly && (
              <button
                onClick={() => onChange(emails.filter((x) => x !== e))}
                className="opacity-60 hover:opacity-100 ml-0.5 px-0.5"
                title="Remove"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <input
            list={listId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commit(draft);
              }
            }}
            onBlur={() => commit(draft)}
            placeholder="name@example.com — type or pick, then Enter"
            className={`h-8 px-2 rounded-md bg-secondary/60 border text-xs outline-none flex-1 ${
              draft && !EMAIL_RE.test(draft.trim()) ? "border-rose-500/50" : "border-border"
            }`}
          />
          <datalist id={listId}>
            {remaining.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => commit(draft)}
            disabled={!draft || !EMAIL_RE.test(draft.trim())}
            className="h-8 px-3 rounded-md bg-secondary border border-border text-xs font-semibold disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function FtpDialog({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: FtpConfigView;
  onClose: () => void;
  onSave: (c: FtpConfigInput) => void;
  onDelete: () => void;
}) {
  const [host, setHost] = useState(initial?.host ?? "gator4052.hostgator.com");
  const [port, setPort] = useState(String(initial?.port ?? 21));
  const [user, setUser] = useState(initial?.user ?? "francis@akilgroup.com");
  // Password is not returned from the server; only re-send when the user types one.
  const [pass, setPass] = useState("");
  const [path, setPath] = useState(initial?.remotePath ?? "/mealtrack-pro/");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      host: host.trim(),
      port: Number(port) || 21,
      user: user.trim(),
      password: pass,
      remotePath: path.trim() || "/",
    });
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <Server className="size-4" />
            </div>
            <div>
              <div className="font-semibold">FTP server settings</div>
              <div className="text-xs text-muted-foreground">
                Used by schedules with FTP delivery
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <FtpField label="FTP Host *">
            <input
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={inputCls}
            />
          </FtpField>
          <FtpField label="Port">
            <input value={port} onChange={(e) => setPort(e.target.value)} className={inputCls} />
          </FtpField>
          <FtpField label="Username *">
            <input
              required
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className={inputCls}
            />
          </FtpField>
          <FtpField label={initial?.hasPassword ? "Password (leave blank to keep)" : "Password *"}>
            <input
              required={!initial?.hasPassword}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className={inputCls}
              placeholder={initial?.hasPassword ? "••••••••" : ""}
            />
          </FtpField>
          <FtpField label="Remote Path">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className={`${inputCls} font-mono`}
            />
          </FtpField>

          <div className="md:col-span-2 rounded-lg bg-secondary/60 border border-border p-3 text-xs text-muted-foreground">
            Credentials are stored on the MyMeal server and used by the background scheduler. Any
            FTP-delivery schedule will use these settings on its next run.
          </div>

          <div className="md:col-span-2 flex items-center justify-between gap-2 pt-1">
            <div>
              {initial && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="size-3.5" /> Clear settings
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow"
              >
                <CheckCircle2 className="size-4" /> Save settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function FtpField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function MailDialog({
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  initial: MailConfigView;
  onClose: () => void;
  onSave: (c: MailConfigInput) => void;
  onDelete: () => void;
}) {
  const [host, setHost] = useState(initial?.host ?? "smtp.gmail.com");
  const [port, setPort] = useState(String(initial?.port ?? 465));
  const [username, setUsername] = useState(initial?.username ?? "");
  // Password is never returned from the server; only re-send when typed.
  const [pass, setPass] = useState("");
  const [secure, setSecure] = useState(initial?.secure ?? true);
  const [fromName, setFromName] = useState(initial?.fromName ?? "MyMeal");
  const [fromEmail, setFromEmail] = useState(initial?.fromEmail ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      host: host.trim(),
      port: Number(port) || 587,
      username: username.trim(),
      password: pass,
      secure,
      fromName: fromName.trim() || "MyMeal",
      fromEmail: fromEmail.trim(),
    });
  }

  const inputCls =
    "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <Mail className="size-4" />
            </div>
            <div>
              <div className="font-semibold">SMTP / mail settings</div>
              <div className="text-xs text-muted-foreground">
                Used by schedules with email delivery
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <FtpField label="SMTP Host *">
            <input
              required
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className={inputCls}
            />
          </FtpField>
          <FtpField label="Port">
            <input
              value={port}
              onChange={(e) => {
                const v = e.target.value;
                setPort(v);
                // Smart default: 465 = implicit TLS, 587 = STARTTLS.
                if (v === "465") setSecure(true);
                else if (v === "587") setSecure(false);
              }}
              className={inputCls}
            />
          </FtpField>
          <FtpField label="Username *">
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
            />
          </FtpField>
          <FtpField
            label={
              initial?.hasPassword
                ? "Password / app password (leave blank to keep)"
                : "Password / app password *"
            }
          >
            <input
              required={!initial?.hasPassword}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className={inputCls}
              placeholder={initial?.hasPassword ? "••••••••" : ""}
            />
          </FtpField>
          <FtpField label="From name">
            <input
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              className={inputCls}
            />
          </FtpField>
          <FtpField label="From email *">
            <input
              required
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              className={inputCls}
              placeholder="reports@yourdomain.com"
            />
          </FtpField>

          <label className="md:col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={secure}
              onChange={(e) => setSecure(e.target.checked)}
              className="size-4 rounded border-border"
            />
            Use implicit TLS (SSL) — on for port 465, off for STARTTLS port 587.
          </label>

          <div className="md:col-span-2 rounded-lg bg-secondary/60 border border-border p-3 text-xs text-muted-foreground">
            Gmail: enable 2-step verification and use a 16-character App Password as the password
            (your normal account password will not work). Credentials are stored on the MyMeal
            server and used by the background scheduler.
          </div>

          <div className="md:col-span-2 flex items-center justify-between gap-2 pt-1">
            <div>
              {initial && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="size-3.5" /> Clear settings
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow"
              >
                <CheckCircle2 className="size-4" /> Save settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
