import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Search, Users, Building2, BadgeCheck, BadgeAlert, Briefcase, Calendar,
  IdCard, Coffee, UtensilsCrossed, Moon, Check, X,
  Upload, AlertTriangle, Loader2, Printer, User as UserIcon,
  LayoutGrid, List, Eye,
} from "lucide-react";
import * as XLSX from "xlsx";
import { QRCodeSVG } from "qrcode.react";
import { useCampScope, useSession } from "@/lib/session";
import {
  useEmployees, useEmployeeMeals, useImportEmployees,
  type CmsEmployee, type MealRecord, type EmployeeImportRow,
} from "@/lib/hooks";

export const Route = createFileRoute("/employees")({
  component: EmployeesPage,
  head: () => ({ meta: [{ title: "Employees — MyMeals" }] }),
});

function EmployeesPage() {
  const scope = useCampScope();
  const { can } = useSession();
  const canImport = can("employees", "edit");
  const { data: employees = [] } = useEmployees();
  const importMutation = useImportEmployees();
  // Backend already applies camp scope based on the auth context; this is
  // a defensive belt-and-braces in case the response includes anything wider.
  const scopedEmployees = useMemo(
    () => (scope ? employees.filter((e) => scope.includes(e.campCode)) : employees),
    [employees, scope],
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "InActive" | "leave">("all");
  const [campFilter, setCampFilter] = useState<string>("all");
  const [view, setView] = useState<"card" | "list">("list");
  const [selected, setSelected] = useState<CmsEmployee | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importState, setImportState] = useState<
    | null
    | { kind: "parsing" }
    | { kind: "error"; message: string }
    | { kind: "ready"; rows: EmployeeImportRow[]; fileName: string; warnings: string[] }
    | { kind: "done"; deleted: number; inserted: number }
  >(null);
  async function onFilePicked(file: File | null) {
    if (!file) return;
    setImportState({ kind: "parsing" });
    try {
      const buf = await file.arrayBuffer();
      const { rows, warnings } = parseEmployeeWorkbook(buf);
      if (rows.length === 0) {
        setImportState({ kind: "error", message: "No employee rows found in this file." });
        return;
      }
      setImportState({ kind: "ready", rows, fileName: file.name, warnings });
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Failed to parse file";
      setImportState({ kind: "error", message: m });
    }
  }

  async function confirmImport() {
    if (importState?.kind !== "ready") return;
    try {
      const result = await importMutation.mutateAsync(importState.rows);
      setImportState({ kind: "done", deleted: result.deleted, inserted: result.inserted });
      setSelected(null);
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Import failed";
      setImportState({ kind: "error", message: m });
    }
  }

  const camps = useMemo(
    () => Array.from(new Set(scopedEmployees.map((e) => e.campCode))).sort(),
    [scopedEmployees],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return scopedEmployees.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (campFilter !== "all" && e.campCode !== campFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.laborCode.toLowerCase().includes(q) ||
        String(e.laborId).includes(q) ||
        e.designation.toLowerCase().includes(q) ||
        e.campName.toLowerCase().includes(q)
      );
    });
  }, [query, statusFilter, campFilter, scopedEmployees]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse the CMS labour roster. Select an employee to view profile and date-wise meal report.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <Stat label="Total" value={scopedEmployees.length} tone="primary" />
            <Stat label="Active" value={scopedEmployees.filter((e) => e.status === "Active").length} tone="success" />
            <Stat label="Inactive" value={scopedEmployees.filter((e) => e.status === "InActive").length} tone="muted" />
            <Stat label="On Leave" value={scopedEmployees.filter((e) => e.status === "leave").length} tone="warning" />
          </div>
          {canImport && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  void onFilePicked(e.target.files?.[0] ?? null);
                  e.target.value = ""; // allow re-selecting the same file
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-3.5 py-2 text-sm font-semibold shadow-glow hover:opacity-95"
              >
                <Upload className="size-4" /> Import Excel
              </button>
            </>
          )}
        </div>
      </div>

      {importState && (
        <ImportDialog
          state={importState}
          submitting={importMutation.isPending}
          onConfirm={confirmImport}
          onClose={() => setImportState(null)}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, labour code, designation…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)}
          className="px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none">
          <option value="all">All statuses</option>
          <option value="Active">Active</option>
          <option value="InActive">Inactive</option>
          <option value="leave">On Leave</option>
        </select>
        <select value={campFilter} onChange={(e) => setCampFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none">
          <option value="all">All camps</option>
          {camps.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setView("card")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${view === "card" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="size-3.5" /> Card
          </button>
          <button
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="size-3.5" /> List
          </button>
        </div>
      </div>

      {view === "card" ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-secondary/40">
            <div className="text-sm font-semibold">Employee Roster</div>
            <div className="text-xs text-muted-foreground">{filtered.length} of {scopedEmployees.length}</div>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">No employees match.</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
              {filtered.map((e) => (
                <button
                  key={e.laborId}
                  onClick={() => setSelected(e)}
                  className="text-left rounded-2xl bg-card border border-border p-4 hover:border-primary/40 hover:shadow-elegant transition group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="size-11 rounded-xl gradient-primary text-primary-foreground grid place-items-center text-sm font-semibold shadow-elegant shrink-0">
                      {initials(e.name)}
                    </div>
                    <StatusPill status={e.status} />
                  </div>
                  <div className="mt-3 min-w-0">
                    <div className="font-display text-sm font-semibold truncate" title={e.name}>{e.name}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{e.laborCode}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Briefcase className="size-3 shrink-0" />
                    <span className="truncate" title={e.designation}>{e.designation || "—"}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <Building2 className="size-3 shrink-0" />
                    <span className="truncate" title={`${e.campCode} — ${e.campName.trim()}`}>
                      {e.campCode} — {e.campName.trim()}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border/60">
                    <MealsEligibilityPill emp={e} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-secondary/40">
            <div className="text-sm font-semibold">Employee Roster</div>
            <div className="text-xs text-muted-foreground">{filtered.length} of {scopedEmployees.length}</div>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">No employees match.</div>
          ) : (
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs text-muted-foreground sticky top-0 z-10">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 font-medium">Employee</th>
                    <th className="px-4 py-2.5 font-medium">Labour Code</th>
                    <th className="px-4 py-2.5 font-medium">Designation</th>
                    <th className="px-4 py-2.5 font-medium">Camp</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-center">Meals</th>
                    <th className="px-4 py-2.5 font-medium">Duration</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const active = selected?.laborId === e.laborId;
                    return (
                      <tr
                        key={e.laborId}
                        onClick={() => setSelected(e)}
                        className={`border-t border-border cursor-pointer transition ${active ? "bg-primary/5" : "hover:bg-secondary/30"}`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="size-9 rounded-full gradient-primary text-primary-foreground grid place-items-center text-xs font-semibold shrink-0">
                              {initials(e.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium truncate" title={e.name}>{e.name}</div>
                              <div className="text-xs text-muted-foreground tabular-nums">#{e.laborId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{e.laborCode}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{e.designation || "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Building2 className="size-3.5 shrink-0" />
                            <span className="truncate" title={`${e.campCode} — ${e.campName.trim()}`}>
                              {e.campCode} — {e.campName.trim()}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5"><StatusPill status={e.status} /></td>
                        <td className="px-4 py-2.5 text-center"><MealsFlag value={e.mealsEligibility} /></td>
                        <td className="px-4 py-2.5 text-xs tabular-nums whitespace-nowrap">
                          <DurationCell doj={e.doj} effectiveDate={e.effectiveDate} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}
                            className="inline-flex items-center justify-center size-8 rounded-lg border border-border bg-secondary/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition"
                            title="View profile"
                            aria-label="View profile"
                          >
                            <Eye className="size-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selected && <ProfileDialog emp={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function ProfileDialog({ emp, onClose }: { emp: CmsEmployee; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl bg-card border border-border rounded-2xl shadow-elegant overflow-hidden my-4 relative"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 size-8 grid place-items-center rounded-md bg-secondary/60 hover:bg-secondary text-muted-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        <Profile emp={emp} />
      </div>
    </div>
  );
}

function Profile({ emp }: { emp: CmsEmployee }) {
  const [from, setFrom] = useState(() => isoDaysAgo(13));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [printing, setPrinting] = useState(false);

  const { data } = useEmployeeMeals(emp.laborId, from, to);
  const records: MealRecord[] = data?.records ?? [];
  const sum = useMemo(() => summarize(records), [records]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-5 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
        <div className="flex items-start gap-4">
          <div className="size-14 rounded-2xl gradient-primary text-primary-foreground grid place-items-center text-base font-semibold shadow-glow">
            {initials(emp.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-lg font-bold">{emp.name}</h2>
              <StatusPill status={emp.status} />
              <MealsEligibilityPill emp={emp} />
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">{emp.designation} · {emp.company}</div>
          </div>
          <button
            onClick={() => setPrinting(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary/60 hover:bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground transition shrink-0"
            title="Print access card"
          >
            <Printer className="size-3.5" />
            Print card
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Info icon={<IdCard className="size-3.5" />} label="Labour Code" value={emp.laborCode} />
          <Info icon={<IdCard className="size-3.5" />} label="Labour ID" value={String(emp.laborId)} />
          <Info icon={<Building2 className="size-3.5" />} label="Camp" value={`${emp.campCode}`} sub={emp.campName.trim()} />
          <Info icon={<Briefcase className="size-3.5" />} label="Designation" value={emp.designation} />
          <Info icon={<Calendar className="size-3.5" />} label="Date of Joining" value={fmtDate(emp.doj)} />
          <Info icon={<Calendar className="size-3.5" />} label="Expiry Date" value={emp.effectiveDate ? fmtDate(emp.effectiveDate) : "—"} />
          <Info icon={<Users className="size-3.5" />} label="Status" value={emp.status} />
        </div>
      </div>

      {/* Meal report */}
      <div className="p-5 space-y-4">
        <div className="flex items-end flex-wrap gap-3 justify-between">
          <div>
            <div className="font-semibold">Meal Report</div>
            <div className="text-xs text-muted-foreground">Date-wise breakfast, lunch and dinner attendance.</div>
          </div>
          <div className="flex items-center gap-2">
            <DateInput label="From" value={from} onChange={setFrom} />
            <DateInput label="To" value={to} onChange={setTo} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SumCard color="primary" icon={<UtensilsCrossed className="size-4" />} label="Total Served" value={`${sum.served}/${sum.possible}`} sub={`${sum.rate}% attendance`} />
          <SumCard color="warning" icon={<Coffee className="size-4" />} label="Breakfast" value={`${sum.breakfast}/${sum.total}`} />
          <SumCard color="success" icon={<UtensilsCrossed className="size-4" />} label="Lunch" value={`${sum.lunch}/${sum.total}`} />
          <SumCard color="accent" icon={<Moon className="size-4" />} label="Dinner" value={`${sum.dinner}/${sum.total}`} />
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground sticky top-0">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Day</th>
                  <th className="px-4 py-2 font-medium text-center">Breakfast</th>
                  <th className="px-4 py-2 font-medium text-center">Lunch</th>
                  <th className="px-4 py-2 font-medium text-center">Dinner</th>
                  <th className="px-4 py-2 font-medium text-right">Meals</th>
                </tr>
              </thead>
              <tbody>
                {records.slice().reverse().map((r) => {
                  const count = (r.breakfast.taken ? 1 : 0) + (r.lunch.taken ? 1 : 0) + (r.dinner.taken ? 1 : 0);
                  return (
                    <tr key={r.date} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-2 tabular-nums">{fmtDate(r.date)}</td>
                      <td className="px-4 py-2 text-muted-foreground">{dayName(r.date)}</td>
                      <td className="px-4 py-2"><MealCell taken={r.breakfast.taken} time={r.breakfast.time} /></td>
                      <td className="px-4 py-2"><MealCell taken={r.lunch.taken} time={r.lunch.time} /></td>
                      <td className="px-4 py-2"><MealCell taken={r.dinner.taken} time={r.dinner.time} /></td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{count}/3</td>
                    </tr>
                  );
                })}
                {records.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Pick a valid date range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {printing && <PrintCardDialog emp={emp} onClose={() => setPrinting(false)} />}
    </div>
  );
}

function PrintCardDialog({ emp, onClose }: { emp: CmsEmployee; onClose: () => void }) {
  return (
    <div
      className="print-card-overlay fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-elegant overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="font-display font-semibold">Access card</div>
          <button onClick={onClose} className="size-7 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex justify-center bg-secondary/40 p-5">
          <div id="print-card-area">
            <AccessCard employee={emp} />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border bg-secondary/30 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm hover:bg-secondary">Close</button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-glow"
          >
            <Printer className="size-4" /> Print
          </button>
        </div>
      </div>
    </div>
  );
}

function AccessCard({ employee }: { employee: CmsEmployee }) {
  const doj = employee.doj ? String(employee.doj).slice(0, 10) : null;
  const dojFormatted = doj ? `${doj.slice(8, 10)}/${doj.slice(5, 7)}/${doj.slice(0, 4)}` : "—";
  const brandPrimary = "#0e7490";

  return (
    <div
      className="access-card bg-white text-black relative"
      style={{
        width: "53.98mm",
        height: "85.6mm",
        padding: "4mm 5mm",
        fontFamily: "Inter, system-ui, sans-serif",
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: 0,
        boxShadow: "none",
      }}
    >
      <div className="flex justify-center relative" style={{ marginTop: "2mm" }}>
        <div
          style={{
            width: "34mm",
            height: "34mm",
            borderRadius: "50%",
            overflow: "hidden",
            backgroundColor: "#f8fafc",
            border: "0.35mm solid",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
          }}
        >
          <UserIcon style={{ width: "60%", height: "60%", color: "#94a3b8" }} strokeWidth={1.25} />
        </div>
      </div>

      <div className="text-center" style={{ marginTop: "2mm" }}>
        <div className="text-[12px] font-bold leading-tight">{employee.name}</div>
        <div className="text-[15px] font-bold leading-tight" style={{ marginTop: "1mm" }}>
          {employee.designation || "—"}
        </div>
      </div>

      <div className="flex justify-between items-end gap-2" style={{ marginTop: "2.5mm" }}>
        <div className="text-[12.5px] font-bold" style={{ lineHeight: 1.4 }}>
          <div>{employee.laborCode}</div>
          <div>DOJ: {dojFormatted}</div>
          <div>Grade: —</div>
        </div>
        <div className="bg-white">
          <QRCodeSVG value={employee.laborCode} size={50} />
        </div>
      </div>

      <div className="text-center" style={{ position: "absolute", left: 0, right: 0, bottom: "3mm" }}>
        <div
          style={{
            color: brandPrimary,
            fontFamily: '"Montserrat", "Inter", system-ui, sans-serif',
            lineHeight: 1,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ fontWeight: 800, fontSize: "23px", textTransform: "lowercase" }}>i</span>
          <span style={{ fontWeight: 800, fontSize: "30px", textTransform: "lowercase" }}>nnovo</span>
          <span style={{ fontWeight: 800, fontSize: "24px", textTransform: "uppercase", letterSpacing: "0.02em", marginLeft: "1.4mm" }}>MEP</span>
        </div>
        <div
          style={{
            fontFamily: '"Montserrat", "Inter", system-ui, sans-serif',
            fontSize: "11px",
            fontWeight: "bold",
            color: "#000",
            marginTop: "1mm",
            letterSpacing: "0.02em",
          }}
        >
          innovogroup.com
        </div>
      </div>
    </div>
  );
}

function MealCell({ taken, time }: { taken: boolean; time: string | null }) {
  if (!taken) {
    return (
      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <X className="size-3.5" /> <span>—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center gap-1.5 text-xs text-success">
      <Check className="size-3.5" />
      <span className="tabular-nums text-foreground">{time}</span>
    </div>
  );
}

function DurationCell({ doj, effectiveDate }: { doj: string; effectiveDate: string | null }) {
  const expiry = effectiveDate ? new Date(effectiveDate) : null;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const expired = expiry !== null && expiry.getTime() < todayStart.getTime();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{fmtDate(doj)}</span>
      <span className="text-muted-foreground/60">→</span>
      {effectiveDate ? (
        <span
          className={
            expired
              ? "font-semibold text-destructive bg-destructive/10 rounded-md px-1.5 py-0.5"
              : "text-foreground"
          }
        >
          {fmtDate(effectiveDate)}
          {expired && <span className="ml-1 text-[10px] uppercase tracking-wide">Expired</span>}
        </span>
      ) : (
        <span className="text-success">{fmtDate(new Date().toISOString().slice(0, 10))}</span>
      )}
    </span>
  );
}

function MealsFlag({ value }: { value: "Y" | "N" }) {
  const yes = value === "Y";
  return (
    <span
      className={`text-[11px] font-semibold rounded-full px-2 py-0.5 inline-flex items-center ${
        yes ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
      }`}
    >
      {yes ? "Yes" : "No"}
    </span>
  );
}

function StatusPill({ status }: { status: CmsEmployee["status"] }) {
  const map: Record<string, string> = {
    Active: "bg-success/10 text-success",
    InActive: "bg-muted text-muted-foreground",
    leave: "bg-warning/10 text-warning",
  };
  return <span className={`text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 ${map[status]}`}>{status}</span>;
}

function MealsEligibilityPill({ emp }: { emp: CmsEmployee }) {
  // Expiry comes from the EFECTIVE_DATE column. If it's in the past, the
  // employee is no longer eligible regardless of the Y/N flag.
  const expiry = emp.effectiveDate ? new Date(emp.effectiveDate) : null;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const expired = expiry !== null && expiry.getTime() < todayStart.getTime();
  const eligible = !expired && emp.mealsEligibility === "Y";

  const start = fmtDate(emp.doj);
  const end = emp.effectiveDate ? fmtDate(emp.effectiveDate) : "Present";

  const label = expired ? "Expired" : eligible ? "Meals: Yes" : "Meals: No";
  const Icon = eligible ? BadgeCheck : BadgeAlert;
  const tone = expired
    ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
    : eligible
      ? "bg-success/10 text-success border-success/20"
      : "bg-destructive/10 text-destructive border-destructive/20";

  return (
    <span className={`text-[11px] inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tone}`}>
      <Icon className="size-3" />
      <span className="font-semibold">{label}</span>
      <span className="opacity-70">·</span>
      <span className="tabular-nums opacity-90">{start} → {end}</span>
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "primary" | "success" | "muted" | "warning" }) {
  const map = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    muted: "bg-secondary text-muted-foreground",
    warning: "bg-warning/10 text-warning",
  } as const;
  return (
    <div className={`rounded-lg px-3 py-1.5 ${map[tone]}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SumCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: "primary" | "success" | "warning" | "accent" }) {
  const map = {
    primary: "from-primary/10 text-primary",
    success: "from-success/10 text-success",
    warning: "from-warning/10 text-warning",
    accent: "from-accent/20 text-accent-foreground",
  } as const;
  return (
    <div className={`rounded-xl border border-border p-3 bg-gradient-to-br ${map[color]} to-transparent`}>
      <div className="flex items-center gap-2 text-xs">{icon}<span>{label}</span></div>
      <div className="text-lg font-bold mt-1 tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Info({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 border border-border/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className="text-sm font-medium mt-0.5 truncate" title={value}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate" title={sub}>{sub}</div>}
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs text-muted-foreground flex items-center gap-1.5">
      <span>{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-md bg-secondary text-sm text-foreground border border-transparent focus:border-ring focus:outline-none" />
    </label>
  );
}

function summarize(records: MealRecord[]) {
  const total = records.length;
  const b = records.filter((r) => r.breakfast.taken).length;
  const l = records.filter((r) => r.lunch.taken).length;
  const dn = records.filter((r) => r.dinner.taken).length;
  return {
    total,
    breakfast: b,
    lunch: l,
    dinner: dn,
    served: b + l + dn,
    possible: total * 3,
    rate: total ? Math.round(((b + l + dn) / (total * 3)) * 100) : 0,
  };
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function dayName(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}

// === Excel import ============================================================

// Match column headers case-insensitively, allowing common aliases. The CMS
// export ships with a typo on "DESIGNAITON" and underscores everywhere, so we
// normalize keys and lookup by a stable set of synonyms.
// EFECTIVE_DATE (typo from source) is treated as the meal-eligibility expiry.
// LAST_UPDATED from the workbook is intentionally NOT mapped — the backend
// stamps it to the import time instead.
const COLUMN_ALIASES: Record<keyof EmployeeImportRow, string[]> = {
  company: ["company"],
  laborId: ["laborid", "labor_id", "labourid", "labour_id"],
  laborCode: ["laborcode", "labor_code", "labourcode", "labour_code"],
  name: ["empname", "name", "employee_name", "employeename"],
  designation: ["designation", "designaiton", "desig"],
  doj: ["doj", "date_of_joining", "dateofjoining", "joindate", "join_date"],
  campCode: ["campcode", "camp_code"],
  campName: ["campname", "camp_name"],
  mealsEligibility: ["meals_eligibility", "mealseligibility", "meal_eligibility", "mealseligible"],
  status: ["status"],
  effectiveDate: ["effective_date", "efective_date", "effectivedate", "efectivedate", "expiry", "expiry_date"],
};

function normKey(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
}

function buildHeaderMap(rawHeaders: string[]): Partial<Record<keyof EmployeeImportRow, string>> {
  const map: Partial<Record<keyof EmployeeImportRow, string>> = {};
  const normalized = rawHeaders.map((h) => ({ raw: h, norm: normKey(h) }));
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof EmployeeImportRow, string[]][]) {
    const aliasSet = new Set(aliases.map(normKey));
    const hit = normalized.find((h) => aliasSet.has(h.norm));
    if (hit) map[field] = hit.raw;
  }
  return map;
}

function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  // Excel stores dates as serial numbers (days since 1899-12-30, accounting
  // for the 1900 leap-year bug). 25569 is the offset between Excel's epoch
  // and the JS epoch (1970-01-01).
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseEmployeeWorkbook(buf: ArrayBuffer): { rows: EmployeeImportRow[]; warnings: string[] } {
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  if (json.length === 0) return { rows: [], warnings: [] };

  const headers = Object.keys(json[0]);
  const headerMap = buildHeaderMap(headers);
  const required: (keyof EmployeeImportRow)[] = [
    "laborId", "laborCode", "name", "campCode", "campName", "status", "mealsEligibility",
  ];
  const missing = required.filter((f) => !headerMap[f]);
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  const rows: EmployeeImportRow[] = [];
  const warnings: string[] = [];

  json.forEach((raw, idx) => {
    const rowNo = idx + 2; // header is row 1
    const get = (field: keyof EmployeeImportRow) => {
      const key = headerMap[field];
      return key ? raw[key] : null;
    };

    const laborIdRaw = get("laborId");
    const laborId = typeof laborIdRaw === "number" ? laborIdRaw : Number(laborIdRaw);
    if (!Number.isFinite(laborId)) {
      warnings.push(`Row ${rowNo}: skipped — invalid laborId`);
      return;
    }

    const statusRaw = String(get("status") ?? "").trim();
    const status =
      statusRaw.toLowerCase() === "active" ? "Active" as const :
      statusRaw.toLowerCase() === "leave" ? "leave" as const :
      statusRaw.toLowerCase() === "inactive" ? "InActive" as const :
      null;
    if (!status) {
      warnings.push(`Row ${rowNo}: skipped — unknown status "${statusRaw}"`);
      return;
    }

    const elig = String(get("mealsEligibility") ?? "").trim().toUpperCase();
    if (elig !== "Y" && elig !== "N") {
      warnings.push(`Row ${rowNo}: skipped — meals eligibility must be Y or N`);
      return;
    }

    const doj = toIsoDate(get("doj")) ?? new Date().toISOString().slice(0, 10);

    rows.push({
      company: String(get("company") ?? "").trim(),
      laborId,
      laborCode: String(get("laborCode") ?? "").trim(),
      name: String(get("name") ?? "").trim(),
      designation: String(get("designation") ?? "").trim(),
      doj,
      campCode: String(get("campCode") ?? "").trim(),
      campName: String(get("campName") ?? "").trim(),
      mealsEligibility: elig as "Y" | "N",
      status,
      effectiveDate: toIsoDate(get("effectiveDate")),
    });
  });

  return { rows, warnings };
}

type ImportState =
  | { kind: "parsing" }
  | { kind: "error"; message: string }
  | { kind: "ready"; rows: EmployeeImportRow[]; fileName: string; warnings: string[] }
  | { kind: "done"; deleted: number; inserted: number };

function ImportDialog({
  state, submitting, onConfirm, onClose,
}: {
  state: ImportState;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-elegant overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <Upload className="size-4" />
            </div>
            <div>
              <div className="font-display font-semibold">Import employees from Excel</div>
              <div className="text-xs text-muted-foreground">Replaces the existing roster. Meal-log history will be deleted.</div>
            </div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground">
            <X className="size-4" />
          </button>
        </div>

        {state.kind === "parsing" && (
          <div className="p-10 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Parsing workbook…
          </div>
        )}

        {state.kind === "error" && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm">
              <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-destructive">Import failed</div>
                <div className="text-muted-foreground mt-1">{state.message}</div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Close</button>
            </div>
          </div>
        )}

        {state.kind === "ready" && (
          <>
            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <div><span className="text-muted-foreground">File:</span> <span className="font-medium">{state.fileName}</span></div>
                  <div><span className="text-muted-foreground">Rows to import:</span> <span className="font-semibold tabular-nums">{state.rows.length}</span></div>
                </div>
              </div>

              {state.warnings.length > 0 && (
                <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-xs text-muted-foreground max-h-32 overflow-auto">
                  <div className="font-semibold text-warning mb-1">{state.warnings.length} warning{state.warnings.length === 1 ? "" : "s"}</div>
                  {state.warnings.slice(0, 20).map((w, i) => <div key={i}>• {w}</div>)}
                  {state.warnings.length > 20 && <div>…and {state.warnings.length - 20} more</div>}
                </div>
              )}

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="text-xs text-muted-foreground px-3 py-2 border-b border-border bg-secondary/30">
                  Preview (first 5 rows)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium">Labour Code</th>
                        <th className="text-left px-3 py-1.5 font-medium">Name</th>
                        <th className="text-left px-3 py-1.5 font-medium">Camp</th>
                        <th className="text-left px-3 py-1.5 font-medium">Status</th>
                        <th className="text-left px-3 py-1.5 font-medium">Eligibility</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.rows.slice(0, 5).map((r) => (
                        <tr key={r.laborId} className="border-t border-border">
                          <td className="px-3 py-1.5 font-mono">{r.laborCode}</td>
                          <td className="px-3 py-1.5">{r.name}</td>
                          <td className="px-3 py-1.5">{r.campCode}</td>
                          <td className="px-3 py-1.5">{r.status}</td>
                          <td className="px-3 py-1.5">{r.mealsEligibility}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs">
                <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-destructive">This will wipe the current employee table.</div>
                  <div className="text-muted-foreground mt-0.5">All existing employees and their meal records will be deleted, then replaced by the {state.rows.length} rows above.</div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border bg-secondary/30 flex items-center justify-end gap-2">
              <button onClick={onClose} disabled={submitting} className="px-3 py-2 rounded-lg text-sm hover:bg-secondary disabled:opacity-50">Cancel</button>
              <button
                onClick={onConfirm}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Replace {state.rows.length} employees
              </button>
            </div>
          </>
        )}

        {state.kind === "done" && (
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-success/10 border border-success/20 p-4 text-sm">
              <Check className="size-5 text-success shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-success">Import complete</div>
                <div className="text-muted-foreground mt-1">
                  Deleted {state.deleted} previous row{state.deleted === 1 ? "" : "s"}, inserted {state.inserted} new row{state.inserted === 1 ? "" : "s"}.
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-glow">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
