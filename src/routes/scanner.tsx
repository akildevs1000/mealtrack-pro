import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, ScanLine, Coffee, Soup, Moon, Wifi, WifiOff, Volume2 } from "lucide-react";
import { recentScans } from "@/lib/mock-data";

export const Route = createFileRoute("/scanner")({
  component: Scanner,
  head: () => ({ meta: [{ title: "QR Scanner — MyMeals" }] }),
});

type Result = "idle" | "eligible" | "served" | "ineligible";

function Scanner() {
  const [meal, setMeal] = useState<"Breakfast" | "Lunch" | "Dinner">("Lunch");
  const [result, setResult] = useState<Result>("idle");
  const [online, setOnline] = useState(true);

  const simulate = (r: Result) => {
    setResult(r);
    setTimeout(() => setResult("idle"), 2200);
  };

  const meals = [
    { id: "Breakfast", icon: Coffee, time: "5:00 – 8:00 AM" },
    { id: "Lunch", icon: Soup, time: "11:00 – 2:00 PM" },
    { id: "Dinner", icon: Moon, time: "6:00 – 9:00 PM" },
  ] as const;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Canteen Scanner</h1>
            <p className="text-sm text-muted-foreground">Al Reem Camp · Manager: Ahmed K.</p>
          </div>
          <button
            onClick={() => setOnline((o) => !o)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-2 ${online ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
          >
            {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
            {online ? "Online" : "Offline · 12 queued"}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {meals.map((m) => {
            const active = meal === m.id;
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMeal(m.id)}
                className={`p-4 rounded-2xl border text-left transition-all ${active ? "border-transparent gradient-primary text-primary-foreground shadow-elegant" : "bg-card border-border hover:border-primary/40"}`}
              >
                <Icon className="size-5" />
                <div className="font-display font-semibold mt-2">{m.id}</div>
                <div className={`text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{m.time}</div>
              </button>
            );
          })}
        </div>

        <div className="relative rounded-3xl bg-card border border-border shadow-card overflow-hidden p-8">
          <div className="aspect-square max-w-md mx-auto rounded-3xl border-2 border-dashed border-primary/40 grid place-items-center relative overflow-hidden bg-gradient-to-br from-primary/5 to-accent/5">
            {result === "idle" && (
              <>
                <div className="absolute inset-x-0 h-0.5 gradient-primary shadow-glow animate-[scan_2s_ease-in-out_infinite] top-1/3" />
                <div className="text-center">
                  <ScanLine className="size-16 text-primary mx-auto" />
                  <div className="font-display font-semibold mt-4">Point camera at QR</div>
                  <div className="text-xs text-muted-foreground mt-1">Scanning for {meal.toLowerCase()}…</div>
                </div>
              </>
            )}
            {result === "eligible" && (
              <ResultPanel tone="success" icon={CheckCircle2} title="Serve Meal" subtitle="Mohammed Rafiq · LB-22481" detail="Eligible for Lunch · Camp AD-01" />
            )}
            {result === "served" && (
              <ResultPanel tone="warning" icon={AlertTriangle} title="Already Served" subtitle="Anwar Hussain · LB-31108" detail="Lunch served at 12:18 PM" />
            )}
            {result === "ineligible" && (
              <ResultPanel tone="danger" icon={XCircle} title="Not Eligible" subtitle="Iqbal Khan · LB-55981" detail="Wrong camp · Assigned to AJM-03" />
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            <button onClick={() => simulate("eligible")} className="px-4 py-2 rounded-lg bg-success text-primary-foreground text-sm font-medium">Simulate Eligible</button>
            <button onClick={() => simulate("served")} className="px-4 py-2 rounded-lg bg-warning text-foreground text-sm font-medium">Simulate Already Served</button>
            <button onClick={() => simulate("ineligible")} className="px-4 py-2 rounded-lg bg-destructive text-primary-foreground text-sm font-medium">Simulate Rejected</button>
          </div>
        </div>

        <style>{`@keyframes scan { 0% { top: 18%; opacity: 0.3 } 50% { top: 78%; opacity: 1 } 100% { top: 18%; opacity: 0.3 } }`}</style>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl bg-card border border-border shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-display font-semibold">Session</div>
              <div className="text-xs text-muted-foreground">{meal} · today</div>
            </div>
            <button className="size-8 rounded-lg bg-secondary grid place-items-center"><Volume2 className="size-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Served" value="843" tone="success" />
            <Stat label="Estimated" value="1,240" />
            <Stat label="Balance" value="397" />
            <Stat label="Duplicates" value="6" tone="warning" />
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border shadow-card p-5">
          <div className="font-display font-semibold mb-3">Recent scans</div>
          <div className="space-y-2 max-h-96 overflow-auto">
            {recentScans.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary text-sm">
                <span className={`size-2 rounded-full ${s.status === "Eligible" ? "bg-success" : s.status === "Already Served" ? "bg-warning" : "bg-destructive"}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.time} · {s.labourId}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  const cls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="p-3 rounded-xl bg-secondary/60">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl font-bold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function ResultPanel({ tone, icon: Icon, title, subtitle, detail }: { tone: "success" | "warning" | "danger"; icon: typeof CheckCircle2; title: string; subtitle: string; detail: string }) {
  const bg = tone === "success" ? "bg-success/15 text-success" : tone === "warning" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive";
  return (
    <div className={`absolute inset-0 grid place-items-center ${bg}`}>
      <div className="text-center">
        <Icon className="size-20 mx-auto" />
        <div className="font-display text-2xl font-bold mt-3">{title}</div>
        <div className="text-sm font-medium mt-1">{subtitle}</div>
        <div className="text-xs opacity-80 mt-1">{detail}</div>
      </div>
    </div>
  );
}