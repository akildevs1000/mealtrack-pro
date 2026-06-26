import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  useCamps,
  useCompanies,
  useProjects,
  useManagers,
  useCreateFoodEstimation,
  useFoodEstimations,
  type Camp,
} from "@/lib/hooks";
import { KpiCard } from "@/components/app/KpiCard";
import {
  Coffee,
  Sun,
  Moon,
  TrendingUp,
  Utensils,
  Building2,
  CalendarRange,
  CalendarDays,
  RotateCcw,
  Save,
  ClipboardList,
  CheckCircle2,
  Plus,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCampScope } from "@/lib/session";

export const Route = createFileRoute("/forecast")({
  component: Forecast,
  head: () => ({ meta: [{ title: "Forecast — MyMeals" }] }),
});

type Mode = "weekday" | "range";
type Row = {
  key: string;
  label: string;
  sub?: string;
  breakfast: number;
  lunch: number;
  dinner: number;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoAddDays(iso: string, n: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
function dayOfWeek(iso: string) {
  const idx = (new Date(iso).getDay() + 6) % 7; // Mon=0
  return WEEKDAYS[idx];
}

function defaultsFor(
  camp: Camp,
): Record<string, { breakfast: number; lunch: number; dinner: number }> {
  // Per-weekday baseline scaled to this camp's labour count
  const base = camp.employees;
  return Object.fromEntries(
    WEEKDAYS.map((d, i) => {
      const isFri = d === "Fri",
        isSun = d === "Sun";
      const factor = isFri ? 0.85 : isSun ? 0.78 : 1;
      return [
        d,
        {
          breakfast: Math.round(base * 0.86 * factor + Math.sin(i) * 30),
          lunch: Math.round(base * 0.97 * factor + Math.cos(i) * 30),
          dinner: Math.round(base * 0.92 * factor + Math.sin(i + 1) * 30),
        },
      ];
    }),
  );
}

function Forecast() {
  const scope = useCampScope();
  const { data: campsData } = useCamps();
  const { data: companiesData } = useCompanies();
  const companies = useMemo(() => companiesData ?? [], [companiesData]);
  const camps = useMemo(() => campsData ?? [], [campsData]);
  // Parent-company filter — camps are siblings, so picking a company narrows the
  // camp selector to that company's camps.
  const [company, setCompany] = useState<string>("all");
  const visibleCamps = useMemo(() => {
    let cs = scope ? camps.filter((c) => scope.includes(c.code)) : camps;
    if (company !== "all") cs = cs.filter((c) => c.companyCode === company);
    return cs;
  }, [scope, camps, company]);
  const [selectedCamp, setSelectedCamp] = useState<string>("");
  useEffect(() => {
    if (visibleCamps.length && !visibleCamps.some((c) => c.code === selectedCamp)) {
      setSelectedCamp(visibleCamps[0].code);
    }
  }, [visibleCamps, selectedCamp]);
  const camp = visibleCamps.find((c) => c.code === selectedCamp) ?? visibleCamps[0] ?? null;

  const [mode, setMode] = useState<Mode>("weekday");
  const [from, setFrom] = useState<string>(isoToday());
  const [to, setTo] = useState<string>(isoAddDays(isoToday(), 6));

  // Persistent overrides per camp
  type CampStore = {
    weekday: Record<string, { breakfast: number; lunch: number; dinner: number }>;
    dates: Record<string, { breakfast: number; lunch: number; dinner: number }>;
  };
  const [store, setStore] = useState<Record<string, CampStore>>({});

  // Seed baseline defaults for each real camp the first time it appears.
  useEffect(() => {
    setStore((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const c of camps) {
        if (!next[c.code]) {
          next[c.code] = { weekday: defaultsFor(c), dates: {} };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [camps]);

  const campStore: CampStore = useMemo(
    () =>
      camp
        ? (store[camp.code] ?? { weekday: defaultsFor(camp), dates: {} })
        : { weekday: {}, dates: {} },
    [camp, store],
  );

  const rows: Row[] = useMemo(() => {
    if (mode === "weekday") {
      return WEEKDAYS.map((d) => ({
        key: d,
        label: d,
        sub: "Weekly template",
        ...campStore.weekday[d],
      }));
    }
    const list: Row[] = [];
    if (!from || !to) return list;
    const start = new Date(from),
      end = new Date(to);
    if (start > end) return list;
    const cur = new Date(start);
    let safety = 0;
    while (cur <= end && safety++ < 366) {
      const iso = cur.toISOString().slice(0, 10);
      const wd = dayOfWeek(iso);
      const override = campStore.dates[iso];
      const base = campStore.weekday[wd];
      list.push({
        key: iso,
        label: fmtDate(iso),
        sub: wd,
        breakfast: override?.breakfast ?? base.breakfast,
        lunch: override?.lunch ?? base.lunch,
        dinner: override?.dinner ?? base.dinner,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [mode, campStore, from, to]);

  if (!camp) {
    return <div className="p-8 text-sm text-muted-foreground">Loading camps…</div>;
  }

  function updateRow(key: string, meal: "breakfast" | "lunch" | "dinner", value: number) {
    const v = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    setStore((prev) => {
      const cur = prev[camp.code] ?? { weekday: defaultsFor(camp), dates: {} };
      if (mode === "weekday") {
        return {
          ...prev,
          [camp.code]: {
            ...cur,
            weekday: { ...cur.weekday, [key]: { ...cur.weekday[key], [meal]: v } },
          },
        };
      }
      const wd = dayOfWeek(key);
      const baseRow = cur.dates[key] ?? cur.weekday[wd];
      return {
        ...prev,
        [camp.code]: { ...cur, dates: { ...cur.dates, [key]: { ...baseRow, [meal]: v } } },
      };
    });
  }

  function resetAll() {
    setStore((prev) => ({ ...prev, [camp.code]: { weekday: defaultsFor(camp), dates: {} } }));
  }

  function applyTemplateToRange() {
    if (mode !== "range") return;
    setStore((prev) => {
      const cur = prev[camp.code] ?? { weekday: defaultsFor(camp), dates: {} };
      return { ...prev, [camp.code]: { ...cur, dates: {} } };
    });
  }

  const totals = rows.reduce(
    (a, r) => ({ b: a.b + r.breakfast, l: a.l + r.lunch, dn: a.dn + r.dinner }),
    { b: 0, l: 0, dn: 0 },
  );
  const grand = totals.b + totals.l + totals.dn;
  const dailyAvg = rows.length ? Math.round(grand / rows.length) : 0;
  const peak = rows.length
    ? rows.reduce((p, r) =>
        r.breakfast + r.lunch + r.dinner > p.breakfast + p.lunch + p.dinner ? r : p,
      )
    : null;

  const chartData = rows.map((r) => ({
    day: r.label,
    breakfast: r.breakfast,
    lunch: r.lunch,
    dinner: r.dinner,
  }));

  return (
    <div className="space-y-6">
      <FoodEstimationEntry />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Planning & Procurement
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight mt-1">
            Editable Meal Forecast
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {camp.name} · {camp.code} · {camp.employees.toLocaleString()} employees
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="px-3 py-2 rounded-lg bg-card border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All companies</option>
            {companies.map((co) => (
              <option key={co.id} value={co.code}>
                {co.code} — {co.name}
              </option>
            ))}
          </select>
          <select
            value={selectedCamp}
            onChange={(e) => setSelectedCamp(e.target.value)}
            className="px-3 py-2 rounded-lg bg-card border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {visibleCamps.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={resetAll}
            title="Reset this camp to defaults"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Mode + range controls */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1">
          <ModeBtn
            active={mode === "weekday"}
            onClick={() => setMode("weekday")}
            icon={<CalendarDays className="size-3.5" />}
            label="Weekday template"
          />
          <ModeBtn
            active={mode === "range"}
            onClick={() => setMode("range")}
            icon={<CalendarRange className="size-3.5" />}
            label="Date range"
          />
        </div>
        {mode === "range" && (
          <>
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
            <button
              onClick={applyTemplateToRange}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"
            >
              <Save className="size-3.5" /> Apply weekday template
            </button>
            <span className="text-xs text-muted-foreground">{rows.length} day(s)</span>
          </>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={mode === "weekday" ? "Weekly demand" : "Range demand"}
          value={grand.toLocaleString()}
          icon={Utensils}
          tone="primary"
          hint={camp.code}
        />
        <KpiCard
          label="Daily average"
          value={dailyAvg.toLocaleString()}
          icon={TrendingUp}
          tone="accent"
          hint="Meals per day"
        />
        <KpiCard
          label="Peak day"
          value={peak?.label ?? "—"}
          icon={Sun}
          tone="warm"
          hint={peak ? `${(peak.breakfast + peak.lunch + peak.dinner).toLocaleString()} meals` : ""}
        />
        <KpiCard
          label="Employees"
          value={camp.employees.toLocaleString()}
          icon={Building2}
          tone="muted"
          hint={camp.site}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MealTotalCard label="Breakfast" value={totals.b} icon={Coffee} color="var(--chart-3)" />
        <MealTotalCard label="Lunch" value={totals.l} icon={Sun} color="var(--chart-1)" />
        <MealTotalCard label="Dinner" value={totals.dn} icon={Moon} color="var(--chart-2)" />
      </div>

      {/* Trend chart */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-4">
          <h2 className="font-display text-lg font-semibold">Demand trend — {camp.code}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mode === "weekday" ? "Weekly template" : `${fmtDate(from)} → ${fmtDate(to)}`}
          </p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="fd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="breakfast"
                stroke="var(--chart-3)"
                fill="url(#fb)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="lunch"
                stroke="var(--chart-1)"
                fill="url(#fl)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="dinner"
                stroke="var(--chart-2)"
                fill="url(#fd)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Saved food estimation entries */}
      <FoodEstimationList companyCode={company === "all" ? undefined : company} />
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {icon} {label}
    </button>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-md bg-secondary text-sm text-foreground border border-transparent focus:border-ring focus:outline-none"
      />
    </label>
  );
}

function NumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <td className="px-2 py-1.5 text-right">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
        className="w-24 px-2 py-1.5 text-right tabular-nums rounded-md bg-secondary/60 border border-transparent hover:border-border focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30 text-sm"
      />
    </td>
  );
}

function MealTotalCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        <div
          className="size-9 rounded-xl grid place-items-center"
          style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">Forecast total</div>
    </div>
  );
}

// ─── Food Estimation Entry ───────────────────────────────────────────────
// A trigger bar with a "New Food Estimation" button that opens a modal dialog
// styled like the Add New Camp dialog. Company is the parent; Supplier /
// Project / Camp are siblings filtered by the selected company.
function FoodEstimationEntry() {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl gradient-primary grid place-items-center text-primary-foreground shadow-glow">
          <ClipboardList className="size-5" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">Food Estimation</h2>
          <p className="text-xs text-muted-foreground">
            Record estimated meal headcounts for a company, supplier, project &amp; camp.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {justSaved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 className="size-4" /> Saved
          </span>
        )}
        <div className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="font-medium">{todayLabel}</span>
        </div>
        <button
          onClick={() => { setOpen(true); setJustSaved(false); }}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95"
        >
          <Plus className="size-4" /> New Food Estimation
        </button>
      </div>
      {open && (
        <FoodEstimationDialog
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); setJustSaved(true); }}
        />
      )}
    </div>
  );
}

function FoodEstimationDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: companies = [] } = useCompanies();
  const { data: projects = [] } = useProjects();
  const { data: camps = [] } = useCamps();
  const { data: suppliers = [] } = useManagers();
  const create = useCreateFoodEstimation();

  const [companyCode, setCompanyCode] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [projectCode, setProjectCode] = useState<string>("");
  const [campCode, setCampCode] = useState<string>("");
  const [meals, setMeals] = useState({ breakfast: 0, lunch: 0, dinner: 0 });

  const now = new Date();
  const todayLabel = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  // Siblings filtered by the selected parent company.
  const companySuppliers = useMemo(
    () => (companyCode ? suppliers.filter((s) => s.companyCode === companyCode) : []),
    [suppliers, companyCode],
  );
  const companyProjects = useMemo(
    () => (companyCode ? projects.filter((p) => p.companyCode === companyCode) : []),
    [projects, companyCode],
  );
  const companyCamps = useMemo(
    () => (companyCode ? camps.filter((c) => c.companyCode === companyCode) : []),
    [camps, companyCode],
  );

  function onCompanyChange(code: string) {
    setCompanyCode(code);
    // Reset siblings — they depend on the company.
    setSupplierId("");
    setProjectCode("");
    setCampCode("");
  }

  function setMeal(key: "breakfast" | "lunch" | "dinner", value: number) {
    setMeals((m) => ({ ...m, [key]: Math.max(0, Math.round(Number.isFinite(value) ? value : 0)) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyCode) return;
    await create.mutateAsync({
      date: now.toISOString(),
      companyCode,
      supplierId: supplierId || null,
      projectCode: projectCode || null,
      campCode: campCode || null,
      breakfast: meals.breakfast,
      lunch: meals.lunch,
      dinner: meals.dinner,
    });
    onSaved();
  }

  const selectCls =
    "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50 disabled:cursor-not-allowed";
  const numCls =
    "w-32 px-3 py-2 rounded-lg bg-secondary text-sm text-right tabular-nums border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-50";

  const mealRows = [
    { key: "breakfast" as const, label: "Breakfast", icon: <Coffee className="size-4" /> },
    { key: "lunch" as const, label: "Lunch", icon: <Sun className="size-4" /> },
    { key: "dinner" as const, label: "Dinner", icon: <Moon className="size-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-elegant max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <ClipboardList className="size-4" />
            </div>
            <div>
              <div className="font-semibold">New Food Estimation</div>
              <div className="text-xs text-muted-foreground">Estimate meal headcounts · {todayLabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Company *">
              <select value={companyCode} onChange={(e) => onCompanyChange(e.target.value)} className={selectCls}>
                <option value="">— Select Company —</option>
                {companies.map((co) => (
                  <option key={co.id} value={co.code}>{co.code} — {co.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Supplier">
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!companyCode} className={selectCls}>
                <option value="">{companyCode ? "— Select Supplier —" : "Select a company first"}</option>
                {companySuppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Project (filtered by company)">
                <select value={projectCode} onChange={(e) => setProjectCode(e.target.value)} disabled={!companyCode} className={selectCls}>
                  <option value="">{companyCode ? "— Select Project —" : "Select a company first"}</option>
                  {companyProjects.map((p) => (
                    <option key={p.id} value={p.code}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Camp Location (filtered by company)">
                <select value={campCode} onChange={(e) => setCampCode(e.target.value)} disabled={!companyCode} className={selectCls}>
                  <option value="">{companyCode ? "— Select Camp —" : "Select a company first"}</option>
                  {companyCamps.map((c) => (
                    <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] bg-secondary/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Meal Option</div>
              <div>Estimated Headcount</div>
            </div>
            {mealRows.map((m) => (
              <div key={m.key} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 border-t border-border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-muted-foreground">{m.icon}</span> {m.label}
                </div>
                <input
                  type="number"
                  min={0}
                  value={meals[m.key]}
                  onChange={(e) => setMeal(m.key, Number(e.target.value))}
                  disabled={!companyCode}
                  className={numCls}
                />
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 border-t border-border bg-secondary/30">
              <div className="text-sm font-semibold">Total</div>
              <div className="w-32 text-right pr-3 text-sm font-bold tabular-nums">
                {(meals.breakfast + meals.lunch + meals.dinner).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!companyCode || create.isPending}
              className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="size-4" /> {create.isPending ? "Saving…" : "Create Estimation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

// Paginated list of saved food-estimation entries. Resolves the stored codes
// (company / supplier / project / camp) to display names.
function FoodEstimationList({ companyCode }: { companyCode?: string }) {
  const { data: rows = [] } = useFoodEstimations(companyCode ? { companyCode } : undefined);
  const { data: companies = [] } = useCompanies();
  const { data: projects = [] } = useProjects();
  const { data: camps = [] } = useCamps();
  const { data: suppliers = [] } = useManagers();
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pageCount - 1);
  const slice = rows.slice(cur * pageSize, cur * pageSize + pageSize);

  const companyName = (code: string) => companies.find((c) => c.code === code)?.name ?? code;
  const projectName = (code: string | null) =>
    code ? (projects.find((p) => p.code === code)?.name ?? code) : "—";
  const campName = (code: string | null) =>
    code ? (camps.find((c) => c.code === code)?.name ?? code) : "—";
  const supplierName = (id: string | null) =>
    id ? (suppliers.find((s) => s.id === id)?.name ?? "—") : "—";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="font-display text-lg font-semibold">Food Estimation Entries</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Saved meal-headcount estimations{companyCode ? ` for ${companyName(companyCode)}` : ""}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Company</th>
              <th className="text-left px-4 py-3 font-medium">Supplier</th>
              <th className="text-left px-4 py-3 font-medium">Project</th>
              <th className="text-left px-4 py-3 font-medium">Camp</th>
              <th className="text-right px-4 py-3 font-medium">Breakfast</th>
              <th className="text-right px-4 py-3 font-medium">Lunch</th>
              <th className="text-right px-4 py-3 font-medium">Dinner</th>
              <th className="text-right px-6 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((r) => {
              const total = r.breakfast + r.lunch + r.dinner;
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-6 py-2.5 whitespace-nowrap">
                    {new Date(r.date).toLocaleDateString(undefined, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-2.5">{companyName(r.companyCode)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{supplierName(r.supplierId)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{projectName(r.projectCode)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{campName(r.campCode)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.breakfast.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.lunch.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.dinner.toLocaleString()}</td>
                  <td className="px-6 py-2.5 text-right tabular-nums font-semibold">{total.toLocaleString()}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-muted-foreground">
                  No food estimations recorded yet. Use “New Food Estimation” above to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-border text-xs text-muted-foreground">
          <span>
            Showing {cur * pageSize + 1}–{Math.min((cur + 1) * pageSize, rows.length)} of {rows.length}
          </span>
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => setPage(cur - 1)}
              disabled={cur === 0}
              className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="font-medium text-foreground">
              Page {cur + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage(cur + 1)}
              disabled={cur >= pageCount - 1}
              className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
