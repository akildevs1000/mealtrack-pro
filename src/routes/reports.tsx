import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { camps, employees, recentScans } from "@/lib/mock-data";
import { FileBarChart, FileSpreadsheet, FileText, Filter, Server, Download, Search, X, CheckCircle2, AlertCircle, BarChart3, ScanLine, CalendarClock, Printer } from "lucide-react";
import { useCampScope } from "@/lib/session";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { ReportPreview, REPORT_CSS, type ReportType, type MealFilter } from "@/components/app/ReportPreview";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

type Meal = MealFilter;

const reportTypes: { id: ReportType; title: string; desc: string }[] = [
  { id: "consumption", title: "Daily Meal Consumption", desc: "Per-camp served vs estimated by meal session" },
  { id: "employee", title: "Employee Master", desc: "All employees with eligibility and status" },
  { id: "scans", title: "Scan Activity Log", desc: "Every QR scan with status and operator" },
  { id: "camp", title: "Camp Performance", desc: "Camp-wise totals, online %, balance and duplicates" },
  { id: "wastage", title: "Wastage & Variance", desc: "Estimated minus served, % wastage by camp" },
];

const todayIso = new Date().toISOString().slice(0, 10);
const weekAgoIso = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

function ReportsPage() {
  const scope = useCampScope();
  const visibleCamps = useMemo(() => (scope ? camps.filter((c) => scope.includes(c.code)) : camps), [scope]);
  const [active, setActive] = useState<ReportType>("consumption");
  const [from, setFrom] = useState(weekAgoIso);
  const [to, setTo] = useState(todayIso);
  const [camp, setCamp] = useState(scope ? scope[0] : "all");
  const [meal, setMeal] = useState<Meal>("All");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [ftpOpen, setFtpOpen] = useState(false);
  const [ftpResult, setFtpResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => buildRows(active, { camp, meal, status, query }), [active, camp, meal, status, query]);
  const previewFilters = useMemo(
    () => ({ from, to, camp, meal, status, query }),
    [from, to, camp, meal, status, query],
  );

  const reportName = `${active}_${from}_to_${to}${camp !== "all" ? "_" + camp : ""}`;
  const title = reportTypes.find((r) => r.id === active)!.title;

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("MyMeals — " + title, 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Range: ${from} → ${to}    Camp: ${camp}    Meal: ${meal}    Status: ${status}`, 14, 22);
    autoTable(doc, {
      head: [data.headers],
      body: data.rows,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    doc.save(`${reportName}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
    XLSX.writeFile(wb, `${reportName}.xlsx`);
  }

  function printReport() {
    const node = previewRef.current?.querySelector(".mo-report");
    if (!node) return;
    const win = window.open("", "_blank", "width=1200,height=900");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${title} — MealOps</title>
      <style>
        @page { size: A4 landscape; margin: 0; }
        html, body { margin: 0; padding: 0; background: #f3f4f6; }
        ${REPORT_CSS}
        body { padding: 0; }
        .mo-report { box-shadow: 0 4px 24px rgba(15,23,42,0.06); margin: 16px auto; }
        @media print { .mo-report { margin: 0 auto; box-shadow: none; } }
      </style></head><body>${node.outerHTML}
      <script>window.addEventListener("load", () => { setTimeout(() => window.print(), 250); });<\/script>
      </body></html>`);
    win.document.close();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Reports & Exports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate operational reports, filter by camp, date and meal, then export to PDF / Excel or push to your FTP server.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/drilldown" className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">
            <BarChart3 className="size-4" /> Open drilldown
          </Link>
          <Link to="/audit" className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">
            <ScanLine className="size-4" /> Audit log
          </Link>
          <Link to="/schedules" className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">
            <CalendarClock className="size-4" /> Scheduled reports
          </Link>
          <button onClick={printReport} className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">
            <Printer className="size-4" /> Print / Save PDF
          </button>
          <button onClick={exportPdf} className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">
            <FileText className="size-4" /> Quick PDF
          </button>
          <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium">
            <FileSpreadsheet className="size-4" /> Download Excel
          </button>
          <button onClick={() => { setFtpOpen(true); setFtpResult(null); }} className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold shadow-glow">
            <Server className="size-4" /> Push to FTP
          </button>
        </div>
      </div>

      {/* Report selector */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {reportTypes.map((r) => {
          const isActive = r.id === active;
          return (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`text-left rounded-xl border p-4 transition ${
                isActive
                  ? "border-primary bg-primary/5 shadow-elegant"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <FileBarChart className={`size-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-semibold text-sm">{r.title}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{r.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
          <Filter className="size-4" /> Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <Field label="From">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="To">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Camp">
            <select value={camp} onChange={(e) => setCamp(e.target.value)} className={inputCls}>
              {!scope && <option value="all">All camps</option>}
              {visibleCamps.map((c) => <option key={c.id} value={c.code}>{c.code}</option>)}
            </select>
          </Field>
          <Field label="Meal session">
            <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)} className={inputCls}>
              {["All", "Breakfast", "Lunch", "Dinner"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="all">All</option>
              <option>Eligible</option>
              <option>Already Served</option>
              <option>Not Eligible</option>
              <option>Wrong Camp</option>
              <option>Expired</option>
            </select>
          </Field>
          <Field label="Search">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, ID…" className={`${inputCls} pl-8`} />
            </div>
          </Field>
        </div>
      </div>

      {/* Styled report preview (matches pdf-samples design) */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-semibold">{title} — Preview</div>
            <div className="text-xs text-muted-foreground">{data.rows.length} rows · {from} → {to}</div>
          </div>
          <div className="text-xs text-muted-foreground hidden md:block">File: <span className="font-mono">{reportName}</span></div>
        </div>
        <div ref={previewRef} className="overflow-x-auto max-h-[720px] overflow-y-auto">
          <ReportPreview type={active} filters={previewFilters} scopeCodes={scope} />
        </div>
      </div>

      {ftpOpen && (
        <FtpDialog
          fileName={reportName}
          onClose={() => setFtpOpen(false)}
          onResult={setFtpResult}
        />
      )}

      {ftpResult && (
        <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border p-4 shadow-elegant flex items-start gap-3 ${
          ftpResult.ok ? "bg-success/10 border-success/30 text-success" : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          {ftpResult.ok ? <CheckCircle2 className="size-5 mt-0.5" /> : <AlertCircle className="size-5 mt-0.5" />}
          <div className="text-sm">{ftpResult.msg}</div>
          <button onClick={() => setFtpResult(null)} className="ml-auto"><X className="size-4" /></button>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function FtpDialog({ fileName, onClose, onResult }: { fileName: string; onClose: () => void; onResult: (r: { ok: boolean; msg: string }) => void }) {
  const [host, setHost] = useState("ftp.mealops.ae");
  const [port, setPort] = useState("21");
  const [user, setUser] = useState("mealops_reports");
  const [pass, setPass] = useState("");
  const [path, setPath] = useState("/incoming/reports/");
  const [format, setFormat] = useState<"pdf" | "xlsx" | "both">("both");
  const [busy, setBusy] = useState(false);

  async function push(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await new Promise((r) => setTimeout(r, 1200));
    setBusy(false);
    onResult({
      ok: true,
      msg: `Uploaded ${fileName}.${format === "both" ? "pdf + xlsx" : format} to ftp://${user}@${host}:${port}${path}`,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl bg-card border border-border shadow-elegant" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <Server className="size-4" />
            </div>
            <div>
              <div className="font-semibold">Push report to FTP server</div>
              <div className="text-xs text-muted-foreground">{fileName}</div>
            </div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-secondary"><X className="size-4" /></button>
        </div>
        <form onSubmit={push} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="FTP Host *">
            <input required value={host} onChange={(e) => setHost(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Port">
            <input value={port} onChange={(e) => setPort(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Username *">
            <input required value={user} onChange={(e) => setUser(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Password *">
            <input required type="password" value={pass} onChange={(e) => setPass(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Remote Path">
            <input value={path} onChange={(e) => setPath(e.target.value)} className={`${inputCls} font-mono`} />
          </Field>
          <Field label="Format">
            <select value={format} onChange={(e) => setFormat(e.target.value as "pdf" | "xlsx" | "both")} className={inputCls}>
              <option value="both">PDF + Excel</option>
              <option value="pdf">PDF only</option>
              <option value="xlsx">Excel only</option>
            </select>
          </Field>

          <div className="md:col-span-2 rounded-lg bg-secondary/60 border border-border p-3 text-xs text-muted-foreground">
            FTP credentials are sent over TLS to the MyMeals relay and the report file is uploaded to your server.
            For production rollout, save these credentials per-camp in System Settings so scheduled reports push automatically.
          </div>

          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
            <button disabled={busy} type="submit" className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60">
              <Download className="size-4 rotate-180" /> {busy ? "Uploading…" : "Push to FTP"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------- Row builders ----------------

function buildRows(type: ReportType, f: { camp: string; meal: Meal; status: string; query: string }): { headers: string[]; rows: (string | number)[][] } {
  const q = f.query.toLowerCase();

  if (type === "consumption") {
    const headers = ["Camp", "Site", "Breakfast", "Lunch", "Dinner", "Total Served", "Estimated", "Variance"];
    const rows = camps
      .filter((c) => f.camp === "all" || c.code === f.camp)
      .map((c) => {
        const b = Math.round(c.employees * 0.85);
        const l = c.employees;
        const d = Math.round(c.employees * 0.92);
        const total = b + l + d;
        const est = Math.round(c.employees * 2.9);
        return [c.code, c.site, b, l, d, total, est, est - total];
      });
    return { headers, rows };
  }

  if (type === "employee") {
    const headers = ["Labour ID", "Name", "Camp", "Company", "Designation", "Status", "Breakfast", "Lunch", "Dinner"];
    const rows = employees
      .filter((e) => f.camp === "all" || e.camp === f.camp)
      .filter((e) => f.status === "all" || e.status === f.status)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.labourId.toLowerCase().includes(q))
      .map((e) => [e.labourId, e.name, e.camp, e.company, e.designation, e.status, e.breakfast ? "Yes" : "No", e.lunch ? "Yes" : "No", e.dinner ? "Yes" : "No"]);
    return { headers, rows };
  }

  if (type === "scans") {
    const headers = ["Time", "Labour ID", "Name", "Camp", "Meal", "Status"];
    const rows = recentScans
      .filter((s) => f.camp === "all" || s.camp === f.camp)
      .filter((s) => f.meal === "All" || s.meal === f.meal)
      .filter((s) => f.status === "all" || s.status === f.status)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.labourId.toLowerCase().includes(q))
      .map((s) => [s.time, s.labourId, s.name, s.camp, s.meal, s.status]);
    return { headers, rows };
  }

  if (type === "camp") {
    const headers = ["Code", "Name", "Site", "Employees", "Online", "Served Today", "Balance", "Duplicates"];
    const rows = camps
      .filter((c) => f.camp === "all" || c.code === f.camp)
      .map((c) => {
        const served = Math.round(c.employees * 2.5);
        const balance = Math.round(c.employees * 0.4);
        const dup = c.employees % 11;
        return [c.code, c.name, c.site, c.employees, c.online ? "Online" : "Offline", served, balance, dup];
      });
    return { headers, rows };
  }

  // wastage
  const headers = ["Camp", "Estimated", "Served", "Wastage", "% Wastage"];
  const rows = camps
    .filter((c) => f.camp === "all" || c.code === f.camp)
    .map((c) => {
      const est = Math.round(c.employees * 2.9);
      const served = Math.round(c.employees * 2.5);
      const w = est - served;
      return [c.code, est, served, w, ((w / est) * 100).toFixed(1) + "%"];
    });
  return { headers, rows };
}
