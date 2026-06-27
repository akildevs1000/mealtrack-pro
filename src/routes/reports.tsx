import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, FileText, AlertTriangle } from "lucide-react";
import { useCampScope } from "@/lib/session";
import {
  useCompanies,
  useCamps,
  useManagers,
  useReportDailyDistribution,
  useReportBySupplier,
  useReportByLocation,
  useReportRequestComparison,
  useReportDuplicateEligibility,
} from "@/lib/hooks";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — MyMeals" }] }),
});

type TabId = "daily" | "supplier" | "location" | "comparison" | "duplicate";

const TABS: { id: TabId; n: number; title: string; desc: string }[] = [
  { id: "daily", n: 1, title: "Daily Transaction", desc: "Meal distribution per worker for a selected date" },
  { id: "supplier", n: 2, title: "Reports by Supplier", desc: "Distribution-point meals by supplier, pivoted by date" },
  { id: "location", n: 3, title: "Reports by Location", desc: "Daily meal distribution for a camp / location" },
  { id: "comparison", n: 4, title: "Request Comparison", desc: "Food estimations vs the previous day (variance)" },
  { id: "duplicate", n: 5, title: "Duplicate / Eligibility", desc: "Invalid check-ins, duplicate scans and rule exceptions" },
];

const todayIso = new Date().toISOString().slice(0, 10);
const monthAgoIso = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

