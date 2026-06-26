import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Building2,
  Mail,
  Phone,
  KeyRound,
  Shield,
  X,
  AlertTriangle,
  CheckCircle2,
  Check,
  ChevronDown,
  Clock,
  Smartphone,
} from "lucide-react";
import {
  useCamps,
  useCompanies,
  useManagers,
  useCreateManager,
  useUpdateManager,
  useDeleteManager,
  useToggleManagerStatus,
  type Manager as CampManager,
} from "@/lib/hooks";

export const Route = createFileRoute("/managers")({
  component: Managers,
  head: () => ({ meta: [{ title: "Suppliers — MyMeals" }] }),
});

type FormState = {
  name: string;
  username: string;
  password: string;
  // Mobile-app PIN. "" = unset/clear; otherwise 4–12 digits.
  pin: string;
  email: string;
  phone: string;
  emiratesId: string;
  camps: string[];
  companyCode: string | null;
  role: CampManager["role"];
  shift: CampManager["shift"];
  joinDate: string;
  expiryDate: string;
  status: CampManager["status"];
  permissions: { breakfast: boolean; lunch: boolean; dinner: boolean; reports: boolean };
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const initials = (s: string) =>
  s
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);

const emptyForm: FormState = {
  name: "",
  username: "",
  password: "",
  pin: "",
  email: "",
  phone: "",
  emiratesId: "",
  camps: [],
  companyCode: null,
  role: "Camp Manager",
  shift: "Full Day",
  joinDate: today(),
  expiryDate: addDays(365),
  status: "Active",
  permissions: { breakfast: true, lunch: true, dinner: true, reports: true },
};

