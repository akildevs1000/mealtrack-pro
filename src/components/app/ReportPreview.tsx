import type {
  ReportConsumptionRow,
  ReportCampRow,
  ReportWastageRow,
  ReportScanRow,
  ReportEmployeeRow,
  ReportType,
  MealFilter,
  ReportFilters,
  ReportData,
} from "./report-preview-types";

export type {
  ReportConsumptionRow,
  ReportCampRow,
  ReportWastageRow,
  ReportScanRow,
  ReportEmployeeRow,
  ReportType,
  MealFilter,
  ReportFilters,
  ReportData,
};

type Props = {
  type: ReportType;
  filters: ReportFilters;
  scopeLabel: string;
  data: ReportData | null;
  loading?: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}
function fmtDayName(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return DAYS[d.getDay()];
}
function fmtNum(n: number) {
  return n.toLocaleString("en-US");
}
function fmtNow() {
  const d = new Date();
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmtDate(d.toISOString().slice(0, 10))} ${time}`;
}

const AVATAR_PALETTE = ["green", "amber", "violet", "rose", "cyan", "slate"] as const;
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const REPORT_META: Record<ReportType, { title: string; subtitle: string; metaLeft: string; legend: React.ReactNode }> = {
  consumption: {
    title: "DAILY MEAL CONSUMPTION",
    subtitle: "Per-camp served vs estimated by meal session",
    metaLeft: "Period",
    legend: (
      <>
        <span><span className="ok">●</span> Healthy ≤ 5% variance</span>
        <span><span className="warn">●</span> Watch 5–10%</span>
        <span><span className="crit">●</span> Critical &gt; 10%</span>
      </>
    ),
  },
  employee: {
    title: "EMPLOYEE MASTER",
    subtitle: "All employees with eligibility and status",
    metaLeft: "Snapshot",
    legend: (
      <>
        <span><span className="emp-active">●</span> Active</span>
        <span><span className="emp-leave">●</span> Leave</span>
        <span><span className="emp-vacation">●</span> Vacation</span>
        <span><span className="emp-inactive">●</span> Inactive</span>
      </>
    ),
  },
  scans: {
    title: "SCAN ACTIVITY LOG",
    subtitle: "Every QR scan with status and operator",
    metaLeft: "Date",
    legend: (
      <>
        <span><span className="ok">●</span> Eligible</span>
        <span><span className="scan-served">●</span> Already Served</span>
        <span><span className="crit">●</span> Wrong Camp</span>
        <span>● Not Eligible / Expired</span>
      </>
    ),
  },
  camp: {
    title: "CAMP PERFORMANCE",
    subtitle: "Camp-wise totals, online %, balance and duplicates",
    metaLeft: "Period",
    legend: (
      <>
        <span><span className="ok">●</span> Online — all scanners reachable</span>
        <span><span className="crit">●</span> Offline — at least one scanner down</span>
      </>
    ),
  },
  wastage: {
    title: "WASTAGE & VARIANCE",
    subtitle: "Estimated minus served, % wastage by camp · target ≤ 5%",
    metaLeft: "Period",
    legend: (
      <>
        <span><span className="ok">●</span> Healthy ≤ 5%</span>
        <span><span className="watch">●</span> Watch 5–10%</span>
        <span><span className="crit">●</span> Critical &gt; 10%</span>
        <span><span className="target">│</span> Target line on bar</span>
      </>
    ),
  },
};

// ---------------- Shared shell ----------------

function BrandBar({ type, filters, scopeLabel }: { type: ReportType; filters: ReportFilters; scopeLabel: string }) {
  const meta = REPORT_META[type];
  return (
    <header className="brand-bar">
      <div className="brand-left">
        <div className="brand-logo">MO</div>
        <div>
          <div className="brand-name">MEALOPS</div>
          <div className="brand-sub">Meal Tracking System</div>
          <div className="brand-tag">UAE Labour Camps</div>
        </div>
      </div>
      <div className="meta">
        <div className="row"><span>{meta.metaLeft}</span><span>{fmtDate(filters.to)}</span></div>
        <div className="row"><span>Scope</span><span>{scopeLabel}</span></div>
        <div className="row"><span>Generated</span><span>{fmtNow()}</span></div>
      </div>
    </header>
  );
}

function TitleBand({ type, filters }: { type: ReportType; filters: ReportFilters }) {
  const meta = REPORT_META[type];
  return (
    <div className="title-band">
      <h1>{meta.title}</h1>
      <div className="subtitle">
        {fmtDate(filters.to)} <span className="dot">•</span> {fmtDayName(filters.to)} <span className="dot">•</span> {meta.subtitle}
      </div>
    </div>
  );
}

function PageFooter({ type, pageNum, totalPages }: { type: ReportType; pageNum: number; totalPages: number }) {
  return (
    <footer className="footer">
      <div className="legend">{REPORT_META[type].legend}</div>
      <div>Powered by <strong style={{ color: "#0f172a" }}>MealOps</strong></div>
      <div>Page {pageNum} of {totalPages}</div>
    </footer>
  );
}

function ContinuationTitle({ type, range }: { type: ReportType; range: string }) {
  return (
    <h2 className="page-cont-title">
      {REPORT_META[type].title} <span>— continued · {range}</span>
    </h2>
  );
}

// ---------------- Main entry ----------------

export function ReportPreview({ type, filters, scopeLabel, data, loading }: Props) {
  return (
    <div className="mo-report-wrap">
      <style>{REPORT_CSS}</style>
      {loading || !data ? (
        <section className="mo-report">
          <BrandBar type={type} filters={filters} scopeLabel={scopeLabel} />
          <TitleBand type={type} filters={filters} />
          <div style={{ padding: "32px 12px", textAlign: "center", color: "#64748b" }}>
            {loading ? "Loading data…" : "No data."}
          </div>
          <PageFooter type={type} pageNum={1} totalPages={1} />
        </section>
      ) : data.kind === "consumption" ? (
        <ConsumptionReport rows={data.rows} type={type} filters={filters} scopeLabel={scopeLabel} />
      ) : data.kind === "camp" ? (
        <CampReport rows={data.rows} type={type} filters={filters} scopeLabel={scopeLabel} />
      ) : data.kind === "wastage" ? (
        <WastageReport rows={data.rows} type={type} filters={filters} scopeLabel={scopeLabel} />
      ) : data.kind === "scans" ? (
        <ScansReport rows={data.rows} type={type} filters={filters} scopeLabel={scopeLabel} />
      ) : (
        <EmployeeReport rows={data.rows} type={type} filters={filters} scopeLabel={scopeLabel} />
      )}
    </div>
  );
}

type ShellProps = { type: ReportType; filters: ReportFilters; scopeLabel: string };

// ---------------- Consumption (single page) ----------------

function ConsumptionReport({ rows, type, filters, scopeLabel }: ShellProps & { rows: ReportConsumptionRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      breakfast: acc.breakfast + r.breakfast,
      lunch: acc.lunch + r.lunch,
      dinner: acc.dinner + r.dinner,
      served: acc.served + r.served,
      estimated: acc.estimated + r.estimated,
      variance: acc.variance + r.variance,
    }),
    { breakfast: 0, lunch: 0, dinner: 0, served: 0, estimated: 0, variance: 0 },
  );
  const wastage = totals.estimated > 0 ? ((totals.estimated - totals.served) / totals.estimated) * 100 : 0;

  function classify(rowVariance: number, rowEstimated: number): "ok" | "warn" | "crit" {
    const pct = rowEstimated > 0 ? (Math.abs(rowVariance) / rowEstimated) * 100 : 0;
    return pct <= 5 ? "ok" : pct <= 10 ? "warn" : "crit";
  }

  return (
    <section className="mo-report">
      <BrandBar type={type} filters={filters} scopeLabel={scopeLabel} />
      <TitleBand type={type} filters={filters} />

      <div className="pills cols-7">
        <Pill kind="served" label="Served" value={fmtNum(totals.served)} />
        <Pill kind="estimated" label="Estimated" value={fmtNum(totals.estimated)} />
        <Pill kind="breakfast" label="Breakfast" value={fmtNum(totals.breakfast)} />
        <Pill kind="lunch" label="Lunch" value={fmtNum(totals.lunch)} />
        <Pill kind="dinner" label="Dinner" value={fmtNum(totals.dinner)} />
        <Pill kind="variance" label="Variance" value={(totals.variance < 0 ? "−" : "") + fmtNum(Math.abs(totals.variance))} />
        <Pill kind="wastage" label="Wastage %" value={`${wastage.toFixed(1)}%`} />
      </div>

      <table>
        <thead>
          <tr>
            <th>Camp</th>
            <th>Site</th>
            <th className="right">Breakfast</th>
            <th className="right">Lunch</th>
            <th className="right">Dinner</th>
            <th className="right">Total Served</th>
            <th className="right">Estimated</th>
            <th className="right">Variance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const status = classify(r.variance, r.estimated);
            return (
              <tr key={r.code} className={status === "warn" ? "warn" : status === "crit" ? "crit" : ""}>
                <td><div className="main">{r.code}</div><div className="sub">{r.name}</div></td>
                <td>{r.site}</td>
                <td className="right num">{fmtNum(r.breakfast)}</td>
                <td className="right num">{fmtNum(r.lunch)}</td>
                <td className="right num">{fmtNum(r.dinner)}</td>
                <td className="right num"><strong>{fmtNum(r.served)}</strong></td>
                <td className="right num">{fmtNum(r.estimated)}</td>
                <td className={`right num ${r.variance < 0 ? "neg" : r.variance > 0 ? "pos" : "neu"}`}>
                  {r.variance < 0 ? "−" : r.variance > 0 ? "+" : ""}{fmtNum(Math.abs(r.variance))}
                </td>
                <td>
                  <span className={`status ${status === "ok" ? "ok" : status === "warn" ? "warn" : "crit"}`}>
                    {status === "ok" ? "Healthy" : status === "warn" ? "Watch" : "Critical"}
                  </span>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && <EmptyRow span={9} />}
          {rows.length > 0 && (
            <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
              <td>TOTAL</td>
              <td>{rows.length} camp{rows.length === 1 ? "" : "s"}</td>
              <td className="right num">{fmtNum(totals.breakfast)}</td>
              <td className="right num">{fmtNum(totals.lunch)}</td>
              <td className="right num">{fmtNum(totals.dinner)}</td>
              <td className="right num">{fmtNum(totals.served)}</td>
              <td className="right num">{fmtNum(totals.estimated)}</td>
              <td className={`right num ${totals.variance < 0 ? "neg" : "pos"}`}>
                {totals.variance < 0 ? "−" : "+"}{fmtNum(Math.abs(totals.variance))}
              </td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>

      <PageFooter type={type} pageNum={1} totalPages={1} />
    </section>
  );
}

// ---------------- Camp (paginated) ----------------

const CAMP_ROWS_FIRST_PAGE = 5;
const CAMP_ROWS_PER_PAGE = 9;

function CampReport({ rows, type, filters, scopeLabel }: ShellProps & { rows: ReportCampRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      employees: acc.employees + r.employees,
      served: acc.served + r.served,
      estimated: acc.estimated + r.estimated,
      balance: acc.balance + r.balance,
      duplicates: acc.duplicates + r.duplicates,
      online: acc.online + (r.online ? 1 : 0),
      offline: acc.offline + (r.online ? 0 : 1),
      devicesOnline: acc.devicesOnline + r.devicesOnline,
      devicesTotal: acc.devicesTotal + r.devicesTotal,
    }),
    { employees: 0, served: 0, estimated: 0, balance: 0, duplicates: 0, online: 0, offline: 0, devicesOnline: 0, devicesTotal: 0 },
  );
  const coverageAvg = totals.estimated > 0 ? Math.round((totals.served / totals.estimated) * 100) : 0;

  const chunks: ReportCampRow[][] = [];
  let i = 0;
  while (i < rows.length) {
    const size = chunks.length === 0 ? CAMP_ROWS_FIRST_PAGE : CAMP_ROWS_PER_PAGE;
    chunks.push(rows.slice(i, i + size));
    i += size;
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;

  return (
    <>
      {chunks.map((chunk, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === chunks.length - 1;
        const startIdx = chunks.slice(0, idx).reduce((s, c) => s + c.length, 0);
        const endIdx = startIdx + chunk.length;
        return (
          <section key={idx} className="mo-report" style={!isFirst ? { pageBreakBefore: "always", breakBefore: "page" } : undefined}>
            {isFirst ? (
              <>
                <BrandBar type={type} filters={filters} scopeLabel={scopeLabel} />
                <TitleBand type={type} filters={filters} />

                <div className="top-cards cols-4">
                  <div className="card summary">
                    <div className="icon">🏢</div>
                    <div>
                      <div className="title">{rows.length} Active Camp{rows.length === 1 ? "" : "s"}</div>
                      <div className="desc">Across Abu Dhabi, Dubai, Sharjah, Ajman, RAK</div>
                      <div className="desc" style={{ marginTop: 6 }}>{totals.devicesOnline} of {totals.devicesTotal} scanner devices online</div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="lbl">Online %</div>
                    <div className="val">{totals.devicesTotal > 0 ? Math.round((totals.devicesOnline / totals.devicesTotal) * 100) : 0}%</div>
                    <div className="sub">{totals.devicesOnline} / {totals.devicesTotal} devices</div>
                  </div>
                  <div className="card">
                    <div className="lbl">Total Served</div>
                    <div className="val">{fmtNum(totals.served)}</div>
                    <div className="sub">{coverageAvg}% of estimated</div>
                  </div>
                  <div className="card">
                    <div className="lbl">Score</div>
                    <div className="val">{coverageAvg}%</div>
                    <div className="sub">vs estimated demand</div>
                  </div>
                </div>

                <div className="pills cols-6">
                  <Pill kind="camp-online" label="Online" value={String(totals.online)} />
                  <Pill kind="camp-offline" label="Offline" value={String(totals.offline)} />
                  <Pill kind="camp-employees" label="Employees" value={fmtNum(totals.employees)} />
                  <Pill kind="camp-served" label="Served" value={fmtNum(totals.served)} />
                  <Pill kind="camp-balance" label="Balance" value={fmtNum(totals.balance)} />
                  <Pill kind="camp-dup" label="Duplicates" value={fmtNum(totals.duplicates)} />
                </div>
              </>
            ) : (
              <ContinuationTitle type={type} range={`${startIdx + 1}–${endIdx} of ${rows.length}`} />
            )}

            <CampTable rows={chunk} showTotal={isLast} totals={totals} coverageAvg={coverageAvg} totalRowsCount={rows.length} />
            <PageFooter type={type} pageNum={idx + 1} totalPages={totalPages} />
          </section>
        );
      })}
    </>
  );
}

function CampTable({ rows, showTotal, totals, coverageAvg, totalRowsCount }: {
  rows: ReportCampRow[];
  showTotal: boolean;
  totals: { employees: number; served: number; balance: number; duplicates: number; devicesOnline: number; devicesTotal: number };
  coverageAvg: number;
  totalRowsCount: number;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 130 }}>Camp</th>
          <th>Site</th>
          <th className="right">Employees</th>
          <th className="right">Served</th>
          <th className="bar-cell">Coverage</th>
          <th className="right">Balance</th>
          <th className="center">Duplicates</th>
          <th className="center">Devices</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const fill = r.coverage >= 85 ? "" : r.coverage >= 75 ? "warn" : "crit";
          return (
            <tr key={r.code} className={r.online ? "" : "offline"}>
              <td className="camp"><div className="code">{r.code}</div><div className="name">{r.name}</div></td>
              <td>{r.site}</td>
              <td className="right num">{fmtNum(r.employees)}</td>
              <td className="right num">{fmtNum(r.served)}</td>
              <td className="bar-cell">
                <div className="num">{r.coverage}%</div>
                <div className="bar-track"><div className={`bar-fill ${fill}`} style={{ width: `${Math.min(r.coverage, 100)}%` }} /></div>
              </td>
              <td className="right num">{fmtNum(r.balance)}</td>
              <td className="center num">{fmtNum(r.duplicates)}</td>
              <td className="center">{r.devicesOnline} / {r.devicesTotal}</td>
              <td><span className={`status ${r.online ? "online" : "offline"}`}>{r.online ? "Online" : "Offline"}</span></td>
            </tr>
          );
        })}
        {rows.length === 0 && <EmptyRow span={9} />}
        {showTotal && totalRowsCount > 0 && (
          <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
            <td>TOTAL</td>
            <td>{totalRowsCount} camp{totalRowsCount === 1 ? "" : "s"}</td>
            <td className="right num">{fmtNum(totals.employees)}</td>
            <td className="right num">{fmtNum(totals.served)}</td>
            <td className="bar-cell"><div className="num">{coverageAvg}%</div></td>
            <td className="right num">{fmtNum(totals.balance)}</td>
            <td className="center num">{fmtNum(totals.duplicates)}</td>
            <td className="center">{totals.devicesOnline} / {totals.devicesTotal}</td>
            <td></td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ---------------- Wastage (paginated) ----------------

const WASTAGE_ROWS_FIRST_PAGE = 5;
const WASTAGE_ROWS_PER_PAGE = 9;

function WastageReport({ rows, type, filters, scopeLabel }: ShellProps & { rows: ReportWastageRow[] }) {
  const sorted = [...rows].sort((a, b) => a.pct - b.pct);
  const totals = sorted.reduce(
    (acc, r) => ({
      estimated: acc.estimated + r.estimated,
      served: acc.served + r.served,
      wastage: acc.wastage + r.wastage,
      healthy: acc.healthy + (r.status === "healthy" ? 1 : 0),
      watch: acc.watch + (r.status === "watch" ? 1 : 0),
      critical: acc.critical + (r.status === "critical" ? 1 : 0),
    }),
    { estimated: 0, served: 0, wastage: 0, healthy: 0, watch: 0, critical: 0 },
  );
  const totalPct = totals.estimated > 0 ? (totals.wastage / totals.estimated) * 100 : 0;

  const chunks: ReportWastageRow[][] = [];
  let i = 0;
  while (i < sorted.length) {
    const size = chunks.length === 0 ? WASTAGE_ROWS_FIRST_PAGE : WASTAGE_ROWS_PER_PAGE;
    chunks.push(sorted.slice(i, i + size));
    i += size;
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;

  return (
    <>
      {chunks.map((chunk, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === chunks.length - 1;
        const startIdx = chunks.slice(0, idx).reduce((s, c) => s + c.length, 0);
        const endIdx = startIdx + chunk.length;
        return (
          <section key={idx} className="mo-report" style={!isFirst ? { pageBreakBefore: "always", breakBefore: "page" } : undefined}>
            {isFirst ? (
              <>
                <BrandBar type={type} filters={filters} scopeLabel={scopeLabel} />
                <TitleBand type={type} filters={filters} />

                <div className="top-cards cols-5">
                  <div className="card summary wastage">
                    <div className="icon">⚠</div>
                    <div>
                      <div className="title">{totalPct.toFixed(1)}% Wastage</div>
                      <div className="desc">{fmtNum(totals.wastage)} portions discarded out of {fmtNum(totals.estimated)} estimated</div>
                      <div className="desc" style={{ marginTop: 6 }}>Target ≤ 5%</div>
                    </div>
                  </div>
                  <div className="card">
                    <div className="lbl">Estimated</div>
                    <div className="val">{fmtNum(totals.estimated)}</div>
                    <div className="sub">period total</div>
                  </div>
                  <div className="card">
                    <div className="lbl">Served</div>
                    <div className="val">{fmtNum(totals.served)}</div>
                    <div className="sub">{totals.estimated > 0 ? ((totals.served / totals.estimated) * 100).toFixed(1) : 0}% of est.</div>
                  </div>
                  <div className="card">
                    <div className="lbl">Wastage</div>
                    <div className="val neg">{fmtNum(totals.wastage)}</div>
                    <div className="sub">portions</div>
                  </div>
                  <div className="card">
                    <div className="lbl">Avg %</div>
                    <div className="val">{totalPct.toFixed(1)}%</div>
                    <div className="sub">Target ≤ 5%</div>
                  </div>
                </div>

                <div className="pills cols-4">
                  <Pill kind="w-healthy" label="Healthy (≤5%)" value={`${totals.healthy} camp${totals.healthy === 1 ? "" : "s"}`} />
                  <Pill kind="w-watch" label="Watch (5–10%)" value={`${totals.watch} camp${totals.watch === 1 ? "" : "s"}`} />
                  <Pill kind="w-crit" label="Critical (>10%)" value={`${totals.critical} camp${totals.critical === 1 ? "" : "s"}`} />
                  <Pill kind="w-target" label="Target" value="≤ 5%" />
                </div>
              </>
            ) : (
              <ContinuationTitle type={type} range={`${startIdx + 1}–${endIdx} of ${sorted.length}`} />
            )}

            <WastageTable rows={chunk} showTotal={isLast} totals={totals} totalPct={totalPct} totalRowsCount={sorted.length} />
            <PageFooter type={type} pageNum={idx + 1} totalPages={totalPages} />
          </section>
        );
      })}
    </>
  );
}

function WastageTable({ rows, showTotal, totals, totalPct, totalRowsCount }: {
  rows: ReportWastageRow[];
  showTotal: boolean;
  totals: { estimated: number; served: number; wastage: number };
  totalPct: number;
  totalRowsCount: number;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 130 }}>Camp</th>
          <th>Site</th>
          <th className="right">Estimated</th>
          <th className="right">Served</th>
          <th className="right">Wastage</th>
          <th>% Wastage</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const fill = r.status === "healthy" ? "" : r.status === "watch" ? "warn" : "crit";
          const widthPct = Math.min((r.pct / 10) * 50, 100);
          return (
            <tr key={r.code} className={r.status === "watch" ? "warn" : r.status === "critical" ? "crit" : ""}>
              <td className="camp"><div className="code">{r.code}</div><div className="name">{r.name}</div></td>
              <td>{r.site}</td>
              <td className="right num">{fmtNum(r.estimated)}</td>
              <td className="right num">{fmtNum(r.served)}</td>
              <td className="right num neg">{fmtNum(r.wastage)}</td>
              <td className="wastage-cell">
                <div className="wastage-row">
                  <div className="bar-track">
                    <div className={`bar-fill ${fill}`} style={{ width: `${widthPct}%` }} />
                    <div className="target-mark" />
                  </div>
                  <div className="wastage-pct">{r.pct.toFixed(1)}%</div>
                </div>
              </td>
              <td>
                <span className={`status ${r.status === "healthy" ? "healthy" : r.status === "watch" ? "watch" : "critical"}`}>
                  {r.status === "healthy" ? "Healthy" : r.status === "watch" ? "Watch" : "Critical"}
                </span>
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && <EmptyRow span={7} />}
        {showTotal && totalRowsCount > 0 && (
          <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
            <td>TOTAL</td>
            <td>{totalRowsCount} camp{totalRowsCount === 1 ? "" : "s"}</td>
            <td className="right num">{fmtNum(totals.estimated)}</td>
            <td className="right num">{fmtNum(totals.served)}</td>
            <td className="right num neg">{fmtNum(totals.wastage)}</td>
            <td className="wastage-cell">
              <div className="wastage-row">
                <div className="bar-track">
                  <div className="bar-fill crit" style={{ width: `${Math.min((totalPct / 10) * 50, 100)}%` }} />
                  <div className="target-mark" />
                </div>
                <div className="wastage-pct">{totalPct.toFixed(1)}%</div>
              </div>
            </td>
            <td></td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ---------------- Employee (paginated) ----------------

const EMPLOYEE_ROWS_FIRST_PAGE = 7;
const EMPLOYEE_ROWS_PER_PAGE = 10;

function EmployeeReport({ rows, type, filters, scopeLabel }: ShellProps & { rows: ReportEmployeeRow[] }) {
  const counts = rows.reduce(
    (acc, e) => {
      acc.total += 1;
      if (e.status === "Active") acc.active += 1;
      if (e.status === "Leave") acc.leave += 1;
      if (e.status === "Vacation") acc.vacation += 1;
      if (e.status === "Inactive") acc.inactive += 1;
      if (e.breakfast && e.lunch && e.dinner) acc.threeMeal += 1;
      acc.companies.add(e.company);
      return acc;
    },
    { total: 0, active: 0, leave: 0, vacation: 0, inactive: 0, threeMeal: 0, companies: new Set<string>() },
  );

  const chunks: ReportEmployeeRow[][] = [];
  let i = 0;
  while (i < rows.length) {
    const size = chunks.length === 0 ? EMPLOYEE_ROWS_FIRST_PAGE : EMPLOYEE_ROWS_PER_PAGE;
    chunks.push(rows.slice(i, i + size));
    i += size;
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;

  return (
    <>
      {chunks.map((chunk, idx) => {
        const isFirst = idx === 0;
        const startIdx = chunks.slice(0, idx).reduce((s, c) => s + c.length, 0);
        const endIdx = startIdx + chunk.length;
        return (
          <section key={idx} className="mo-report" style={!isFirst ? { pageBreakBefore: "always", breakBefore: "page" } : undefined}>
            {isFirst ? (
              <>
                <BrandBar type={type} filters={filters} scopeLabel={scopeLabel} />
                <TitleBand type={type} filters={filters} />
                <div className="pills cols-7">
                  <Pill kind="emp-total" label="Total" value={fmtNum(counts.total)} />
                  <Pill kind="emp-active" label="Active" value={fmtNum(counts.active)} />
                  <Pill kind="emp-leave" label="Leave" value={fmtNum(counts.leave)} />
                  <Pill kind="emp-vacation" label="Vacation" value={fmtNum(counts.vacation)} />
                  <Pill kind="emp-inactive" label="Inactive" value={fmtNum(counts.inactive)} />
                  <Pill kind="emp-eligible" label="3-Meal" value={fmtNum(counts.threeMeal)} />
                  <Pill kind="emp-companies" label="Companies" value={String(counts.companies.size)} />
                </div>
              </>
            ) : (
              <ContinuationTitle type={type} range={`${startIdx + 1}–${endIdx} of ${rows.length}`} />
            )}

            <EmployeeTable rows={chunk} startIndex={startIdx} />
            <PageFooter type={type} pageNum={idx + 1} totalPages={totalPages} />
          </section>
        );
      })}
    </>
  );
}

function EmployeeTable({ rows, startIndex }: { rows: ReportEmployeeRow[]; startIndex: number }) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 100 }}>Labour ID</th>
          <th>Employee</th>
          <th>Camp</th>
          <th>Company</th>
          <th>Designation</th>
          <th className="center">Breakfast</th>
          <th className="center">Lunch</th>
          <th className="center">Dinner</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => {
          const color = AVATAR_PALETTE[(startIndex + i) % AVATAR_PALETTE.length];
          return (
            <tr key={`${e.labourId}-${i}`} className={e.status === "Inactive" ? "emp-inactive-row" : ""}>
              <td><strong>{e.labourId}</strong></td>
              <td>
                <div className="emp">
                  <div className={`avatar ${color}`}>{initials(e.name)}</div>
                  <div>
                    <div className="name">{e.name}</div>
                    <div className="id">{e.designation}</div>
                  </div>
                </div>
              </td>
              <td>{e.camp}</td>
              <td>{e.company}</td>
              <td>{e.designation}</td>
              <td className={`center ${e.breakfast ? "meal-yes" : "meal-no"}`}>{e.breakfast ? "✓" : "—"}</td>
              <td className={`center ${e.lunch ? "meal-yes" : "meal-no"}`}>{e.lunch ? "✓" : "—"}</td>
              <td className={`center ${e.dinner ? "meal-yes" : "meal-no"}`}>{e.dinner ? "✓" : "—"}</td>
              <td><span className={`status emp-${e.status.toLowerCase()}`}>{e.status}</span></td>
            </tr>
          );
        })}
        {rows.length === 0 && <EmptyRow span={9} />}
      </tbody>
    </table>
  );
}

// ---------------- Scans (paginated) ----------------

const SCANS_ROWS_FIRST_PAGE = 9;
const SCANS_ROWS_PER_PAGE = 12;

function ScansReport({ rows, type, filters, scopeLabel }: ShellProps & { rows: ReportScanRow[] }) {
  const counts = rows.reduce(
    (acc, s) => {
      acc.total += 1;
      if (s.status === "Eligible") acc.eligible += 1;
      if (s.status === "Already Served") acc.served += 1;
      if (s.status === "Wrong Camp") acc.wrong += 1;
      if (s.status === "Not Eligible") acc.notEligible += 1;
      if (s.status === "Expired") acc.expired += 1;
      return acc;
    },
    { total: 0, eligible: 0, served: 0, wrong: 0, notEligible: 0, expired: 0 },
  );

  const chunks: ReportScanRow[][] = [];
  let i = 0;
  while (i < rows.length) {
    const size = chunks.length === 0 ? SCANS_ROWS_FIRST_PAGE : SCANS_ROWS_PER_PAGE;
    chunks.push(rows.slice(i, i + size));
    i += size;
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;

  return (
    <>
      {chunks.map((chunk, idx) => {
        const isFirst = idx === 0;
        const startIdx = chunks.slice(0, idx).reduce((s, c) => s + c.length, 0);
        const endIdx = startIdx + chunk.length;
        return (
          <section key={idx} className="mo-report" style={!isFirst ? { pageBreakBefore: "always", breakBefore: "page" } : undefined}>
            {isFirst ? (
              <>
                <BrandBar type={type} filters={filters} scopeLabel={scopeLabel} />
                <TitleBand type={type} filters={filters} />
                <div className="pills cols-7">
                  <Pill kind="scan-total" label="Total Scans" value={fmtNum(counts.total)} />
                  <Pill kind="scan-eligible" label="Eligible" value={fmtNum(counts.eligible)} />
                  <Pill kind="scan-served" label="Already Served" value={fmtNum(counts.served)} />
                  <Pill kind="scan-wrong" label="Wrong Camp" value={fmtNum(counts.wrong)} />
                  <Pill kind="scan-notelig" label="Not Eligible" value={fmtNum(counts.notEligible)} />
                  <Pill kind="scan-expired" label="Expired" value={fmtNum(counts.expired)} />
                  <Pill kind="scan-dup" label="Duplicates" value={fmtNum(counts.served)} />
                </div>
              </>
            ) : (
              <ContinuationTitle type={type} range={`${startIdx + 1}–${endIdx} of ${rows.length}`} />
            )}

            <ScansTable rows={chunk} />
            <PageFooter type={type} pageNum={idx + 1} totalPages={totalPages} />
          </section>
        );
      })}
    </>
  );
}

function ScansTable({ rows }: { rows: ReportScanRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 84 }}>Date</th>
          <th style={{ width: 70 }}>Time</th>
          <th style={{ width: 92 }}>Labour ID</th>
          <th>Employee</th>
          <th>Camp</th>
          <th>Device</th>
          <th>Meal</th>
          <th>Status</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => {
          const tag = s.meal === "Breakfast" ? "bf" : s.meal === "Lunch" ? "ln" : "dn";
          const rowClass =
            s.status === "Already Served"
              ? "warn"
              : s.status === "Wrong Camp"
                ? "crit"
                : s.status === "Not Eligible"
                  ? "note"
                  : "";
          const statusClass =
            s.status === "Eligible"
              ? "scan-eligible"
              : s.status === "Already Served"
                ? "scan-served"
                : s.status === "Wrong Camp"
                  ? "scan-wrong"
                  : s.status === "Not Eligible"
                    ? "scan-notelig"
                    : "scan-expired";
          return (
            <tr key={s.id} className={rowClass}>
              <td>{s.date}</td>
              <td><span className="time">{s.time}</span></td>
              <td><strong>{s.labourId}</strong></td>
              <td>{s.name}</td>
              <td>{s.camp}</td>
              <td style={{ fontSize: 10, color: "#475569" }}>{s.device ?? "—"}</td>
              <td><span className={`pill-tag ${tag}`}>{s.meal}</span></td>
              <td><span className={`status ${statusClass}`}>{s.status}</span></td>
              <td style={{ fontSize: 10, color: "#475569" }}>{s.reason ?? "—"}</td>
            </tr>
          );
        })}
        {rows.length === 0 && <EmptyRow span={9} />}
      </tbody>
    </table>
  );
}

// ---------------- Shared bits ----------------

function Pill({ kind, label, value }: { kind: string; label: string; value: string }) {
  return (
    <div className={`pill ${kind}`}>
      <span className="lbl">{label}</span>
      <span className="val">{value}</span>
    </div>
  );
}

function EmptyRow({ span }: { span: number }) {
  return (
    <tr>
      <td colSpan={span} style={{ padding: "32px 12px", textAlign: "center", color: "#94a3b8" }}>
        No records match these filters.
      </td>
    </tr>
  );
}

export const REPORT_CSS = `
.mo-report-wrap { background: #f3f4f6; padding: 16px; border-radius: 12px; }
.mo-report {
  width: 100%;
  max-width: 297mm;
  min-height: 210mm;
  margin: 0 auto;
  background: #ffffff;
  padding: 14mm 16mm 12mm 16mm;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #0f172a;
  font-size: 11px;
  line-height: 1.45;
  box-sizing: border-box;
}
.mo-report + .mo-report { margin-top: 16px; }
.mo-report *, .mo-report *::before, .mo-report *::after { box-sizing: border-box; }

.mo-report .page-cont-title {
  margin: 0 0 12px 0;
  font-size: 12px;
  letter-spacing: 3px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  padding-bottom: 10px;
  border-bottom: 1px solid #e5e7eb;
}
.mo-report .page-cont-title span {
  color: #94a3b8;
  font-weight: 400;
  letter-spacing: 1px;
  margin-left: 6px;
}

/* Branding bar */
.mo-report .brand-bar { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; }
.mo-report .brand-left { display: flex; align-items: center; gap: 12px; }
.mo-report .brand-logo {
  width: 44px; height: 44px; border-radius: 10px;
  background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
  color: #fff; font-weight: 700; font-size: 14px;
  display: grid; place-items: center; letter-spacing: .5px;
}
.mo-report .brand-name { font-size: 14px; font-weight: 700; letter-spacing: .3px; }
.mo-report .brand-sub  { font-size: 9.5px; color: #64748b; letter-spacing: 1.2px; text-transform: uppercase; }
.mo-report .brand-tag  { font-size: 9.5px; color: #64748b; letter-spacing: 1px; text-transform: uppercase; margin-top: 2px; }

.mo-report .meta { text-align: right; font-size: 10px; line-height: 1.55; }
.mo-report .meta .row span:first-child { color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; margin-right: 8px; font-size: 9px; }
.mo-report .meta .row span:last-child  { color: #0f172a; font-weight: 600; }

/* Title band */
.mo-report .title-band {
  background: #efeaff;
  border-radius: 6px;
  padding: 16px 18px;
  margin-top: 4px;
  text-align: center;
}
.mo-report .title-band h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 4px;
  font-weight: 600;
  color: #0f172a;
}
.mo-report .title-band .subtitle {
  margin-top: 4px;
  font-size: 10.5px;
  color: #475569;
}
.mo-report .title-band .subtitle .dot { color: #94a3b8; margin: 0 6px; }

/* KPI pills */
.mo-report .pills { display: grid; gap: 8px; margin-top: 14px; }
.mo-report .pills.cols-7 { grid-template-columns: repeat(7, 1fr); }
.mo-report .pills.cols-6 { grid-template-columns: repeat(6, 1fr); }
.mo-report .pills.cols-4 { grid-template-columns: repeat(4, 1fr); }
.mo-report .pill {
  border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px;
  display: flex; align-items: center; justify-content: space-between;
}
.mo-report .pill .lbl { font-size: 9.5px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
.mo-report .pill .val { font-size: 15px; font-weight: 600; color: #0f172a; }

/* Pill color variants */
.mo-report .pill.served    .lbl, .mo-report .pill.served    .val { color: #047857; }
.mo-report .pill.estimated .lbl, .mo-report .pill.estimated .val { color: #1d4ed8; }
.mo-report .pill.breakfast .lbl, .mo-report .pill.breakfast .val { color: #b45309; }
.mo-report .pill.lunch     .lbl, .mo-report .pill.lunch     .val { color: #b91c1c; }
.mo-report .pill.dinner    .lbl, .mo-report .pill.dinner    .val { color: #6d28d9; }
.mo-report .pill.variance  .lbl, .mo-report .pill.variance  .val { color: #c2410c; }
.mo-report .pill.wastage   .lbl, .mo-report .pill.wastage   .val { color: #475569; }

.mo-report .pill.emp-total    .lbl, .mo-report .pill.emp-total    .val { color: #334155; }
.mo-report .pill.emp-active   .lbl, .mo-report .pill.emp-active   .val { color: #047857; }
.mo-report .pill.emp-leave    .lbl, .mo-report .pill.emp-leave    .val { color: #b45309; }
.mo-report .pill.emp-vacation .lbl, .mo-report .pill.emp-vacation .val { color: #1d4ed8; }
.mo-report .pill.emp-inactive .lbl, .mo-report .pill.emp-inactive .val { color: #b91c1c; }
.mo-report .pill.emp-eligible .lbl, .mo-report .pill.emp-eligible .val { color: #6d28d9; }
.mo-report .pill.emp-companies .lbl, .mo-report .pill.emp-companies .val { color: #c2410c; }

.mo-report .pill.scan-total    .lbl, .mo-report .pill.scan-total    .val { color: #334155; }
.mo-report .pill.scan-eligible .lbl, .mo-report .pill.scan-eligible .val { color: #047857; }
.mo-report .pill.scan-served   .lbl, .mo-report .pill.scan-served   .val { color: #c2410c; }
.mo-report .pill.scan-wrong    .lbl, .mo-report .pill.scan-wrong    .val { color: #b91c1c; }
.mo-report .pill.scan-notelig  .lbl, .mo-report .pill.scan-notelig  .val { color: #b45309; }
.mo-report .pill.scan-expired  .lbl, .mo-report .pill.scan-expired  .val { color: #6d28d9; }
.mo-report .pill.scan-dup      .lbl, .mo-report .pill.scan-dup      .val { color: #1d4ed8; }

.mo-report .pill.camp-online    .lbl, .mo-report .pill.camp-online    .val { color: #047857; }
.mo-report .pill.camp-offline   .lbl, .mo-report .pill.camp-offline   .val { color: #b91c1c; }
.mo-report .pill.camp-employees .lbl, .mo-report .pill.camp-employees .val { color: #1d4ed8; }
.mo-report .pill.camp-served    .lbl, .mo-report .pill.camp-served    .val { color: #c2410c; }
.mo-report .pill.camp-balance   .lbl, .mo-report .pill.camp-balance   .val { color: #b45309; }
.mo-report .pill.camp-dup       .lbl, .mo-report .pill.camp-dup       .val { color: #6d28d9; }

.mo-report .pill.w-healthy .lbl, .mo-report .pill.w-healthy .val { color: #047857; }
.mo-report .pill.w-watch   .lbl, .mo-report .pill.w-watch   .val { color: #b45309; }
.mo-report .pill.w-crit    .lbl, .mo-report .pill.w-crit    .val { color: #b91c1c; }
.mo-report .pill.w-target  .lbl, .mo-report .pill.w-target  .val { color: #1d4ed8; }

/* Top cards */
.mo-report .top-cards { display: grid; gap: 10px; margin-top: 14px; }
.mo-report .top-cards.cols-4 { grid-template-columns: 2fr 1fr 1fr 1fr; }
.mo-report .top-cards.cols-5 { grid-template-columns: 1.6fr 1fr 1fr 1fr 1fr; }
.mo-report .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; }
.mo-report .card .lbl { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #64748b; }
.mo-report .card .val { font-size: 19px; font-weight: 700; margin-top: 4px; color: #0f172a; }
.mo-report .card .val.neg { color: #dc2626; }
.mo-report .card .sub { font-size: 9.5px; color: #94a3b8; margin-top: 2px; }
.mo-report .card.summary { display: flex; gap: 14px; align-items: center; }
.mo-report .card.summary .icon {
  width: 50px; height: 50px; border-radius: 12px;
  background: #eef2ff; color: #4338ca;
  display: grid; place-items: center; font-size: 22px; font-weight: 700;
}
.mo-report .card.summary .title { font-size: 13px; font-weight: 700; }
.mo-report .card.summary .desc  { font-size: 10px; color: #64748b; margin-top: 2px; }
.mo-report .card.summary.wastage { background: #fff7ed; border-color: #fed7aa; }
.mo-report .card.summary.wastage .icon { background: #ffedd5; color: #9a3412; }
.mo-report .card.summary.wastage .title { color: #9a3412; }
.mo-report .card.summary.wastage .desc { color: #c2410c; }

/* Table */
.mo-report table { width: 100%; margin-top: 14px; border-collapse: collapse; font-size: 11.5px; }
.mo-report thead th {
  text-align: left; text-transform: uppercase;
  font-size: 10px; letter-spacing: 1px; color: #475569; font-weight: 600;
  padding: 12px 12px; border-bottom: 1px solid #e5e7eb; background: #fafbfc;
}
.mo-report thead th.right, .mo-report tbody td.right { text-align: right; }
.mo-report thead th.center, .mo-report tbody td.center { text-align: center; }
.mo-report tbody td { padding: 11px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.mo-report tbody tr:hover { background: #fafbfc; }
.mo-report tbody tr.warn { background: #fffaf3; }
.mo-report tbody tr.crit { background: #fff1f2; }
.mo-report tbody tr.note { background: #fffbeb; }
.mo-report tbody tr.offline { background: #fef7f7; }
.mo-report tbody tr.emp-inactive-row { background: #fef7f7; }

.mo-report td .main { font-weight: 600; color: #0f172a; }
.mo-report td .sub  { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: .8px; margin-top: 2px; }
.mo-report .num { font-variant-numeric: tabular-nums; }
.mo-report .pos { color: #059669; font-weight: 600; }
.mo-report .neg { color: #dc2626; font-weight: 600; }
.mo-report .neu { color: #64748b; }

.mo-report .camp .code { font-weight: 700; }
.mo-report .camp .name { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: .8px; margin-top: 2px; }

/* Employee avatars */
.mo-report .emp { display: flex; align-items: center; gap: 10px; }
.mo-report .avatar {
  width: 28px; height: 28px; border-radius: 50%;
  font-size: 9.5px; font-weight: 700; letter-spacing: .5px;
  display: grid; place-items: center; flex-shrink: 0;
  background: #e0e7ff; color: #4338ca;
}
.mo-report .avatar.green  { background: #d1fae5; color: #065f46; }
.mo-report .avatar.amber  { background: #fef3c7; color: #92400e; }
.mo-report .avatar.violet { background: #ede9fe; color: #5b21b6; }
.mo-report .avatar.rose   { background: #ffe4e6; color: #9f1239; }
.mo-report .avatar.cyan   { background: #cffafe; color: #155e75; }
.mo-report .avatar.slate  { background: #e2e8f0; color: #334155; }
.mo-report .emp .name { font-weight: 600; }
.mo-report .emp .id   { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: .8px; margin-top: 1px; }

.mo-report .meal-yes { color: #059669; font-weight: 700; font-size: 13px; }
.mo-report .meal-no  { color: #cbd5e1; font-size: 13px; }

/* Scan meal tags */
.mo-report .time { font-variant-numeric: tabular-nums; font-weight: 600; color: #0f172a; }
.mo-report .pill-tag {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 9px; letter-spacing: .8px; text-transform: uppercase; font-weight: 600;
}
.mo-report .pill-tag.bf { background: #fffbeb; color: #b45309; }
.mo-report .pill-tag.ln { background: #fef2f2; color: #b91c1c; }
.mo-report .pill-tag.dn { background: #f5f3ff; color: #6d28d9; }

/* Status badges */
.mo-report .status {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  font-size: 9px; letter-spacing: 1px; text-transform: uppercase; font-weight: 600;
}
.mo-report .status.ok       { color: #059669; background: #ecfdf5; }
.mo-report .status.warn     { color: #c2410c; background: #fff7ed; }
.mo-report .status.crit     { color: #b91c1c; background: #fef2f2; }
.mo-report .status.online   { color: #059669; background: #ecfdf5; }
.mo-report .status.offline  { color: #b91c1c; background: #fef2f2; }
.mo-report .status.healthy  { color: #059669; background: #ecfdf5; }
.mo-report .status.watch    { color: #b45309; background: #fffbeb; }
.mo-report .status.critical { color: #b91c1c; background: #fef2f2; }
.mo-report .status.emp-active   { color: #059669; background: #ecfdf5; }
.mo-report .status.emp-leave    { color: #b45309; background: #fffbeb; }
.mo-report .status.emp-vacation { color: #1d4ed8; background: #eff6ff; }
.mo-report .status.emp-inactive { color: #b91c1c; background: #fef2f2; }
.mo-report .status.scan-eligible { color: #059669; background: #ecfdf5; }
.mo-report .status.scan-served   { color: #c2410c; background: #fff7ed; }
.mo-report .status.scan-wrong    { color: #b91c1c; background: #fef2f2; }
.mo-report .status.scan-notelig  { color: #b45309; background: #fffbeb; }
.mo-report .status.scan-expired  { color: #6d28d9; background: #f5f3ff; }

/* Coverage / wastage bars */
.mo-report .bar-cell { min-width: 110px; }
.mo-report .bar-track {
  height: 6px; border-radius: 999px; background: #e5e7eb; overflow: hidden;
  margin-top: 4px; position: relative; flex: 1;
}
.mo-report .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #10b981 0%, #0d9488 100%); }
.mo-report .bar-fill.warn { background: linear-gradient(90deg, #f59e0b 0%, #ea580c 100%); }
.mo-report .bar-fill.crit { background: linear-gradient(90deg, #ef4444 0%, #b91c1c 100%); }

.mo-report .wastage-cell { min-width: 200px; }
.mo-report .wastage-row { display: flex; align-items: center; gap: 10px; }
.mo-report .wastage-row .bar-track { height: 8px; margin-top: 0; }
.mo-report .wastage-pct { font-weight: 700; font-variant-numeric: tabular-nums; width: 48px; text-align: right; }
.mo-report .target-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #1d4ed8; left: 50%; }

/* Footer — pinned to the bottom of each page section via the flex column's
   auto top margin. The .mo-report sets display:flex; flex-direction:column +
   min-height: 210mm so the footer ends up at the bottom of the A4 page. */
.mo-report .footer {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid #cbd5e1;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #475569;
  font-weight: 500;
}
.mo-report .footer .legend span { margin-right: 14px; }
.mo-report .footer .legend .ok       { color: #059669; }
.mo-report .footer .legend .warn     { color: #c2410c; }
.mo-report .footer .legend .crit     { color: #b91c1c; }
.mo-report .footer .legend .target   { color: #1d4ed8; }
.mo-report .footer .legend .watch    { color: #b45309; }
.mo-report .footer .legend .scan-served { color: #c2410c; }
.mo-report .footer .legend .emp-active   { color: #059669; }
.mo-report .footer .legend .emp-leave    { color: #b45309; }
.mo-report .footer .legend .emp-vacation { color: #1d4ed8; }
.mo-report .footer .legend .emp-inactive { color: #b91c1c; }

/* Print */
@media print {
  body { background: #fff !important; }
  .mo-report-wrap { background: #fff; padding: 0; }
  .mo-report { box-shadow: none; page-break-after: always; break-after: page; }
  .mo-report:last-child { page-break-after: auto; break-after: auto; }
  .mo-report + .mo-report { margin-top: 0; }
}
`;
