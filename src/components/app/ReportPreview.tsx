import { useMemo } from "react";
import { camps as allCamps, employees, recentScans, type Camp, type Employee, type Scan } from "@/lib/mock-data";

export type ReportType = "consumption" | "employee" | "scans" | "camp" | "wastage";
export type MealFilter = "All" | "Breakfast" | "Lunch" | "Dinner";

export type ReportFilters = {
  from: string;
  to: string;
  camp: string;
  meal: MealFilter;
  status: string;
  query: string;
};

type Props = {
  type: ReportType;
  filters: ReportFilters;
  scopeCodes: string[] | null;
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

function applyCampScope<T extends { camp?: string; code?: string }>(rows: T[], scopeCodes: string[] | null, key: "camp" | "code"): T[] {
  if (!scopeCodes) return rows;
  return rows.filter((r) => scopeCodes.includes((r as Record<string, string>)[key]));
}

export function ReportPreview({ type, filters, scopeCodes }: Props) {
  const meta = REPORT_META[type];
  const scopeLabel = scopeCodes
    ? scopeCodes.length === 1
      ? scopeCodes[0]
      : `${scopeCodes.length} camps`
    : filters.camp !== "all"
      ? filters.camp
      : "All Camps";

  return (
    <div className="mo-report-wrap">
      <style>{REPORT_CSS}</style>
      <section className="mo-report">
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

        <div className="title-band">
          <h1>{meta.title}</h1>
          <div className="subtitle">
            {fmtDate(filters.to)} <span className="dot">•</span> {fmtDayName(filters.to)} <span className="dot">•</span> {meta.subtitle}
          </div>
        </div>

        {type === "consumption" && <ConsumptionBody filters={filters} scopeCodes={scopeCodes} />}
        {type === "employee" && <EmployeeBody filters={filters} scopeCodes={scopeCodes} />}
        {type === "scans" && <ScansBody filters={filters} scopeCodes={scopeCodes} />}
        {type === "camp" && <CampBody filters={filters} scopeCodes={scopeCodes} />}
        {type === "wastage" && <WastageBody filters={filters} scopeCodes={scopeCodes} />}

        <footer className="footer">
          <div className="legend">{meta.legend}</div>
          <div>Powered by <strong style={{ color: "#0f172a" }}>MealOps</strong></div>
          <div>{filters.from} → {filters.to}</div>
        </footer>
      </section>
    </div>
  );
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

// ---------------- Consumption ----------------
function ConsumptionBody({ filters, scopeCodes }: { filters: ReportFilters; scopeCodes: string[] | null }) {
  const rows = useMemo(() => {
    let list: Camp[] = scopeCodes ? allCamps.filter((c) => scopeCodes.includes(c.code)) : allCamps;
    if (filters.camp !== "all") list = list.filter((c) => c.code === filters.camp);
    return list.map((c) => {
      const breakfast = Math.round(c.employees * 0.85);
      const lunch = c.employees;
      const dinner = Math.round(c.employees * 0.92);
      const served = breakfast + lunch + dinner;
      const estimated = Math.round(c.employees * 2.9);
      const variance = served - estimated;
      const wastagePct = ((estimated - served) / estimated) * 100;
      const status: "ok" | "warn" | "crit" =
        wastagePct <= 5 ? "ok" : wastagePct <= 10 ? "warn" : "crit";
      return { camp: c, breakfast, lunch, dinner, served, estimated, variance, status };
    });
  }, [filters.camp, scopeCodes]);

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

  return (
    <>
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
          {rows.map((r) => (
            <tr key={r.camp.id} className={r.status === "warn" ? "warn" : r.status === "crit" ? "crit" : ""}>
              <td><div className="main">{r.camp.code}</div><div className="sub">{r.camp.name}</div></td>
              <td>{r.camp.site}</td>
              <td className="right num">{fmtNum(r.breakfast)}</td>
              <td className="right num">{fmtNum(r.lunch)}</td>
              <td className="right num">{fmtNum(r.dinner)}</td>
              <td className="right num"><strong>{fmtNum(r.served)}</strong></td>
              <td className="right num">{fmtNum(r.estimated)}</td>
              <td className={`right num ${r.variance < 0 ? "neg" : r.variance > 0 ? "pos" : "neu"}`}>
                {r.variance < 0 ? "−" : r.variance > 0 ? "+" : ""}{fmtNum(Math.abs(r.variance))}
              </td>
              <td>
                <span className={`status ${r.status === "ok" ? "ok" : r.status === "warn" ? "warn" : "crit"}`}>
                  {r.status === "ok" ? "Healthy" : r.status === "warn" ? "Watch" : "Critical"}
                </span>
              </td>
            </tr>
          ))}
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
              <td className="right num neg">−{fmtNum(Math.abs(totals.variance))}</td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

// ---------------- Employee ----------------
function EmployeeBody({ filters, scopeCodes }: { filters: ReportFilters; scopeCodes: string[] | null }) {
  const list = useMemo<Employee[]>(() => {
    const q = filters.query.toLowerCase();
    let rows = applyCampScope(employees, scopeCodes, "camp");
    if (filters.camp !== "all") rows = rows.filter((e) => e.camp === filters.camp);
    if (filters.status !== "all") rows = rows.filter((e) => e.status === filters.status);
    if (q) rows = rows.filter((e) => e.name.toLowerCase().includes(q) || e.labourId.toLowerCase().includes(q));
    return rows;
  }, [filters.camp, filters.status, filters.query, scopeCodes]);

  const counts = list.reduce(
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

  return (
    <>
      <div className="pills cols-7">
        <Pill kind="emp-total" label="Total" value={fmtNum(counts.total)} />
        <Pill kind="emp-active" label="Active" value={fmtNum(counts.active)} />
        <Pill kind="emp-leave" label="Leave" value={fmtNum(counts.leave)} />
        <Pill kind="emp-vacation" label="Vacation" value={fmtNum(counts.vacation)} />
        <Pill kind="emp-inactive" label="Inactive" value={fmtNum(counts.inactive)} />
        <Pill kind="emp-eligible" label="3-Meal" value={fmtNum(counts.threeMeal)} />
        <Pill kind="emp-companies" label="Companies" value={String(counts.companies.size)} />
      </div>

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
          {list.map((e, i) => {
            const color = AVATAR_PALETTE[i % AVATAR_PALETTE.length];
            return (
              <tr key={e.id} className={e.status === "Inactive" ? "emp-inactive-row" : ""}>
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
                <td>
                  <span className={`status emp-${e.status.toLowerCase()}`}>{e.status}</span>
                </td>
              </tr>
            );
          })}
          {list.length === 0 && <EmptyRow span={9} />}
        </tbody>
      </table>
    </>
  );
}

// ---------------- Scans ----------------
function ScansBody({ filters, scopeCodes }: { filters: ReportFilters; scopeCodes: string[] | null }) {
  const list = useMemo<Scan[]>(() => {
    const q = filters.query.toLowerCase();
    let rows = applyCampScope(recentScans, scopeCodes, "camp");
    if (filters.camp !== "all") rows = rows.filter((s) => s.camp === filters.camp);
    if (filters.meal !== "All") rows = rows.filter((s) => s.meal === filters.meal);
    if (filters.status !== "all") rows = rows.filter((s) => s.status === filters.status);
    if (q) rows = rows.filter((s) => s.name.toLowerCase().includes(q) || s.labourId.toLowerCase().includes(q));
    return rows;
  }, [filters.camp, filters.meal, filters.status, filters.query, scopeCodes]);

  const campsMap = useMemo(() => Object.fromEntries(allCamps.map((c) => [c.code, c.name])), []);

  const counts = list.reduce(
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

  return (
    <>
      <div className="pills cols-7">
        <Pill kind="scan-total" label="Total Scans" value={fmtNum(counts.total)} />
        <Pill kind="scan-eligible" label="Eligible" value={fmtNum(counts.eligible)} />
        <Pill kind="scan-served" label="Already Served" value={fmtNum(counts.served)} />
        <Pill kind="scan-wrong" label="Wrong Camp" value={fmtNum(counts.wrong)} />
        <Pill kind="scan-notelig" label="Not Eligible" value={fmtNum(counts.notEligible)} />
        <Pill kind="scan-expired" label="Expired" value={fmtNum(counts.expired)} />
        <Pill kind="scan-dup" label="Duplicates" value="—" />
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 90 }}>Time</th>
            <th style={{ width: 100 }}>Labour ID</th>
            <th>Employee</th>
            <th>Camp</th>
            <th>Meal</th>
            <th>Device / Operator</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
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
                <td><span className="time">{s.time}</span></td>
                <td><strong>{s.labourId}</strong></td>
                <td>{s.name}</td>
                <td>{s.camp}{campsMap[s.camp] ? ` — ${campsMap[s.camp]}` : ""}</td>
                <td><span className={`pill-tag ${tag}`}>{s.meal}</span></td>
                <td>Scanner-{s.camp}<div className="device">Operator</div></td>
                <td><span className={`status ${statusClass}`}>{s.status}</span></td>
              </tr>
            );
          })}
          {list.length === 0 && <EmptyRow span={7} />}
        </tbody>
      </table>
    </>
  );
}