const inputCls =
  "px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function ReportsPage() {
  const scope = useCampScope();
  const { data: companies = [] } = useCompanies();
  const { data: campsAll = [] } = useCamps();
  const { data: allSuppliers = [] } = useManagers();

  const [tab, setTab] = useState<TabId>("daily");
  const [company, setCompany] = useState("all");
  const [date, setDate] = useState(todayIso);
  const [from, setFrom] = useState(monthAgoIso);
  const [to, setTo] = useState(todayIso);
  const [camp, setCamp] = useState("all");
  const [supplier, setSupplier] = useState("all");

  const companyParam = company === "all" ? undefined : company;
  const campParam = camp === "all" ? undefined : camp;
  const supplierParam = supplier === "all" ? undefined : supplier;

  // Parent company → sibling lists (camps / suppliers) filtered by it.
  const camps = useMemo(() => {
    let cs = scope ? campsAll.filter((c) => scope.includes(c.code)) : campsAll;
    if (companyParam) cs = cs.filter((c) => c.companyCode === company);
    return cs;
  }, [campsAll, scope, company, companyParam]);
  const suppliers = useMemo(
    () => (companyParam ? allSuppliers.filter((s) => s.companyCode === company) : allSuppliers),
    [allSuppliers, company, companyParam],
  );

  function onCompany(v: string) {
    setCompany(v);
    setCamp("all");
    setSupplier("all");
  }

  const daily = useReportDailyDistribution({ date, companyCode: companyParam, campCode: campParam });
  const bySupplier = useReportBySupplier({ from, to, companyCode: companyParam, campCode: campParam, supplierId: supplierParam });
  const byLocation = useReportByLocation({ from, to, companyCode: companyParam, campCode: campParam });
  const comparison = useReportRequestComparison({ from, to, companyCode: companyParam, supplierId: supplierParam });
  const duplicate = useReportDuplicateEligibility({ from, to, companyCode: companyParam, campCode: campParam });

  // Build a [headers, ...rows] matrix for the Excel export per tab.
  const exportMatrix = useMemo<(string | number)[][]>(() => {
    if (tab === "daily") {
      const rows = daily.data?.rows ?? [];
      return [
        ["Company", "Employee ID", "Employee Name", "Breakfast", "Lunch", "Dinner"],
        ...rows.map((r) => [r.company, r.employeeId, r.name, r.breakfast || "—", r.lunch || "—", r.dinner || "—"]),
      ];
    }
    if (tab === "supplier") {
      const d = bySupplier.data;
      if (!d) return [];
      const nm = new Map(d.camps.map((c) => [c.code, c.name]));
      const rows = supplierStackedRows(d);
      return [
        ["Date", "Distribution Point", "Breakfast", "Lunch", "Dinner", "Total"],
        ...rows.map((r) => [r.date, `${r.code} — ${nm.get(r.code) ?? ""}`, r.breakfast, r.lunch, r.dinner, r.total]),
      ];
    }
    if (tab === "location") {
      const rows = byLocation.data?.rows ?? [];
      return [["Date", "Breakfast", "Lunch", "Dinner"], ...rows.map((r) => [r.date, r.breakfast, r.lunch, r.dinner])];
    }
    if (tab === "comparison") {
      const rows = comparison.data?.rows ?? [];
      return [
        ["Date", "Supplier", "Site", "Meal", "Requested Yesterday", "Requested Today", "Variance", "% Change"],
        ...rows.map((r) => [
          r.date, r.supplier, r.site, r.meal,
          r.requestedYesterday ?? "—", r.requestedToday,
          r.variance ?? "—", r.pctChange === null ? "—" : `${r.pctChange}%`,
        ]),
      ];
    }
    const rows = duplicate.data?.rows ?? [];
    return [
      ["Worker ID", "Actual Location", "Scan Location", "Status", "Reason", "Meal", "Date", "Scan Time"],
      ...rows.map((r) => [r.workerId, r.actualLocation, r.scanLocation, r.status, r.reason, r.meal, r.date, r.time]),
    ];
  }, [tab, daily.data, bySupplier.data, byLocation.data, comparison.data, duplicate.data]);

  const companyLabel = company === "all" ? "All companies" : companies.find((c) => c.code === company)?.name ?? company;

  function exportExcel() {
    if (exportMatrix.length === 0) return;
    const ws = XLSX.utils.aoa_to_sheet(exportMatrix);
    const wb = XLSX.utils.book_new();
    const meta = TABS.find((t) => t.id === tab)!;
    XLSX.utils.book_append_sheet(wb, ws, meta.title.slice(0, 28));
    const range = tab === "daily" ? date : `${from}_to_${to}`;
    XLSX.writeFile(wb, `${meta.title.replace(/\s+/g, "_")}_${range}.xlsx`);
  }

  async function exportPdf() {
    if (exportMatrix.length <= 1) return;
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const meta = TABS.find((t) => t.id === tab)!;
    const landscape = exportMatrix[0].length > 6;
    const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    const headerH = 56;
    const rangeLabel = tab === "daily" ? fmtDate(date) : `${fmtDate(from)} → ${fmtDate(to)}`;
    const generated = new Date().toLocaleString(undefined, {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const head = [exportMatrix[0].map(String)];
    const body = exportMatrix.slice(1).map((r) => r.map((c) => String(c)));

    autoTable(doc, {
      head,
      body,
      margin: { top: headerH + 16, bottom: 34, left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [244, 247, 252] },
      didParseCell: (d: any) => {
        // Report 5 — colour rows by Status (Duplicate = amber, else red).
        if (tab === "duplicate" && d.section === "body") {
          const status = String(body[d.row.index]?.[3] ?? "").toLowerCase();
          d.cell.styles.fillColor = status.includes("duplicate") ? [254, 243, 199] : [254, 226, 226];
        }
      },
      didDrawPage: () => {
        // ── Header band (repeats on every page) ──
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, headerH, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text("MyMeals", margin, 24);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text("Integrated Reports Suite", margin, 38);
        // Report title + meta, right-aligned
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11.5);
        doc.setTextColor(255, 255, 255);
        doc.text(`${meta.n}. ${meta.title}`, pageW - margin, 24, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`${companyLabel}   ·   ${rangeLabel}`, pageW - margin, 38, { align: "right" });

        // ── Footer (repeats on every page) ──
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(margin, pageH - 24, pageW - margin, pageH - 24);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(120, 120, 120);
        doc.text(`Generated ${generated}`, margin, pageH - 12);
      },
    });

    // Page "X of Y" — written after all pages exist.
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text(`Page ${i} of ${total}`, pageW - margin, pageH - 12, { align: "right" });
    }

    const range = tab === "daily" ? date : `${from}_to_${to}`;
    doc.save(`${meta.title.replace(/\s+/g, "_")}_${range}.pdf`);
  }

  const showDate = tab === "daily";
  const showRange = !showDate;
  const showCamp = tab === "daily" || tab === "location" || tab === "duplicate";
  const showSupplier = tab === "supplier" || tab === "comparison";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Integrated Reports Suite</div>
          <h1 className="font-display text-2xl font-bold tracking-tight mt-1">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Transactional performance and volume metrics under the selected Company filter.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPdf}
            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm font-semibold hover:bg-secondary/80"
          >
            <FileText className="size-4" /> Download PDF
          </button>
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95"
          >
            <Download className="size-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`text-left rounded-xl border px-4 py-3 transition w-[calc(50%-0.25rem)] sm:w-auto sm:min-w-[170px] ${
              tab === t.id
                ? "border-primary/40 bg-primary/10"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`grid size-5 place-items-center rounded-md text-[11px] ${tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{t.n}</span>
              {t.title}
            </div>
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* Filter bar — Company is the parent; the rest are siblings. */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
        <Labeled label="Company">
          <select value={company} onChange={(e) => onCompany(e.target.value)} className={inputCls}>
            <option value="all">All companies</option>
            {companies.map((co) => (
              <option key={co.id} value={co.code}>{co.code} — {co.name}</option>
            ))}
          </select>
        </Labeled>
        {showDate && (
          <Labeled label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Labeled>
        )}
        {showRange && (
          <>
            <Labeled label="From">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
            </Labeled>
            <Labeled label="To">
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </Labeled>
          </>
        )}
        {showCamp && (
          <Labeled label={tab === "location" ? "Location (Camp)" : "Camp"}>
            <select value={camp} onChange={(e) => setCamp(e.target.value)} className={inputCls}>
              <option value="all">All camps</option>
              {camps.map((c) => (
                <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </Labeled>
        )}
        {showSupplier && (
          <Labeled label="Supplier">
            <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls}>
              <option value="all">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Labeled>
        )}
      </div>

      {/* Report body */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
        {tab === "daily" && <DailyTable rows={daily.data?.rows ?? []} loading={daily.isLoading} />}
        {tab === "supplier" && <SupplierStacked data={bySupplier.data} loading={bySupplier.isLoading} />}
        {tab === "location" && <LocationTable rows={byLocation.data?.rows ?? []} loading={byLocation.isLoading} />}
        {tab === "comparison" && <ComparisonTable rows={comparison.data?.rows ?? []} loading={comparison.isLoading} />}
        {tab === "duplicate" && <DuplicateTable rows={duplicate.data?.rows ?? []} loading={duplicate.isLoading} from={from} to={to} />}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const thL = "text-left px-4 py-3 font-medium";
const thR = "text-right px-4 py-3 font-medium";
const tdL = "px-4 py-2.5";
const tdR = "px-4 py-2.5 text-right tabular-nums";

function Empty({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-12 text-center text-muted-foreground text-sm">{msg}</td>
    </tr>
  );
}

// ── Report 1 ─────────────────────────────────────────────────────────────
function DailyTable({ rows, loading }: { rows: import("@/lib/hooks").DailyDistRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Company</th>
            <th className={thL}>Employee ID</th>
            <th className={thL}>Employee Name</th>
            <th className={thL}>Breakfast</th>
            <th className={thL}>Lunch</th>
            <th className={thL}>Dinner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.employeeId}-${i}`} className="border-t border-border hover:bg-secondary/30">
              <td className={tdL}>{r.company || "—"}</td>
              <td className={`${tdL} font-mono text-xs`}>{r.employeeId}</td>
              <td className={tdL}>{r.name}</td>
              <td className={tdL}>{r.breakfast || "—"}</td>
              <td className={tdL}>{r.lunch || "—"}</td>
              <td className={tdL}>{r.dinner || "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={6} msg={loading ? "Loading…" : "No meals distributed on this date."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 2 (stacked: one row per Date × distribution point) ─────────────
function supplierStackedRows(d: import("@/lib/hooks").BySupplierData) {
  return d.rows.flatMap((r) =>
    Object.entries(r.perCamp)
      .map(([code, cell]) => ({ date: r.date, code, ...cell, total: cell.breakfast + cell.lunch + cell.dinner }))
      .filter((x) => x.total > 0),
  );
}
function SupplierStacked({ data, loading }: { data: import("@/lib/hooks").BySupplierData | undefined; loading: boolean }) {
  const campName = new Map((data?.camps ?? []).map((c) => [c.code, c.name]));
  const rows = data ? supplierStackedRows(data) : [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Date</th>
            <th className={thL}>Distribution Point</th>
            <th className={thR}>Breakfast</th>
            <th className={thR}>Lunch</th>
            <th className={thR}>Dinner</th>
            <th className={thR}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.date}-${r.code}-${i}`} className="border-t border-border hover:bg-secondary/30">
              <td className={`${tdL} whitespace-nowrap`}>{fmtDate(r.date)}</td>
              <td className={tdL}>
                <span className="rounded-md bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">{r.code}</span>
                <span className="text-muted-foreground text-xs ml-2">{campName.get(r.code)}</span>
              </td>
              <td className={tdR}>{r.breakfast}</td>
              <td className={tdR}>{r.lunch}</td>
              <td className={tdR}>{r.dinner}</td>
              <td className={`${tdR} font-semibold`}>{r.total}</td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={6} msg={loading ? "Loading…" : "No served meals in this range."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 3 ─────────────────────────────────────────────────────────────
function LocationTable({ rows, loading }: { rows: import("@/lib/hooks").ByLocationRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Date</th>
            <th className={thR}>Breakfast</th>
            <th className={thR}>Lunch</th>
            <th className={thR}>Dinner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-t border-border hover:bg-secondary/30">
              <td className={`${tdL} whitespace-nowrap`}>{fmtDate(r.date)}</td>
              <td className={tdR}>{r.breakfast}</td>
              <td className={tdR}>{r.lunch}</td>
              <td className={tdR}>{r.dinner}</td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={4} msg={loading ? "Loading…" : "No meals in this range."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 4 ─────────────────────────────────────────────────────────────
function ComparisonTable({ rows, loading }: { rows: import("@/lib/hooks").ComparisonRow[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className={thL}>Date</th>
            <th className={thL}>Supplier</th>
            <th className={thL}>Site</th>
            <th className={thL}>Meal</th>
            <th className={thR}>Req. Yesterday</th>
            <th className={thR}>Req. Today</th>
            <th className={thR}>Variance</th>
            <th className={thR}>% Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const up = (r.variance ?? 0) > 0;
            const down = (r.variance ?? 0) < 0;
            return (
              <tr key={i} className="border-t border-border hover:bg-secondary/30">
                <td className={`${tdL} whitespace-nowrap`}>{fmtDate(r.date)}</td>
                <td className={tdL}>{r.supplier}</td>
                <td className={tdL}>{r.site}</td>
                <td className={tdL}>{r.meal}</td>
                <td className={tdR}>{r.requestedYesterday ?? "—"}</td>
                <td className={`${tdR} font-medium`}>{r.requestedToday}</td>
                <td className={`${tdR} ${up ? "text-success" : down ? "text-destructive" : ""}`}>
                  {r.variance === null ? "—" : `${r.variance > 0 ? "+" : ""}${r.variance}`}
                </td>
                <td className={`${tdR} ${up ? "text-success" : down ? "text-destructive" : ""}`}>
                  {r.pctChange === null ? "—" : `${r.pctChange > 0 ? "+" : ""}${r.pctChange}%`}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <Empty cols={8} msg={loading ? "Loading…" : "No food estimations in this range."} />}
        </tbody>
      </table>
    </div>
  );
}

// ── Report 5 ─────────────────────────────────────────────────────────────
function DuplicateTable({ rows, loading, from, to }: { rows: import("@/lib/hooks").DuplicateRow[]; loading: boolean; from: string; to: string }) {
  return (
    <>
      <div className="px-4 py-3 border-b border-border text-xs text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="size-3.5 text-warning" />
        Period: {fmtDate(from)} → {fmtDate(to)} · <span className="text-amber-500">duplicate</span> · <span className="text-destructive">not eligible</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className={thL}>Worker ID</th>
              <th className={thL}>Actual Location</th>
              <th className={thL}>Scan Location</th>
              <th className={thL}>Status</th>
              <th className={thL}>Reason</th>
              <th className={thL}>Meal</th>
              <th className={thL}>Date</th>
              <th className={thL}>Scan Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const tone =
                r.severity === "duplicate"
                  ? "bg-amber-500/10 hover:bg-amber-500/15"
                  : "bg-destructive/10 hover:bg-destructive/15";
              return (
                <tr key={i} className={`border-t border-border ${tone}`}>
                  <td className={`${tdL} font-mono text-xs`}>{r.workerId}</td>
                  <td className={tdL}>{r.actualLocation}</td>
                  <td className={tdL}>{r.scanLocation}</td>
                  <td className={tdL}>
                    <span className={`text-xs font-semibold ${r.severity === "duplicate" ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`}>{r.status}</span>
                  </td>
                  <td className={`${tdL} text-muted-foreground`}>{r.reason}</td>
                  <td className={tdL}>{r.meal}</td>
                  <td className={`${tdL} whitespace-nowrap`}>{r.date}</td>
                  <td className={tdL}>{r.time}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <Empty cols={8} msg={loading ? "Loading…" : "No duplicate or ineligible scans in this range."} />}
          </tbody>
        </table>
      </div>
    </>
  );
}
