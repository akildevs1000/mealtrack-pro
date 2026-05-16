import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { camps, employees } from "@/lib/mock-data";
import { useCampScope } from "@/lib/session";
import { ArrowLeft, CalendarDays, Building2, Search, Download, ScanLine, ShieldAlert, CheckCircle2, AlertTriangle, Filter } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/audit")({
  component: AuditPage,
  head: () => ({
    meta: [
      { title: "Audit Log — MyMeals" },
      { name: "description", content: "Per-employee scan audit log with timestamps, camp/session and exact mismatch reason." },
    ],
  }),
});

type Status = "Eligible" | "Already Served" | "Wrong Camp" | "Not Eligible" | "Late Arrival" | "Expired ID" | "Manual Override";
type Meal = "Breakfast" | "Lunch" | "Dinner";

const STATUS_TONE: Record<Status, string> = {
  "Eligible": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  "Already Served": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  "Wrong Camp": "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  "Not Eligible": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  "Late Arrival": "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  "Expired ID": "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
  "Manual Override": "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
};

const REASONS: Record<Status, string[]> = {
  "Eligible": ["Scan accepted within service window", "Verified at counter — first scan", "Plan match — meal credited"],
  "Already Served": ["Duplicate scan within 5 min of prior accept", "Same labour ID scanned twice this session", "Re-scan after queue exit"],
  "Wrong Camp": ["Scanned at non-assigned camp device", "Visiting another site without transfer", "Camp code mismatch on QR"],
  "Not Eligible": ["Meal not in employee plan", "Status: Vacation — paused plan", "Status: Leave — no entitlement"],
  "Late Arrival": ["Scanned after window close — grace allowed", "Late by >15 min — supervisor flag", "Counter closing buffer"],
  "Expired ID": ["Labour card expired — block & escalate", "ID renewal pending — issue temp pass"],
  "Manual Override": ["Supervisor override — reason logged", "Offline queue replay accepted", "Device admin force-accept"],
};

const DEVICE_BY_CAMP: Record<string, string> = camps.reduce((acc, c, i) => {
  acc[c.code] = `Scanner-${c.code}-${String.fromCharCode(65 + (i % 2))}`;
  return acc;
}, {} as Record<string, string>);

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const todayIso = new Date().toISOString().slice(0, 10);

