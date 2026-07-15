import { useMemo, useState } from "react";
import { ChefHat, X, ArrowLeft, Coffee, UtensilsCrossed, Moon } from "lucide-react";
import { useManagers, useManagerScanReport, type CateringCompany, type Manager } from "@/lib/hooks";

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Zoho-style drill-down: click a catering company → see every distributor
 * linked to it → click a distributor → see which camp/site they served and
 * how many breakfast/lunch/dinner meals, over a date range.
 */
export function CateringCompanyDetailDialog({
  company,
  onClose,
}: {
  company: CateringCompany;
  onClose: () => void;
}) {
  const { data: allManagers = [] } = useManagers();
  const distributors = useMemo(
    () => allManagers.filter((m) => m.cateringCompanyId === company.id),
    [allManagers, company.id],
  );
  const [selected, setSelected] = useState<Manager | null>(null);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3 min-w-0">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="size-8 grid place-items-center rounded-lg hover:bg-secondary shrink-0"
                title="Back to distributors"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground shrink-0">
              <ChefHat className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{selected ? selected.name : company.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {selected
                  ? `Distributor · ${company.name}`
                  : `${distributors.length} distributor${distributors.length === 1 ? "" : "s"}`}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-secondary shrink-0">
            <X className="size-4" />
          </button>
        </div>

        {!selected ? (
          <DistributorList company={company} distributors={distributors} onSelect={setSelected} />
        ) : (
          <DistributorMealReport manager={selected} />
        )}
      </div>
    </div>
  );
}

function DistributorList({
  company,
  distributors,
  onSelect,
}: {
  company: CateringCompany;
  distributors: Manager[];
  onSelect: (m: Manager) => void;
}) {
  return (
    <div>
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-border bg-secondary/20 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Type</div>
          <div className="font-medium">{company.customerType}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="font-medium">{company.status}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Email</div>
          <div className="font-medium truncate">{company.email || "—"}</div>
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Phone</div>
          <div className="font-medium truncate">{company.phone || "—"}</div>
        </div>
      </div>

      {distributors.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          No distributors linked to this catering company yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-6 py-3 font-medium">Distributor</th>
                <th className="px-4 py-3 font-medium">Camp</th>
                <th className="px-4 py-3 font-medium">Role / Shift</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {distributors.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => onSelect(m)}
                  className="border-t border-border hover:bg-secondary/30 cursor-pointer"
                  title="View meal-serving report"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full gradient-accent grid place-items-center text-primary-foreground font-semibold text-xs shrink-0">
                        {m.avatar}
                      </div>
                      <div className="font-medium">{m.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.camp}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.role === "Camp Manager" ? "Distributor" : m.role} · {m.shift}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${
                        m.status === "Active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DistributorMealReport({ manager }: { manager: Manager }) {
  const [from, setFrom] = useState(() => isoDaysAgo(13));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const { data, isLoading } = useManagerScanReport(manager.id, from, to);
  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { breakfast: 0, lunch: 0, dinner: 0 };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end flex-wrap gap-3 justify-between">
        <div>
          <div className="font-semibold">Meal Serving Report</div>
          <div className="text-xs text-muted-foreground">Which camp/site this distributor served, and how many meals.</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground flex items-center gap-1.5">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted-foreground flex items-center gap-1.5">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SumCard icon={<Coffee className="size-4" />} label="Breakfast" value={totals.breakfast} color="warning" />
        <SumCard icon={<UtensilsCrossed className="size-4" />} label="Lunch" value={totals.lunch} color="success" />
        <SumCard icon={<Moon className="size-4" />} label="Dinner" value={totals.dinner} color="accent" />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs text-muted-foreground sticky top-0">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Camp / Site</th>
                <th className="px-4 py-2 font-medium text-center">Breakfast</th>
                <th className="px-4 py-2 font-medium text-center">Lunch</th>
                <th className="px-4 py-2 font-medium text-center">Dinner</th>
                <th className="px-4 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No meals served in this range.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.date}-${r.campCode}`} className="border-t border-border">
                    <td className="px-4 py-2 tabular-nums">{r.date}</td>
                    <td className="px-4 py-2">
                      {r.campName} <span className="text-xs text-muted-foreground">({r.campCode})</span>
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums">{r.breakfast || "—"}</td>
                    <td className="px-4 py-2 text-center tabular-nums">{r.lunch || "—"}</td>
                    <td className="px-4 py-2 text-center tabular-nums">{r.dinner || "—"}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {r.breakfast + r.lunch + r.dinner}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SumCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode; label: string; value: number; color: "primary" | "success" | "warning" | "accent";
}) {
  const map = {
    primary: "from-primary/10 text-primary",
    success: "from-success/10 text-success",
    warning: "from-warning/10 text-warning",
    accent: "from-accent/20 text-accent-foreground",
  } as const;
  return (
    <div className={`rounded-xl border border-border p-4 bg-gradient-to-br ${map[color]} to-transparent`}>
      <div className="flex items-center gap-2 text-xs">{icon}<span>{label}</span></div>
      <div className="text-2xl font-bold mt-1 tabular-nums text-foreground">{value}</div>
    </div>
  );
}
