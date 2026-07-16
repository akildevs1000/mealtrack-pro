import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Contact, Plus, Search, Pencil, Trash2, X, Mail, Phone as PhoneIcon, BadgeCheck, ChefHat, IdCard,
} from "lucide-react";
import { useSession } from "@/lib/session";
import {
  useDistributorEmployees,
  useUpsertDistributorEmployee,
  useDeleteDistributorEmployee,
  useCateringCompanies,
  type DistributorEmployee,
} from "@/lib/hooks";

export const Route = createFileRoute("/distributor-employees")({
  component: DistributorEmployeesPage,
});

const inputCls =
  "mt-1 w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

type FormState = {
  cateringCompanyId: string;
  name: string;
  phone: string;
  email: string;
  emiratesId: string;
  status: "Active" | "Inactive";
  notes: string;
};
const emptyForm = (cateringCompanyId = ""): FormState => ({
  cateringCompanyId, name: "", phone: "", email: "", emiratesId: "", status: "Active", notes: "",
});

function DistributorEmployeesPage() {
  const { data: cateringCompanies = [] } = useCateringCompanies();
  const [cateringFilter, setCateringFilter] = useState<string>("all");
  const { data: list = [] } = useDistributorEmployees(cateringFilter === "all" ? undefined : cateringFilter);
  const upsert = useUpsertDistributorEmployee();
  const del = useDeleteDistributorEmployee();
  const { can } = useSession();
  const canEdit = can("distributorEmployees", "edit");
  const canDelete = can("distributorEmployees", "delete");

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DistributorEmployee | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      [p.name, p.cateringCompanyName, p.email, p.phone].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [list, query]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm(cateringFilter === "all" ? "" : cateringFilter));
    setError(null);
    setOpen(true);
  }
  function openEdit(p: DistributorEmployee) {
    setEditingId(p.id);
    setForm({
      cateringCompanyId: p.cateringCompanyId, name: p.name,
      phone: p.phone, email: p.email, emiratesId: p.emiratesId,
      status: p.status, notes: p.notes,
    });
    setError(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cateringCompanyId) {
      setError("Catering company is required.");
      return;
    }
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      if (editingId) {
        await upsert.mutateAsync({ id: editingId, ...form });
      } else {
        await upsert.mutateAsync(form);
      }
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Distributor Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The roster of people who work for each catering company. Create/assign a Distributor login for them from the Distributors page.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-glow hover:opacity-95"
          >
            <Plus className="size-4" /> Add Person
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, catering company, contact…"
            className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none"
          />
        </div>
        <select
          value={cateringFilter}
          onChange={(e) => setCateringFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none"
        >
          <option value="all">All catering companies</option>
          {cateringCompanies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            <Contact className="size-8 mx-auto mb-3 opacity-40" />
            No one in the roster yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Catering Company</th>
                  <th className="px-4 py-3 font-medium">Reach</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                          <Contact className="size-4" />
                        </div>
                        <div className="font-medium">{p.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <ChefHat className="size-3.5 shrink-0" />
                        {p.cateringCompanyName ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="space-y-0.5">
                        {p.email && (
                          <div className="flex items-center gap-1.5"><Mail className="size-3.5" /> {p.email}</div>
                        )}
                        {p.phone && (
                          <div className="flex items-center gap-1.5"><PhoneIcon className="size-3.5" /> {p.phone}</div>
                        )}
                        {!p.email && !p.phone && "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${
                          p.status === "Active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.hasAccount ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 bg-primary/10 text-primary">
                          <BadgeCheck className="size-3" /> Has login
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 bg-muted text-muted-foreground">
                          No login yet
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(p)}
                            className="size-8 grid place-items-center rounded-lg border border-border bg-secondary/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition"
                            title="Edit"
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleting(p)}
                            className="size-8 grid place-items-center rounded-lg border border-border bg-secondary/60 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition"
                            title="Delete"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / edit dialog — roster fields only. Distributor logins are created
          from the Distributors page (picking this person auto-fills these
          same details), never from here. */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-elegant" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
                  <Contact className="size-4" />
                </div>
                <div className="font-semibold">{editingId ? "Edit Person" : "Add Person"}</div>
              </div>
              <button onClick={() => setOpen(false)} className="size-8 grid place-items-center rounded-lg hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Catering Company *</label>
                <select
                  required
                  value={form.cateringCompanyId}
                  onChange={(e) => set("cateringCompanyId", e.target.value)}
                  className={inputCls}
                >
                  <option value="">— Select catering company —</option>
                  {cateringCompanies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Name *</label>
                <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="e.g. Ravi Kumar" autoComplete="off" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} placeholder="+971 50 000 0000" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <IdCard className="size-3" /> Emirates ID
                </label>
                <input
                  value={form.emiratesId}
                  onChange={(e) => set("emiratesId", e.target.value)}
                  className={`${inputCls} font-mono`}
                  placeholder="784-XXXX-XXXXXXX-X"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])} className={inputCls}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputCls} />
              </div>

              {error && (
                <div className="sm:col-span-2 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
              )}

              <div className="sm:col-span-2 flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
                <button
                  type="submit"
                  disabled={upsert.isPending}
                  className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60"
                >
                  {upsert.isPending ? "Saving…" : editingId ? "Save Changes" : "Add Person"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-elegant p-6" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold">Remove from roster?</div>
            <p className="text-sm text-muted-foreground mt-1">
              This will remove <span className="font-medium text-foreground">{deleting.name}</span> from the roster.
              {deleting.hasAccount && " Their existing Distributor login account is NOT deleted — it will just be unlinked from this roster entry."}
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