function AuditPage() {
  const scope = useCampScope();
  const visibleCamps = useMemo(() => (scope ? camps.filter((c) => scope.includes(c.code)) : camps), [scope]);
  const [date, setDate] = useState(todayIso);
  const [campFilter, setCampFilter] = useState<string>(scope ? scope[0] : "all");
  const [mealFilter, setMealFilter] = useState<"all" | Meal>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | Status | "mismatch">("all");
  const [query, setQuery] = useState("");

  // Build deterministic event log: each employee may have multiple meal scans for the date
  const events = useMemo(() => {
    const seed = hashStr(date);
    const allowedCamps = new Set(visibleCamps.map((c) => c.code));
    const meals: { meal: Meal; baseHour: number }[] = [
      { meal: "Breakfast", baseHour: 6 },
      { meal: "Lunch", baseHour: 12 },
      { meal: "Dinner", baseHour: 19 },
    ];

    type Event = {
      id: string; timestamp: string; epoch: number;
      employeeId: string; name: string; labourId: string; designation: string;
      camp: string; device: string; meal: Meal; status: Status; reason: string;
      override?: string;
    };
    const out: Event[] = [];

    for (const e of employees) {
      if (!allowedCamps.has(e.camp)) continue;
      for (const { meal, baseHour } of meals) {
        const eligibleFlag = meal === "Breakfast" ? e.breakfast : meal === "Dinner" ? e.dinner : e.lunch;
        const k0 = hashStr(`${seed}|${e.id}|${meal}`);
        const planned = eligibleFlag && e.status === "Active";
        // base attempts: 1 (planned), maybe 0 (skipped), or 2 (duplicate)
        const attempts = !planned
          ? (k0 % 5 === 0 ? 1 : 0) // occasional bad scans even if not planned
          : (k0 % 11 === 0 ? 0 : k0 % 13 === 0 ? 2 : 1);

        for (let a = 0; a < attempts; a++) {
          const k = hashStr(`${seed}|${e.id}|${meal}|${a}`);
          const minute = (baseHour * 60) + (k % 150) + a * 7;
          const hh = String(Math.floor(minute / 60) % 24).padStart(2, "0");
          const mm = String(minute % 60).padStart(2, "0");
          const ss = String(k % 60).padStart(2, "0");
          const timestamp = `${hh}:${mm}:${ss}`;

          let status: Status;
          if (e.status === "Vacation" || e.status === "Leave" || e.status === "Inactive") {
            status = (k % 17 === 0) ? "Expired ID" : "Not Eligible";
          } else if (!eligibleFlag) {
            status = "Not Eligible";
          } else if (a === 1) {
            status = "Already Served";
          } else {
            const r = k % 100;
            if (r < 78) status = "Eligible";
            else if (r < 86) status = "Late Arrival";
            else if (r < 92) status = "Wrong Camp";
            else if (r < 96) status = "Already Served";
            else if (r < 98) status = "Expired ID";
            else status = "Manual Override";
          }

          const reasonList = REASONS[status];
          const reason = reasonList[k % reasonList.length];

          // Wrong camp -> shift to a different camp's device
          let camp = e.camp;
          if (status === "Wrong Camp") {
            const others = camps.map((c) => c.code).filter((c) => c !== e.camp);
            camp = others[k % others.length];
          }

          out.push({
            id: `${e.id}-${meal}-${a}`,
            timestamp, epoch: minute,
            employeeId: e.id, name: e.name, labourId: e.labourId, designation: e.designation,
            camp, device: DEVICE_BY_CAMP[camp] ?? `Scanner-${camp}`, meal, status, reason,
            override: status === "Manual Override" ? "Supervisor: Khalid Al Suwaidi" : undefined,
          });
        }
      }
    }
    return out.sort((a, b) => b.epoch - a.epoch);
  }, [date, visibleCamps]);

  const filtered = useMemo(() => events.filter((e) => {
    if (campFilter !== "all" && e.camp !== campFilter) return false;
    if (mealFilter !== "all" && e.meal !== mealFilter) return false;
    if (statusFilter === "mismatch") {
      if (e.status === "Eligible") return false;
    } else if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (![e.name, e.labourId, e.camp, e.device, e.reason].some((s) => s.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [events, campFilter, mealFilter, statusFilter, query]);

  const counts = events.reduce((acc, e) => {
    acc.total++;
    if (e.status === "Eligible") acc.eligible++;
    else acc.mismatch++;
    return acc;
  }, { total: 0, eligible: 0, mismatch: 0 });

  function exportCsv() {
    const rows = [
      ["Time", "Employee", "Labour ID", "Designation", "Camp", "Device", "Meal", "Status", "Reason", "Override"],
      ...filtered.map((e) => [e.timestamp, e.name, e.labourId, e.designation, e.camp, e.device, e.meal, e.status, e.reason, e.override ?? ""]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `audit_log_${date}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("MyMeals — Employee Audit Log", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Date: ${date}    Events: ${filtered.length}    Mismatches: ${filtered.filter((e) => e.status !== "Eligible").length}`, 14, 22);
    autoTable(doc, {
      head: [["Time", "Employee", "Labour ID", "Camp", "Device", "Meal", "Status", "Reason"]],
      body: filtered.map((e) => [e.timestamp, e.name, e.labourId, e.camp, e.device, e.meal, e.status, e.reason]),
      startY: 28, styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    });
    doc.save(`audit_log_${date}.pdf`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-5 border-b border-border">
        <div>
          <Link to="/reports" className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-primary mb-1.5">
            <ArrowLeft className="size-3" /> Back to reports
          </Link>
          <h1 className="font-display text-[28px] leading-tight font-bold tracking-tight">Employee audit log</h1>
          <p className="text-sm text-muted-foreground mt-1">Every scan event with timestamp, camp/session, device, and the exact mismatch reason.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={exportCsv} className="h-9 px-3 rounded-lg bg-card border border-border text-xs font-semibold inline-flex items-center gap-2 hover:bg-secondary">
            <Download className="size-3.5" /> CSV
          </button>
          <button onClick={exportPdf} className="h-9 px-4 rounded-lg gradient-primary text-primary-foreground text-xs font-semibold shadow-elegant inline-flex items-center gap-2">
            <Download className="size-3.5" /> Export PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="Total scan events" value={counts.total} icon={ScanLine} tone="primary" />
        <KpiTile label="Accepted" value={counts.eligible} icon={CheckCircle2} tone="success" />
        <KpiTile label="Mismatches" value={counts.mismatch} icon={AlertTriangle} tone="warn" />
        <KpiTile label="Compliance" value={counts.total ? Math.round((counts.eligible / counts.total) * 100) + "%" : "—"} icon={ShieldAlert} tone="muted" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2 text-xs uppercase tracking-[0.12em] font-bold text-muted-foreground">
            <Filter className="size-3.5" /> Filters
          </div>
          <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-secondary/60 border border-border text-xs">
            <CalendarDays className="size-3.5 text-muted-foreground" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent text-xs font-medium outline-none cursor-pointer" />
          </div>
          <div className="inline-flex items-center h-8 pl-2.5 pr-1 rounded-md bg-secondary/60 border border-border">
            <Building2 className="size-3.5 text-muted-foreground mr-2" />
            <select value={campFilter} onChange={(e) => setCampFilter(e.target.value)} className="bg-transparent text-xs font-medium pr-2 py-1 outline-none cursor-pointer">
              {!scope && <option value="all">All camps</option>}
              {visibleCamps.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
          <select value={mealFilter} onChange={(e) => setMealFilter(e.target.value as any)} className="h-8 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none">
            <option value="all">All meals</option>
            <option value="Breakfast">Breakfast</option>
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="h-8 px-2 rounded-md bg-secondary/60 border border-border text-xs outline-none">
            <option value="all">All statuses</option>
            <option value="mismatch">Mismatches only</option>
            {(Object.keys(STATUS_TONE) as Status[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="inline-flex items-center gap-2 h-8 px-2.5 rounded-md bg-secondary/60 border border-border flex-1 min-w-[200px]">
            <Search className="size-3.5 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, labour ID, device, reason…" className="bg-transparent text-xs outline-none w-full" />
          </div>
          <div className="ml-auto text-xs text-muted-foreground tabular-nums">{filtered.length.toLocaleString()} events</div>
        </div>
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground sticky top-0 z-10">
              <tr>
                {["Time", "Employee", "Camp / Device", "Session", "Status", "Reason"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-2.5 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                    <div className="font-semibold text-foreground">{e.timestamp}</div>
                    <div className="text-[11px]">{date}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-[13px]">{e.name}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{e.labourId} · {e.designation}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] font-medium">{e.camp}</div>
                    <div className="text-[11px] text-muted-foreground">{e.device}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">{e.meal}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${STATUS_TONE[e.status]}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[360px]">
                    {e.reason}
                    {e.override && <div className="text-[11px] text-violet-600 dark:text-violet-400 mt-0.5">{e.override}</div>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No events match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof ScanLine; tone: "primary" | "success" | "warn" | "muted" }) {
  const colors = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    muted: "bg-secondary text-muted-foreground",
  }[tone];
  return (
    <div className="rounded-xl bg-card border border-border p-5 flex items-start justify-between gap-3">
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">{label}</div>
        <div className="mt-2.5 font-display text-[26px] leading-none font-bold tracking-tight tabular-nums">{value}</div>
      </div>
      <div className={`size-9 rounded-lg grid place-items-center ${colors}`}>
        <Icon className="size-4" />
      </div>
    </div>
  );
}