// ---------------- Camp Performance ----------------
function CampBody({ filters, scopeCodes }: { filters: ReportFilters; scopeCodes: string[] | null }) {
  const rows = useMemo(() => {
    let list: Camp[] = scopeCodes ? allCamps.filter((c) => scopeCodes.includes(c.code)) : allCamps;
    if (filters.camp !== "all") list = list.filter((c) => c.code === filters.camp);
    return list.map((c) => {
      const served = Math.round(c.employees * 2.5);
      const estimated = Math.round(c.employees * 2.9);
      const coverage = Math.round((served / estimated) * 100);
      const balance = Math.round(c.employees * 0.4);
      const duplicates = c.employees % 11;
      return { c, served, estimated, coverage, balance, duplicates };
    });
  }, [filters.camp, scopeCodes]);

  const totals = rows.reduce(
    (acc, r) => ({
      employees: acc.employees + r.c.employees,
      served: acc.served + r.served,
      estimated: acc.estimated + r.estimated,
      balance: acc.balance + r.balance,
      duplicates: acc.duplicates + r.duplicates,
      online: acc.online + (r.c.online ? 1 : 0),
      offline: acc.offline + (r.c.online ? 0 : 1),
    }),
    { employees: 0, served: 0, estimated: 0, balance: 0, duplicates: 0, online: 0, offline: 0 },
  );
  const coverageAvg = totals.estimated > 0 ? Math.round((totals.served / totals.estimated) * 100) : 0;

  return (
    <>
      <div className="top-cards cols-4">
        <div className="card summary">
          <div className="icon">🏢</div>
          <div>
            <div className="title">{rows.length} Active Camp{rows.length === 1 ? "" : "s"}</div>
            <div className="desc">Across Abu Dhabi, Dubai, Sharjah, Ajman, RAK</div>
            <div className="desc" style={{ marginTop: 6 }}>{totals.online} of {rows.length} camps online</div>
          </div>
        </div>
        <div className="card">
          <div className="lbl">Online %</div>
          <div className="val">{rows.length > 0 ? Math.round((totals.online / rows.length) * 100) : 0}%</div>
          <div className="sub">{totals.online} / {rows.length} camps</div>
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
        <Pill kind="camp-dup" label="Duplicates" value={String(totals.duplicates)} />
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 130 }}>Camp</th>
            <th>Site</th>
            <th className="right">Employees</th>
            <th className="right">Served Today</th>
            <th className="bar-cell">Coverage</th>
            <th className="right">Balance</th>
            <th className="center">Duplicates</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const fill = r.coverage >= 85 ? "" : r.coverage >= 75 ? "warn" : "crit";
            return (
              <tr key={r.c.id} className={r.c.online ? "" : "offline"}>
                <td className="camp"><div className="code">{r.c.code}</div><div className="name">{r.c.name}</div></td>
                <td>{r.c.site}</td>
                <td className="right num">{fmtNum(r.c.employees)}</td>
                <td className="right num">{fmtNum(r.served)}</td>
                <td className="bar-cell">
                  <div className="num">{r.coverage}%</div>
                  <div className="bar-track"><div className={`bar-fill ${fill}`} style={{ width: `${Math.min(r.coverage, 100)}%` }} /></div>
                </td>
                <td className="right num">{fmtNum(r.balance)}</td>
                <td className="center num">{r.duplicates}</td>
                <td><span className={`status ${r.c.online ? "online" : "offline"}`}>{r.c.online ? "Online" : "Offline"}</span></td>
              </tr>
            );
          })}
          {rows.length === 0 && <EmptyRow span={8} />}
          {rows.length > 0 && (
            <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
              <td>TOTAL</td>
              <td>{rows.length} camp{rows.length === 1 ? "" : "s"}</td>
              <td className="right num">{fmtNum(totals.employees)}</td>
              <td className="right num">{fmtNum(totals.served)}</td>
              <td className="bar-cell"><div className="num">{coverageAvg}%</div></td>
              <td className="right num">{fmtNum(totals.balance)}</td>
              <td className="center num">{totals.duplicates}</td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

// ---------------- Wastage ----------------
function WastageBody({ filters, scopeCodes }: { filters: ReportFilters; scopeCodes: string[] | null }) {
  const rows = useMemo(() => {
    let list: Camp[] = scopeCodes ? allCamps.filter((c) => scopeCodes.includes(c.code)) : allCamps;
    if (filters.camp !== "all") list = list.filter((c) => c.code === filters.camp);
    return list.map((c) => {
      const estimated = Math.round(c.employees * 2.9 * 7); // 7-day window
      const served = Math.round(c.employees * 2.5 * 7);
      const wastage = estimated - served;
      const pct = (wastage / estimated) * 100;
      const status: "healthy" | "watch" | "critical" =
        pct <= 5 ? "healthy" : pct <= 10 ? "watch" : "critical";
      return { c, estimated, served, wastage, pct, status };
    }).sort((a, b) => a.pct - b.pct);
  }, [filters.camp, scopeCodes]);

  const totals = rows.reduce(
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

  return (
    <>
      <div className="top-cards cols-5">
        <div className="card summary wastage">
          <div className="icon">⚠</div>
          <div>
            <div className="title">{totalPct.toFixed(1)}% Weekly Wastage</div>
            <div className="desc">{fmtNum(totals.wastage)} portions discarded out of {fmtNum(totals.estimated)} estimated</div>
            <div className="desc" style={{ marginTop: 6 }}>7-day window · target ≤ 5%</div>
          </div>
        </div>
        <div className="card">
          <div className="lbl">Estimated</div>
          <div className="val">{fmtNum(totals.estimated)}</div>
          <div className="sub">7-day total</div>
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
            const widthPct = Math.min((r.pct / 10) * 50, 100); // 5% target → 50% bar
            return (
              <tr key={r.c.id} className={r.status === "watch" ? "warn" : r.status === "critical" ? "crit" : ""}>
                <td className="camp"><div className="code">{r.c.code}</div><div className="name">{r.c.name}</div></td>
                <td>{r.c.site}</td>
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
          {rows.length > 0 && (
            <tr style={{ background: "#f8fafc", fontWeight: 600 }}>
              <td>TOTAL</td>
              <td>{rows.length} camp{rows.length === 1 ? "" : "s"}</td>
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
    </>
  );
}

// ---------------- Shared ----------------
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
.mo-report *, .mo-report *::before, .mo-report *::after { box-sizing: border-box; }

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

/* Consumption pill colors */
.mo-report .pill.served    .lbl, .mo-report .pill.served    .val { color: #047857; }
.mo-report .pill.estimated .lbl, .mo-report .pill.estimated .val { color: #1d4ed8; }
.mo-report .pill.breakfast .lbl, .mo-report .pill.breakfast .val { color: #b45309; }
.mo-report .pill.lunch     .lbl, .mo-report .pill.lunch     .val { color: #b91c1c; }
.mo-report .pill.dinner    .lbl, .mo-report .pill.dinner    .val { color: #6d28d9; }
.mo-report .pill.variance  .lbl, .mo-report .pill.variance  .val { color: #c2410c; }
.mo-report .pill.wastage   .lbl, .mo-report .pill.wastage   .val { color: #475569; }

/* Employee pill colors */
.mo-report .pill.emp-total    .lbl, .mo-report .pill.emp-total    .val { color: #334155; }
.mo-report .pill.emp-active   .lbl, .mo-report .pill.emp-active   .val { color: #047857; }
.mo-report .pill.emp-leave    .lbl, .mo-report .pill.emp-leave    .val { color: #b45309; }
.mo-report .pill.emp-vacation .lbl, .mo-report .pill.emp-vacation .val { color: #1d4ed8; }
.mo-report .pill.emp-inactive .lbl, .mo-report .pill.emp-inactive .val { color: #b91c1c; }
.mo-report .pill.emp-eligible .lbl, .mo-report .pill.emp-eligible .val { color: #6d28d9; }
.mo-report .pill.emp-companies .lbl, .mo-report .pill.emp-companies .val { color: #c2410c; }

/* Scan pill colors */
.mo-report .pill.scan-total    .lbl, .mo-report .pill.scan-total    .val { color: #334155; }
.mo-report .pill.scan-eligible .lbl, .mo-report .pill.scan-eligible .val { color: #047857; }
.mo-report .pill.scan-served   .lbl, .mo-report .pill.scan-served   .val { color: #c2410c; }
.mo-report .pill.scan-wrong    .lbl, .mo-report .pill.scan-wrong    .val { color: #b91c1c; }
.mo-report .pill.scan-notelig  .lbl, .mo-report .pill.scan-notelig  .val { color: #b45309; }
.mo-report .pill.scan-expired  .lbl, .mo-report .pill.scan-expired  .val { color: #6d28d9; }
.mo-report .pill.scan-dup      .lbl, .mo-report .pill.scan-dup      .val { color: #1d4ed8; }

/* Camp pill colors */
.mo-report .pill.camp-online    .lbl, .mo-report .pill.camp-online    .val { color: #047857; }
.mo-report .pill.camp-offline   .lbl, .mo-report .pill.camp-offline   .val { color: #b91c1c; }
.mo-report .pill.camp-employees .lbl, .mo-report .pill.camp-employees .val { color: #1d4ed8; }
.mo-report .pill.camp-served    .lbl, .mo-report .pill.camp-served    .val { color: #c2410c; }
.mo-report .pill.camp-balance   .lbl, .mo-report .pill.camp-balance   .val { color: #b45309; }
.mo-report .pill.camp-dup       .lbl, .mo-report .pill.camp-dup       .val { color: #6d28d9; }

/* Wastage pill colors */
.mo-report .pill.w-healthy .lbl, .mo-report .pill.w-healthy .val { color: #047857; }
.mo-report .pill.w-watch   .lbl, .mo-report .pill.w-watch   .val { color: #b45309; }
.mo-report .pill.w-crit    .lbl, .mo-report .pill.w-crit    .val { color: #b91c1c; }
.mo-report .pill.w-target  .lbl, .mo-report .pill.w-target  .val { color: #1d4ed8; }

/* Top cards (camp + wastage) */
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
  padding: 12px 10px; border-bottom: 1px solid #e5e7eb; background: #fafbfc;
}
.mo-report thead th.right, .mo-report tbody td.right { text-align: right; }
.mo-report thead th.center, .mo-report tbody td.center { text-align: center; }
.mo-report tbody td { padding: 11px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
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
.mo-report .device { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: .8px; margin-top: 2px; }

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

/* Footer */
.mo-report .footer {
  margin-top: 18px; padding-top: 14px; border-top: 1px solid #cbd5e1;
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
  .mo-report { box-shadow: none; }
}
`;