function statusTone(s: CampManager["status"]) {
  if (s === "Active") return "bg-success/10 text-success border-success/20";
  if (s === "Suspended") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

function Managers() {
  const { data: list = [] } = useManagers();
  const { data: camps = [] } = useCamps();
  const createMgr = useCreateManager();
  const updateMgr = useUpdateManager();
  const deleteMgr = useDeleteManager();
  const toggle = useToggleManagerStatus();
  const { data: companies = [] } = useCompanies();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampManager["status"]>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [editing, setEditing] = useState<CampManager | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CampManager | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return list.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (companyFilter !== "all" && m.companyCode !== companyFilter) return false;
      if (!q) return true;
      return [m.name, m.username, ...(m.camps ?? [m.camp]), m.email, m.phone]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [list, query, statusFilter, companyFilter]);

  // Master/detail: keep a selection, falling back to the first visible row so
  // the detail panel is never empty when suppliers exist.
  const selected = filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  const active = list.filter((m) => m.status === "Active").length;
  const suspended = list.filter((m) => m.status === "Suspended").length;
  const expired = list.filter((m) => m.status === "Expired").length;

  async function save(form: FormState, id?: string) {
    // On create: pin "" sends no PIN. On edit: empty pin means "don't touch".
    const pin = form.pin ? form.pin : id ? undefined : null;
    const payload = {
      name: form.name,
      username: form.username,
      // Suppliers aren't given an admin-panel login, so no password is entered.
      // The server generates a random one to satisfy the account record.
      password: form.password || undefined,
      pin,
      email: form.email,
      phone: form.phone,
      emiratesId: form.emiratesId,
      campCodes: form.camps,
      companyCode: form.companyCode,
      role: form.role,
      shift: form.shift,
      joinDate: form.joinDate,
      expiryDate: form.expiryDate,
      status: form.status,
      permissions: form.permissions,
    };
    if (id) await updateMgr.mutateAsync({ id, ...payload });
    else await createMgr.mutateAsync(payload);
    setEditing(null);
    setCreating(false);
  }
  async function remove(id: string) {
    await deleteMgr.mutateAsync(id);
    setConfirmDelete(null);
  }
  async function toggleStatus(id: string) {
    const m = list.find((x) => x.id === id);
    if (!m) return;
    await toggle.mutateAsync({ id, status: m.status === "Active" ? "Suspended" : "Active" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add, edit and manage suppliers — assign each to a camp and control access.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-glow hover:opacity-95"
        >
          <Plus className="size-4" /> Add New Manager
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={<Shield className="size-4" />}
          label="Total Managers"
          value={list.length}
          tone="primary"
        />
        <Kpi
          icon={<CheckCircle2 className="size-4" />}
          label="Active"
          value={active}
          tone="success"
        />
        <Kpi icon={<Clock className="size-4" />} label="Suspended" value={suspended} tone="amber" />
        <Kpi
          icon={<AlertTriangle className="size-4" />}
          label="Expired"
          value={expired}
          tone="destructive"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* LEFT — supplier list (master) */}
        <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col lg:max-h-[calc(100vh-15rem)]">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search suppliers…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-secondary text-xs border border-transparent focus:border-ring focus:outline-none"
              >
                <option value="all">All companies</option>
                {companies.map((co) => (
                  <option key={co.id} value={co.code}>
                    {co.code}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as never)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-secondary text-xs border border-transparent focus:border-ring focus:outline-none"
              >
                <option value="all">All statuses</option>
                <option value="Active">Active</option>
                <option value="Suspended">Suspended</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
          </div>
          <div className="overflow-y-auto divide-y divide-border/60 flex-1">
            {filtered.map((m) => {
              const isSel = selected?.id === m.id;
              const dot =
                m.status === "Active"
                  ? "bg-success"
                  : m.status === "Suspended"
                    ? "bg-amber-500"
                    : "bg-destructive";
              const campCount = (m.camps?.length ? m.camps : [m.camp]).length;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    isSel
                      ? "bg-sidebar-accent/60 border-l-2 border-primary"
                      : "border-l-2 border-transparent hover:bg-secondary/40"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="size-9 rounded-full gradient-accent grid place-items-center text-primary-foreground font-semibold text-xs">
                      {m.avatar}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card ${dot}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm">{m.name}</div>
                    <div className="text-xs text-muted-foreground truncate font-mono">
                      @{m.username}
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                    <Building2 className="size-3" />
                    {campCount}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-12 text-center text-muted-foreground text-sm">
                No suppliers match.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — selected supplier (detail) */}
        <div className="rounded-xl border border-border bg-card min-h-[420px]">
          {selected ? (
            <SupplierDetail
              m={selected}
              onEdit={() => setEditing(selected)}
              onToggle={() => toggleStatus(selected.id)}
              onDelete={() => setConfirmDelete(selected)}
            />
          ) : (
            <div className="h-full min-h-[420px] grid place-items-center text-center p-8">
              <div className="text-muted-foreground">
                <Shield className="size-10 mx-auto mb-3 opacity-40" />
                <div className="font-medium">No supplier selected</div>
                <div className="text-sm mt-1">Pick a supplier from the list to see details.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <ManagerDialog
          manager={editing}
          camps={camps}
          existingUsernames={list.map((m) => m.username)}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          manager={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete.id)}
        />
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "primary" | "success" | "amber" | "destructive";
}) {
  const map = {
    primary: "from-primary/15 text-primary",
    success: "from-success/15 text-success",
    amber: "from-amber-500/15 text-amber-500",
    destructive: "from-destructive/15 text-destructive",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div
        className={`size-9 rounded-lg bg-gradient-to-br ${map[tone]} to-transparent grid place-items-center mb-2`}
      >
        {icon}
      </div>
      <div className="text-2xl font-display font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

function ManagerDialog({
  manager,
  camps,
  existingUsernames,
  onClose,
  onSave,
}: {
  manager: CampManager | null;
  camps: { id: string; code: string; name: string }[];
  existingUsernames: string[];
  onClose: () => void;
  onSave: (form: FormState, id?: string) => void | Promise<void>;
}) {
  const { data: companies = [] } = useCompanies();
  const [form, setForm] = useState<FormState>(
    manager
      ? {
          name: manager.name,
          username: manager.username,
          password: "",
          pin: "",
          email: manager.email,
          phone: manager.phone,
          emiratesId: manager.emiratesId,
          camps: manager.camps?.length ? manager.camps : [manager.camp],
          companyCode: manager.companyCode,
          role: manager.role,
          shift: manager.shift,
          joinDate: manager.joinDate,
          expiryDate: manager.expiryDate,
          status: manager.status,
          permissions: { ...manager.permissions },
        }
      : emptyForm,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name || !form.username || form.camps.length === 0) {
      setError("Name, username and at least one camp are required.");
      return;
    }
    if (form.pin && !/^\d{4}$/.test(form.pin)) {
      setError("Mobile PIN must be exactly 4 digits.");
      return;
    }
    const dupe = existingUsernames.some(
      (u) => u.toLowerCase() === form.username.toLowerCase() && u !== manager?.username,
    );
    if (dupe) {
      setError("This username is already taken.");
      return;
    }
    try {
      setSubmitting(true);
      // onSave closes the dialog on success; on failure it throws here so we
      // surface the reason instead of leaving a stuck, dimmed overlay.
      await onSave(form, manager?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-elegant my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <KeyRound className="size-4" />
            </div>
            <div>
              <div className="font-semibold">{manager ? "Edit Supplier" : "Add New Supplier"}</div>
              <div className="text-xs text-muted-foreground">
                {manager ? `Updating @${manager.username}` : "Create a new supplier account"}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 grid place-items-center rounded-lg hover:bg-secondary"
          >
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Full Name *">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
              placeholder="Ahmed Al Mansouri"
            />
          </Field>
          <Field label="Username *">
            <input
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              className={`${inputCls} font-mono`}
              placeholder="ahmed.mansouri"
            />
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-1.5">
                <Smartphone className="size-3.5" />
                Mobile PIN{" "}
                {manager ? "(blank to keep existing)" : "(4 digits, for Android scanner)"}
              </span>
            }
          >
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
              maxLength={4}
              className={`${inputCls} font-mono tracking-widest`}
              placeholder={manager ? "Unchanged" : "4 digits"}
            />
          </Field>
          <Field label="Emirates ID">
            <input
              value={form.emiratesId}
              onChange={(e) => setForm({ ...form, emiratesId: e.target.value })}
              className={`${inputCls} font-mono`}
              placeholder="784-XXXX-XXXXXXX-X"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Phone">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputCls}
              placeholder="+971 50 000 0000"
            />
          </Field>

          <Field label="Company">
            <select
              value={form.companyCode ?? ""}
              onChange={(e) => setForm({ ...form, companyCode: e.target.value || null })}
              className={inputCls}
            >
              <option value="">— Select company —</option>
              {companies.map((co) => (
                <option key={co.id} value={co.code}>
                  {co.code} — {co.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assigned Camps *">
            <MultiCampSelect
              camps={camps}
              value={form.camps}
              onChange={(camps) => setForm({ ...form, camps })}
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as CampManager["status"] })
              }
              className={inputCls}
            >
              <option>Active</option>
              <option>Suspended</option>
              <option>Expired</option>
            </select>
          </Field>
          <Field label="Join Date">
            <input
              type="date"
              value={form.joinDate}
              onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Access Expiry">
            <input
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              className={inputCls}
            />
          </Field>

          {error && (
            <div className="md:col-span-2 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm hover:bg-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : manager ? "Save Changes" : "Create Supplier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

// Multi-camp picker styled like a single <select>: a chip-filled trigger that
// opens a checklist dropdown. Self-contained (no portal) so it plays nicely
// inside the hand-rolled modal; closes on outside click. First selected camp
// is the primary.
function MultiCampSelect({
  camps,
  value,
  onChange,
}: {
  camps: { id: string; code: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  const allSelected = camps.length > 0 && camps.every((c) => value.includes(c.code));

  // Preserve selection order so value[0] stays the primary camp.
  const selected = value
    .map((code) => camps.find((c) => c.code === code))
    .filter((c): c is { id: string; code: string; name: string } => Boolean(c));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center gap-1.5 flex-wrap text-left min-h-[2.625rem] cursor-pointer`}
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground">— Select camps —</span>
        ) : (
          selected.map((c, i) => (
            <span
              key={c.code}
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary pl-1.5 pr-1 py-0.5 text-xs font-medium"
            >
              <span className="font-mono">{c.code}</span>
              {i === 0 && selected.length > 1 && (
                <span className="text-[9px] uppercase tracking-wide opacity-70">primary</span>
              )}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(c.code);
                }}
                className="grid place-items-center rounded hover:bg-primary/20"
              >
                <X className="size-3" />
              </span>
            </span>
          ))
        )}
        <ChevronDown
          className={`size-4 text-muted-foreground ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg bg-card border border-border shadow-elegant max-h-56 overflow-y-auto py-1">
          {camps.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No camps available.</div>
          )}
          {camps.length > 0 && (
            <button
              type="button"
              onClick={() =>
                // Select all preserves current order (so value[0] stays primary);
                // a second click clears everything.
                allSelected
                  ? onChange([])
                  : onChange([
                      ...value,
                      ...camps.filter((c) => !value.includes(c.code)).map((c) => c.code),
                    ])
              }
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-primary hover:bg-secondary border-b border-border/60 sticky top-0 bg-card"
            >
              <span>{allSelected ? "Clear all" : "Select all"}</span>
              <span className="text-muted-foreground">
                {value.length}/{camps.length}
              </span>
            </button>
          )}
          {camps.map((c) => {
            const checked = value.includes(c.code);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.code)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary"
              >
                <span
                  className={`size-4 rounded border grid place-items-center shrink-0 ${
                    checked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                  }`}
                >
                  {checked && <Check className="size-3" />}
                </span>
                <span className="font-mono text-xs">{c.code}</span>
                <span className="text-muted-foreground truncate">— {c.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Detail panel for the selected supplier (right side of the master/detail).
function SupplierDetail({
  m,
  onEdit,
  onToggle,
  onDelete,
}: {
  m: CampManager;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const d = daysUntil(m.expiryDate);
  const allCamps = m.camps?.length ? m.camps : [m.camp];
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
        <div className="flex items-center gap-4 min-w-0">
          <div className="size-14 rounded-full gradient-accent grid place-items-center text-primary-foreground font-semibold shrink-0">
            {m.avatar}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-display font-bold truncate">{m.name}</h2>
              <span
                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusTone(m.status)}`}
              >
                {m.status}
              </span>
            </div>
            <div className="text-sm text-muted-foreground font-mono">@{m.username}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{m.emiratesId}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onToggle}
            disabled={m.status === "Expired"}
            title={m.status === "Active" ? "Set Inactive" : "Set Active"}
            className={`size-9 grid place-items-center rounded-lg disabled:opacity-30 disabled:cursor-not-allowed ${m.status === "Active" ? "hover:bg-amber-500/10 text-amber-500" : "hover:bg-success/10 text-success"}`}
          >
            {m.status === "Active" ? <PowerOff className="size-4" /> : <Power className="size-4" />}
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="size-9 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="size-9 grid place-items-center rounded-lg hover:bg-destructive/10 text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 grid sm:grid-cols-2 gap-4">
        <DetailCard icon={<Building2 className="size-4" />} title="Assigned Camps" className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {allCamps.map((code, i) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 text-xs rounded-md bg-primary/10 text-primary px-2 py-1 font-medium"
              >
                <span className="font-mono">{code}</span>
                {i === 0 && allCamps.length > 1 && (
                  <span className="text-[9px] uppercase tracking-wide opacity-70">primary</span>
                )}
              </span>
            ))}
          </div>
        </DetailCard>

        <DetailCard icon={<Shield className="size-4" />} title="Role & Shift">
          <div className="font-medium">{m.role === "Camp Manager" ? "Supplier" : m.role}</div>
          <div className="text-sm text-muted-foreground">{m.shift}</div>
        </DetailCard>

        <DetailCard icon={<Building2 className="size-4" />} title="Company">
          <div className="font-medium">{m.companyCode ?? "—"}</div>
        </DetailCard>

        <DetailCard icon={<Mail className="size-4" />} title="Contact">
          <div className="flex items-center gap-1.5 text-sm truncate">
            <Mail className="size-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{m.email || "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm mt-1">
            <Phone className="size-3.5 text-muted-foreground shrink-0" />
            {m.phone || "—"}
          </div>
        </DetailCard>

        <DetailCard icon={<Smartphone className="size-4" />} title="Scanner Access">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="size-3.5 text-muted-foreground" />
            Mobile PIN:
            {m.hasPin ? (
              <span className="text-success font-medium">Set</span>
            ) : (
              <span className="text-muted-foreground">Not set</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                ["Breakfast", m.permissions.breakfast],
                ["Lunch", m.permissions.lunch],
                ["Dinner", m.permissions.dinner],
                ["Reports", m.permissions.reports],
              ] as const
            ).map(([label, on]) => (
              <span
                key={label}
                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                  on
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </DetailCard>

        <DetailCard icon={<Clock className="size-4" />} title="Access Period">
          <div className="text-sm">
            <span className="text-muted-foreground">Joined</span>{" "}
            <span className="tabular-nums">{m.joinDate}</span>
          </div>
          <div className="text-sm mt-1">
            <span className="text-muted-foreground">Expires</span>{" "}
            <span className="tabular-nums">{m.expiryDate}</span>{" "}
            <span
              className={
                d < 0 ? "text-destructive" : d <= 30 ? "text-amber-500" : "text-muted-foreground"
              }
            >
              ({d < 0 ? `${Math.abs(d)}d ago` : `in ${d}d`})
            </span>
          </div>
        </DetailCard>
      </div>
    </div>
  );
}

function DetailCard({
  icon,
  title,
  className = "",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border border-border bg-secondary/30 p-4 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function ConfirmDialog({
  manager,
  onCancel,
  onConfirm,
}: {
  manager: CampManager;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border shadow-elegant p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-destructive/10 text-destructive grid place-items-center">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <div className="font-semibold">Delete manager?</div>
            <div className="text-sm text-muted-foreground mt-1">
              This will permanently remove{" "}
              <span className="font-medium text-foreground">{manager.name}</span> (@
              {manager.username}) and revoke their access to{" "}
              {(manager.camps?.length ? manager.camps : [manager.camp]).join(", ")}.
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-95"
          >
            Delete Manager
          </button>
        </div>
      </div>
    </div>
  );
}
