import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
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
      const head1: (string | number)[] = ["Date"];
      const head2: (string | number)[] = [""];
      for (const c of d.camps) {
        head1.push(c.code, "", "");
        head2.push("B/F", "Lunch", "Dinner");
      }
      head1.push("Total", "", "", "Avg/Day");
      head2.push("B/F", "Lunch", "Dinner", "");
      const body = d.rows.map((r) => {
        const row: (string | number)[] = [r.date];
        for (const c of d.camps) {
          const cell = r.perCamp[c.code] ?? { breakfast: 0, lunch: 0, dinner: 0 };
          row.push(cell.breakfast, cell.lunch, cell.dinner);
        }
        row.push(r.totals.breakfast, r.totals.lunch, r.totals.dinner, r.avgPerDay);
        return row;
      });
      return [head1, head2, ...body];
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

  function exportExcel() {
    if (exportMatrix.length === 0) return;
    const ws = XLSX.utils.aoa_to_sheet(exportMatrix);
    const wb = XLSX.utils.book_new();
    const meta = TABS.find((t) => t.id === tab)!;
    XLSX.utils.book_append_sheet(wb, ws, meta.title.slice(0, 28));
    const range = tab === "daily" ? date : `${from}_to_${to}`;
    XLSX.writeFile(wb, `${meta.title.replace(/\s+/g, "_")}_${range}.xlsx`);
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
        <button
          onClick={exportExcel}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95"
        >
          <Download className="size-4" /> Export Excel
        </button>
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
        {tab === "supplier" && <SupplierPivot data={bySupplier.data} loading={bySupplier.isLoading} />}
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

// ── Report 2 (pivot) ─────────────────────────────────────────────────────
function SupplierPivot({ data, loading }: { data: import("@/lib/hooks").BySupplierData | undefined; loading: boolean }) {
  const camps = data?.camps ?? [];
  const rows = data?.rows ?? [];
  const cols = 1 + camps.length * 3 + 3 + 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th rowSpan={2} className={`${thL} align-bottom`}>Date</th>
            {camps.map((c) => (
              <th key={c.code} colSpan={3} className="text-center px-4 py-2 font-medium border-l border-border">{c.code}</th>
            ))}
            <th colSpan={3} className="text-center px-4 py-2 font-medium border-l border-border text-primary">Total</th>
            <th rowSpan={2} className={`${thR} align-bottom border-l border-border`}>Avg/Day</th>
          </tr>
          <tr>
            {camps.map((c) => (
              <MealSubHead key={c.code} bordered />
            ))}
            <MealSubHead bordered primary />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className="border-t border-border hover:bg-secondary/30">
              <td className={`${tdL} whitespace-nowrap`}>{fmtDate(r.date)}</td>
              {camps.map((c) => {
                const cell = r.perCamp[c.code] ?? { breakfast: 0, lunch: 0, dinner: 0 };
                return (
                  <Fragment key={c.code}>
                    <td className={`${tdR} border-l border-border`}>{cell.breakfast}</td>
                    <td className={tdR}>{cell.lunch}</td>
                    <td className={tdR}>{cell.dinner}</td>
                  </Fragment>
                );
              })}
              <td className={`${tdR} border-l border-border font-semibold text-primary`}>{r.totals.breakfast}</td>
              <td className={`${tdR} font-semibold text-primary`}>{r.totals.lunch}</td>
              <td className={`${tdR} font-semibold text-primary`}>{r.totals.dinner}</td>
              <td className={`${tdR} border-l border-border font-semibold`}>{r.avgPerDay}</td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={cols} msg={loading ? "Loading…" : "No served meals in this range."} />}
        </tbody>
      </table>
    </div>
  );
}
function MealSubHead({ bordered, primary }: { bordered?: boolean; primary?: boolean }) {
  const base = `text-right px-4 py-2 font-medium text-[11px] ${primary ? "text-primary" : ""}`;
  return (
    <>
      <th className={`${base} ${bordered ? "border-l border-border" : ""}`}>B/F</th>
      <th className={base}>Lunch</th>
      <th className={base}>Dinner</th>
    </>
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
