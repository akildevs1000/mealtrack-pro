import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChefHat, Plus, Search, Pencil, Trash2, X, Mail, Phone as PhoneIcon } from "lucide-react";
import { useSession } from "@/lib/session";
import {
  useCateringCompanies,
  useUpsertCateringCompany,
  useDeleteCateringCompany,
  type CateringCompany,
} from "@/lib/hooks";

export const Route = createFileRoute("/catering")({
  component: CateringPage,
});

const inputCls =
  "mt-1 w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

// UAE-relevant option lists.
const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];
const TAX_TREATMENTS = ["VAT Registered", "Non VAT Registered", "GCC VAT Registered", "Non GCC"];

type FormState = Omit<CateringCompany, "id">;
const emptyForm = (): FormState => ({
  name: "",
  customerType: "Business",
  companyName: "",
  salutation: "",
  firstName: "",
  lastName: "",
  contact: "",
  email: "",
  phone: "",
  addressLine: "",
  city: "",
  country: "United Arab Emirates",
  trn: "",
  taxTreatment: "",
  placeOfSupply: "",
  notes: "",
  status: "Active",
});

// Best contact label from the (optional) primary-contact fields, else legacy contact.
function contactLabel(c: Pick<CateringCompany, "salutation" | "firstName" | "lastName" | "contact">) {
  const full = [c.salutation, c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || c.contact || "—";
}

function CateringPage() {
  const { data: list = [] } = useCateringCompanies();
  const upsert = useUpsertCateringCompany();
  const del = useDeleteCateringCompany();
  const { can } = useSession();
  const canEdit = can("catering", "edit");
  const canDelete = can("catering", "delete");

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CateringCompany | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [c.name, c.companyName, contactLabel(c), c.email, c.phone, c.trn].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [list, query]);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }
  function openEdit(c: CateringCompany) {
    setEditingId(c.id);
    const { id: _id, ...rest } = c;
    setForm(rest);
    setError(null);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Catering company name is required.");
      return;
    }
    try {
      await upsert.mutateAsync({ ...(editingId ? { id: editingId } : {}), ...form });
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save catering company");
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
          <h1 className="font-display text-2xl font-bold tracking-tight">Catering Companies</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add, edit and manage catering companies. Assign distributors to them from the distributor form.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-glow hover:opacity-95"
          >
            <Plus className="size-4" /> Add Catering Company
          </button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, company, contact, TRN…"
          className="w-full h-10 pl-9 pr-3 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            <ChefHat className="size-8 mx-auto mb-3 opacity-40" />
            No catering companies yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Reach</th>
                  <th className="px-4 py-3 font-medium">Place / TRN</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                          <ChefHat className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          {c.companyName && (
                            <div className="text-xs text-muted-foreground truncate">{c.companyName}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contactLabel(c)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="space-y-0.5">
                        {c.email && (
                          <div className="flex items-center gap-1.5"><Mail className="size-3.5" /> {c.email}</div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1.5"><PhoneIcon className="size-3.5" /> {c.phone}</div>
                        )}
                        {!c.email && !c.phone && "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="space-y-0.5">
                        <div>{c.placeOfSupply || "—"}</div>
                        {c.trn && <div className="text-xs font-mono">{c.trn}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${
                          c.status === "Active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(c)}
                            className="size-8 grid place-items-center rounded-lg border border-border bg-secondary/60 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition"
                            title="Edit"
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleting(c)}
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

      {/* Add / edit dialog */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-elegant" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
                  <ChefHat className="size-4" />
                </div>
                <div className="font-semibold">{editingId ? "Edit Catering Company" : "Add Catering Company"}</div>
              </div>
              <button onClick={() => setOpen(false)} className="size-8 grid place-items-center rounded-lg hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Catering Company Name *</label>
                  <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="e.g. Sabari Catering LLC" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <select value={form.customerType} onChange={(e) => set("customerType", e.target.value as FormState["customerType"])} className={inputCls}>
                    <option value="Business">Business</option>
                    <option value="Individual">Individual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select value={form.status} onChange={(e) => set("status", e.target.value as FormState["status"])} className={inputCls}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Company / Trade name</label>
                  <input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} className={inputCls} />
                </div>
              </div>

              <Section title="Primary Contact">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Salutation</label>
                    <select value={form.salutation} onChange={(e) => set("salutation", e.target.value)} className={inputCls}>
                      <option value="">—</option>
                      {["Mr.", "Mrs.", "Ms.", "Dr."].map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">First name</label>
                    <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Last name</label>
                    <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                    <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Phone</label>
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} placeholder="+971 50 000 0000" />
                  </div>
                </div>
              </Section>

              <Section title="Address">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Address / area</label>
                    <input value={form.addressLine} onChange={(e) => set("addressLine", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">City</label>
                    <input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Country</label>
                    <input value={form.country} onChange={(e) => set("country", e.target.value)} className={inputCls} />
                  </div>
                </div>
              </Section>

              <Section title="Tax">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">TRN / VAT no.</label>
                    <input value={form.trn} onChange={(e) => set("trn", e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Tax treatment</label>
                    <select value={form.taxTreatment} onChange={(e) => set("taxTreatment", e.target.value)} className={inputCls}>
                      <option value="">—</option>
                      {TAX_TREATMENTS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Place of supply</label>
                    <select value={form.placeOfSupply} onChange={(e) => set("placeOfSupply", e.target.value)} className={inputCls}>
                      <option value="">—</option>
                      {EMIRATES.map((em) => <option key={em} value={em}>{em}</option>)}
                    </select>
                  </div>
                </div>
              </Section>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes / Reference</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className={inputCls} />
              </div>

              {error && (
                <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={upsert.isPending} className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60">
                  {upsert.isPending ? "Saving…" : editingId ? "Save Changes" : "Create Catering Company"}
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
            <div className="font-semibold">Delete catering company?</div>
            <p className="text-sm text-muted-foreground mt-1">
              This will permanently remove <span className="font-medium text-foreground">{deleting.name}</span>. Any distributors linked to it will simply be unlinked.
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/20 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">{title}</div>
      {children}
    </div>
  );
}
