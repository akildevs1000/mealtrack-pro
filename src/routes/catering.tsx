import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChefHat, Plus, Search, Pencil, Trash2, Mail, Phone as PhoneIcon } from "lucide-react";
import { useSession } from "@/lib/session";
import { CateringCompanyDialog } from "@/components/app/CateringCompanyDialog";
import { CateringCompanyDetailDialog } from "@/components/app/CateringCompanyDetailDialog";
import { useCateringCompanies, useDeleteCateringCompany, type CateringCompany } from "@/lib/hooks";

export const Route = createFileRoute("/catering")({
  component: CateringPage,
});

// Best contact label from the (optional) primary-contact fields, else legacy contact.
function contactLabel(c: Pick<CateringCompany, "salutation" | "firstName" | "lastName" | "contact">) {
  const full = [c.salutation, c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return full || c.contact || "—";
}

function CateringPage() {
  const { data: list = [] } = useCateringCompanies();
  const del = useDeleteCateringCompany();
  const { can } = useSession();
  const canEdit = can("catering", "edit");
  const canDelete = can("catering", "delete");

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CateringCompany | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<CateringCompany | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      [c.name, c.companyName, contactLabel(c), c.email, c.phone, c.trn].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [list, query]);

  const editing = editingId ? list.find((c) => c.id === editingId) ?? null : null;

  function openNew() {
    setEditingId(null);
    setOpen(true);
  }
  function openEdit(c: CateringCompany) {
    setEditingId(c.id);
    setOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      setDeleting(null);
      setDeleteError(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
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
                  <tr
                    key={c.id}
                    onClick={() => setViewing(c)}
                    className="border-t border-border hover:bg-secondary/30 cursor-pointer"
                    title="View distributors under this catering company"
                  >
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
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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

      {open && (
        <CateringCompanyDialog
          editing={editing}
          onClose={() => { setOpen(false); setEditingId(null); }}
          onSaved={() => { setOpen(false); setEditingId(null); }}
        />
      )}

      {viewing && (
        <CateringCompanyDetailDialog company={viewing} onClose={() => setViewing(null)} />
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-elegant p-6" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold">Delete catering company?</div>
            <p className="text-sm text-muted-foreground mt-1">
              This will permanently remove <span className="font-medium text-foreground">{deleting.name}</span>. Any distributors linked to it will simply be unlinked.
            </p>
            {deleteError && (
              <div className="mt-3 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{deleteError}</div>
            )}
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
