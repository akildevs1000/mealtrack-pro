import { useState } from "react";
import { ChefHat, X } from "lucide-react";
import { useUpsertCateringCompany, type CateringCompany } from "@/lib/hooks";

const inputCls =
  "mt-1 w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";
// Same field look but no top margin — used beside a label instead of above it.
const fieldCls =
  "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

// UAE-relevant option lists.
const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];
const TAX_TREATMENTS = ["VAT Registered", "Non VAT Registered", "GCC VAT Registered", "Non GCC"];

type DialogTab = "other" | "address" | "remarks";
type FormState = Omit<CateringCompany, "id">;

function emptyForm(name = ""): FormState {
  return {
    name,
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
  };
}

/**
 * The full Catering Company add/edit form (Zoho "New Customer"-style layout).
 * Shared by the Catering Companies page AND the distributor form's "+ Add as
 * new catering company" flow, so both create through the exact same fields —
 * never a bare name-only record.
 */
export function CateringCompanyDialog({
  editing = null,
  initialName = "",
  onClose,
  onSaved,
}: {
  /** Non-null = editing this existing catering company. */
  editing?: CateringCompany | null;
  /** Prefills Display Name when opened fresh from elsewhere (e.g. the distributor form). */
  initialName?: string;
  onClose: () => void;
  onSaved?: (company: CateringCompany) => void;
}) {
  const upsert = useUpsertCateringCompany();
  const [form, setForm] = useState<FormState>(() => {
    if (!editing) return emptyForm(initialName);
    const { id: _id, ...rest } = editing;
    return rest;
  });
  const [tab, setTab] = useState<DialogTab>("other");
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Catering company name is required.");
      return;
    }
    try {
      const saved = await upsert.mutateAsync({ ...(editing ? { id: editing.id } : {}), ...form });
      onSaved?.(saved);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save catering company");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-card border border-border shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <ChefHat className="size-4" />
            </div>
            <div className="font-semibold">{editing ? "Edit Catering Company" : "Add Catering Company"}</div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-secondary">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-6">
          <div className="divide-y divide-border/60">
            <Row label="Customer Type">
              <div className="flex items-center gap-6">
                {(["Business", "Individual"] as const).map((t) => (
                  <label key={t} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={form.customerType === t}
                      onChange={() => set("customerType", t)}
                      className="size-4 accent-primary"
                    />
                    {t}
                  </label>
                ))}
              </div>
            </Row>

            <Row label="Primary Contact">
              <div className="grid grid-cols-3 gap-3">
                <select value={form.salutation} onChange={(e) => set("salutation", e.target.value)} className={fieldCls}>
                  <option value="">Salutation</option>
                  {["Mr.", "Mrs.", "Ms.", "Dr."].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="First Name" className={fieldCls} />
                <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Last Name" className={fieldCls} />
              </div>
            </Row>

            <Row label="Company Name">
              <input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} className={fieldCls} />
            </Row>

            <Row label="Display Name" required>
              <input required value={form.name} onChange={(e) => set("name", e.target.value)} className={fieldCls} placeholder="e.g. Sabari Catering LLC" />
            </Row>

            <Row label="Email Address">
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={fieldCls} />
            </Row>

            <Row label="Phone">
              <div className="flex items-center gap-2 max-w-xs">
                <span className="px-2.5 h-9 grid place-items-center rounded-lg bg-secondary text-xs text-muted-foreground shrink-0">+971</span>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone number" className={`${fieldCls} flex-1`} />
              </div>
            </Row>

            <Row label="Status">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as FormState["status"])}
                className={fieldCls}
                style={{ maxWidth: "200px" }}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </Row>
          </div>

          {/* Tabs */}
          <div className="mt-5 border-b border-border flex items-center gap-6">
            {([
              ["other", "Other Details"],
              ["address", "Address"],
              ["remarks", "Remarks"],
            ] as [DialogTab, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`pb-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="pt-4">
            {tab === "other" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tax Treatment</label>
                  <select value={form.taxTreatment} onChange={(e) => set("taxTreatment", e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {TAX_TREATMENTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Place of Supply</label>
                  <select value={form.placeOfSupply} onChange={(e) => set("placeOfSupply", e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {EMIRATES.map((em) => <option key={em} value={em}>{em}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">TRN / VAT no.</label>
                  <input value={form.trn} onChange={(e) => set("trn", e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
            {tab === "address" && (
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
            )}
            {tab === "remarks" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes / Reference</label>
                <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={inputCls} />
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-5 mt-4 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
            <button type="submit" disabled={upsert.isPending} className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow disabled:opacity-60">
              {upsert.isPending ? "Saving…" : editing ? "Save Changes" : "Create Catering Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Label-left row (Zoho "New Customer" style) instead of label-above-field.
function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 py-2.5">
      <div className="sm:w-36 sm:pt-2 shrink-0 text-sm text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
