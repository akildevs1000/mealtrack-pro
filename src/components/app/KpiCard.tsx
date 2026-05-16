import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  value: string | number;
  delta?: string;
  icon: LucideIcon;
  tone?: "primary" | "accent" | "warm" | "muted";
  hint?: string;
  progress?: number;
};

const accentMap = {
  primary: { chip: "bg-primary/10 text-primary", bar: "bg-primary" },
  accent: { chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  warm: { chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
  muted: { chip: "bg-secondary text-foreground", bar: "bg-muted-foreground" },
};

export function KpiCard({ label, value, delta, icon: Icon, tone = "muted", hint, progress }: Props) {
  const a = accentMap[tone];
  return (
    <div className="group relative overflow-hidden rounded-xl bg-card border border-border p-5 transition-all hover:border-primary/30 hover:shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-bold">{label}</div>
          <div className="mt-2.5 font-display text-[28px] leading-none font-bold tracking-tight tabular-nums">{value}</div>
          {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`shrink-0 size-9 rounded-lg grid place-items-center ${a.chip}`}>
          <Icon className="size-4" />
        </div>
      </div>
      {typeof progress === "number" && (
        <div className="mt-4 h-1 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full ${a.bar}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {delta && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {delta}
        </div>
      )}
    </div>
  );
}
