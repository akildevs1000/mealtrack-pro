import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { FileBarChart, FileSpreadsheet, FileText, Filter, Server, Download, Search, X, CheckCircle2, AlertCircle, BarChart3, ScanLine, CalendarClock } from "lucide-react";
import { useCampScope } from "@/lib/session";
import {
  useCamps,
  useReportConsumption,
  useReportCamps,
  useReportWastage,
  useReportScans,
  useReportEmployees,
} from "@/lib/hooks";
import * as XLSX from "xlsx";
import { ReportPreview, REPORT_CSS, type ReportType, type MealFilter, type ReportData } from "@/components/app/ReportPreview";
import { ReportsLiveView } from "@/components/app/ReportsLiveView";

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
const monthAgoIso = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

function ReportsPage() {
  const scope = useCampScope();
  const { data: campsApi } = useCamps();
  const visibleCamps = useMemo(
    () => (scope ? (campsApi ?? []).filter((c) => scope.includes(c.code)) : (campsApi ?? [])),
    [scope, campsApi],
  );
  const [active, setActive] = useState<ReportType>("consumption");
  const [from, setFrom] = useState(monthAgoIso);
  const [to, setTo] = useState(todayIso);
  const [camp, setCamp] = useState(scope ? scope[0] : "all");
  const [meal, setMeal] = useState<Meal>("All");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [ftpOpen, setFtpOpen] = useState(false);
  const [ftpResult, setFtpResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const campParam = camp !== "all" ? camp : undefined;
  // Fire only the query matching the active report. The others stay disabled.
  const consumption = useReportConsumption({ from, to, campCode: campParam });
  const camps = useReportCamps({ from, to, campCode: campParam });
  const wastage = useReportWastage({ from, to, campCode: campParam });
  const scans = useReportScans({ from, to, campCode: campParam, meal, status, q: query });
  const employees = useReportEmployees({ campCode: campParam, status, q: query });

  const previewFilters = useMemo(
    () => ({ from, to, camp, meal, status, query }),
    [from, to, camp, meal, status, query],
  );

  const reportName = `${active}_${from}_to_${to}${camp !== "all" ? "_" + camp : ""}`;
  const title = reportTypes.find((r) => r.id === active)!.title;

  const scopeLabel = scope
    ? scope.length === 1
      ? scope[0]
      : `${scope.length} camps`
    : campParam ?? "All Camps";

  const { data, loading, headers, exportRows } = useMemo<{
    data: ReportData | null;
    loading: boolean;
    headers: string[];
    exportRows: (string | number)[][];
  }>(() => {
    if (active === "consumption") {
      const rows = consumption.data?.rows ?? [];
      return {
        data: { kind: "consumption", rows },
        loading: consumption.isLoading,
        headers: ["Camp", "Site", "Breakfast", "Lunch", "Dinner", "Total Served", "Estimated", "Variance"],
        exportRows: rows.map((r) => [r.code, r.site, r.breakfast, r.lunch, r.dinner, r.served, r.estimated, r.variance]),
      };
    }
    if (active === "camp") {
      const rows = camps.data?.rows ?? [];
      return {
        data: { kind: "camp", rows },
        loading: camps.isLoading,
        headers: ["Code", "Name", "Site", "Employees", "Served", "Coverage %", "Balance", "Duplicates", "Online", "Devices"],
        exportRows: rows.map((r) => [r.code, r.name, r.site, r.employees, r.served, r.coverage, r.balance, r.duplicates, r.online ? "Online" : "Offline", `${r.devicesOnline}/${r.devicesTotal}`]),
      };
    }
    if (active === "wastage") {
      const rows = wastage.data?.rows ?? [];
      return {
        data: { kind: "wastage", rows },
        loading: wastage.isLoading,
        headers: ["Camp", "Site", "Estimated", "Served", "Wastage", "% Wastage", "Status"],
        exportRows: rows.map((r) => [r.code, r.site, r.estimated, r.served, r.wastage, `${r.pct.toFixed(1)}%`, r.status]),
      };
    }
    if (active === "scans") {
      const rows = scans.data ?? [];
      return {
        data: { kind: "scans", rows },
        loading: scans.isLoading,
        headers: ["Date", "Time", "Labour ID", "Name", "Camp", "Meal", "Status"],
        exportRows: rows.map((s) => [s.date, s.time, s.labourId, s.name, s.camp, s.meal, s.status]),
      };
    }
    // employee
    const rows = employees.data ?? [];
    return {
      data: { kind: "employee", rows },
      loading: employees.isLoading,
      headers: ["Labour ID", "Name", "Camp", "Company", "Designation", "Status", "Breakfast", "Lunch", "Dinner"],
      exportRows: rows.map((e) => [e.labourId, e.name, e.camp, e.company, e.designation, e.status, e.breakfast ? "Yes" : "No", e.lunch ? "Yes" : "No", e.dinner ? "Yes" : "No"]),
    };
  }, [active, consumption.data, consumption.isLoading, camps.data, camps.isLoading, wastage.data, wastage.isLoading, scans.data, scans.isLoading, employees.data, employees.isLoading]);

  function exportPdf() {
    const node = previewRef.current?.querySelector(".mo-report") as HTMLElement | null;
    if (!node) return;
    setPdfBusy(true);
    try {
      // Open the report in an isolated print window. The browser uses its own
      // rendering engine (identical to the live preview) so the printed PDF is
      // a pixel-perfect copy. The user picks "Save as PDF" in the dialog.
      const win = window.open("", "_blank", "width=1200,height=900");
      if (!win) {
        alert("Allow pop-ups for this site to download the PDF.");
        return;
      }
      // Grab every .mo-report section in order (the report may have been
      // pre-paginated into multiple sections — e.g. Employee Master, Scan
      // Activity Log). Each section becomes its own printed page.
      const wrap = previewRef.current!;
      const sections = wrap.querySelectorAll<HTMLElement>(".mo-report");
      const sectionsHtml = Array.from(sections).map((s) => s.outerHTML).join("");

      win.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${reportName}</title>
        <style>
          @page { size: A4 landscape; margin: 0; }
          html, body { margin: 0; padding: 0; background: #ffffff; }
          ${REPORT_CSS}
          .mo-report-wrap { background: #ffffff; padding: 0; border-radius: 0; }
          .mo-report {
            box-shadow: none;
            margin: 0 auto;
            width: 297mm !important;
            height: 210mm !important;
            min-height: 210mm !important;
            max-height: 210mm !important;
            overflow: hidden !important;
          }
          .mo-report + .mo-report { margin-top: 0; }
          .mo-report tbody tr { page-break-inside: avoid; break-inside: avoid; }
          @media screen { body { background: #f3f4f6; padding: 16px; } .mo-report + .mo-report { margin-top: 16px; } }
        </style></head><body>${sectionsHtml}
        <script>window.addEventListener("load", () => { setTimeout(() => { window.focus(); window.print(); }, 200); });<\/script>
        </body></html>`);
      win.document.close();
    } finally {
      setPdfBusy(false);
    }
  }

  function exportExcel() {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...exportRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 28));
    XLSX.writeFile(wb, `${reportName}.xlsx`);
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
          <button onClick={exportPdf} disabled={pdfBusy || loading} className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium disabled:opacity-60">
            <FileText className="size-4" /> {pdfBusy ? "Generating…" : "Download PDF"}
          </button>
          <button onClick={exportExcel} disabled={loading} className="inline-flex items-center gap-2 rounded-lg bg-secondary hover:bg-secondary/80 px-3.5 py-2 text-sm font-medium disabled:opacity-60">
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

      {/* Live dark-theme view (KPI tiles + table) */}
      <ReportsLiveView data={data} loading={loading} />

      {/* Offscreen white-doc render — used only as the source for the PDF export */}
      <div
        ref={previewRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: "1123px",
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <ReportPreview type={active} filters={previewFilters} scopeLabel={scopeLabel} data={data} loading={loading} />
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
