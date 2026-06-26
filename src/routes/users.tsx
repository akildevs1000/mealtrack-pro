import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, Search, X, AlertTriangle, Power, PowerOff,
  ShieldCheck, Eye, Edit3, Trash, UserCircle2, Building2,
} from "lucide-react";
import {
  TABS, useSession, type Role, type TabKey, type Perm,
} from "@/lib/session";
import {
  useAppUsers, useCreateAppUser, useUpdateAppUser, useDeleteAppUser,
  useToggleAppUserStatus, usePermissions, useSetPermission, useCamps,
  type AppUser as SessionUser,
} from "@/lib/hooks";

export const Route = createFileRoute("/users")({
  component: UsersPage,
  head: () => ({ meta: [{ title: "User Profiles — MyMeals" }] }),
});

const ROLES: { key: Role; label: string; tone: string }[] = [
  { key: "admin", label: "Administrator", tone: "bg-primary/10 text-primary border-primary/20" },
  { key: "operator", label: "Operator", tone: "bg-accent/10 text-accent-foreground border-accent/30" },
  { key: "user", label: "User", tone: "bg-secondary text-foreground border-border" },
  { key: "manager", label: "Supplier", tone: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
];

type FormUser = {
  id?: string;
  name: string;
  username: string;
  email: string;
  password?: string;
  role: Role;
  assignedCampCode: string | null;
  status: "Active" | "Inactive";
};

const emptyForm: FormUser = {
  name: "", username: "", email: "", password: "",
  role: "user", assignedCampCode: null, status: "Active",
};

function UsersPage() {
  const session = useSession();
  const canManage = session.can("users", "edit");
  const canDelete = session.can("users", "delete");
  const canView = session.can("users");

  const { data: users = [] } = useAppUsers();
  const create = useCreateAppUser();
  const update = useUpdateAppUser();
  const remove = useDeleteAppUser();
  const toggle = useToggleAppUserStatus();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [editing, setEditing] = useState<SessionUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<"users" | "permissions">("users");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return [u.name, u.username, u.email, u.role, u.assignedCampCode ?? ""]
        .join(" ").toLowerCase().includes(q);
    });
  }, [users, query, roleFilter]);

  if (!canView) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <ShieldCheck className="size-10 mx-auto text-muted-foreground" />
        <h2 className="mt-4 font-display text-lg font-semibold">Restricted</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your role does not have access to user management.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Access Control</div>
          <h1 className="font-display text-2xl font-bold tracking-tight mt-1">User Profiles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage software operators, users and suppliers. Assign per-tab View / Edit / Delete permissions.
          </p>
        </div>
        {tab === "users" && canManage && (
          <button onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95">
            <Plus className="size-4" /> Add User
          </button>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-border bg-secondary/40 p-1">
        <TabBtn active={tab === "users"} onClick={() => setTab("users")} label="Users" />
        <TabBtn active={tab === "permissions"} onClick={() => setTab("permissions")} label="Role permissions" />
      </div>

      {tab === "users" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as never)}
              className="px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none">
              <option value="all">All roles</option>
              {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>

          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">User</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium">Assigned camp</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const role = ROLES.find((r) => r.key === u.role)!;
                    const isCurrent = u.id === session.currentUser?.id;
                    return (
                      <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <div className="size-9 rounded-full gradient-accent grid place-items-center text-primary-foreground font-semibold text-xs">
                              {u.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {u.name}
                                {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold uppercase tracking-wider">You</span>}
                              </div>
                              <div className="text-xs text-muted-foreground">@{u.username} · {u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full border ${role.tone}`}>{role.label}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {u.role === "manager"
                            ? (u.assignedCampCode
                                ? <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" />{u.assignedCampCode}</span>
                                : <span className="text-muted-foreground">— unassigned —</span>)
                            : <span className="text-muted-foreground">All camps</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full border ${u.status === "Active" ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              disabled={!canManage}
                              onClick={() => toggle.mutate({ id: u.id, status: u.status === "Active" ? "Inactive" : "Active" })}
                              className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                              title={u.status === "Active" ? "Set inactive" : "Set active"}>
                              {u.status === "Active" ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                            </button>
                            <button
                              disabled={!canManage}
                              onClick={() => setEditing(u)}
                              className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                              title="Edit">
                              <Pencil className="size-4" />
                            </button>
                            <button
                              disabled={!canDelete || isCurrent}
                              onClick={() => setConfirmDelete(u)}
                              className="size-8 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive disabled:opacity-40 disabled:hover:bg-transparent"
                              title={isCurrent ? "Cannot delete current user" : "Delete"}>
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">No users found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <UserCircle2 className="size-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="text-sm font-semibold">Signed in</div>
                <div className="text-xs text-muted-foreground">
                  {session.currentUser?.name} ({session.currentUser?.role}
                  {session.currentUser?.assignedCampCode ? ` · ${session.currentUser.assignedCampCode}` : ""})
                </div>
              </div>
              <button onClick={session.logout}
                className="px-3 py-2 rounded-lg text-xs hover:bg-secondary text-muted-foreground">Sign out</button>
            </div>
          </div>
        </>
      ) : (
        <PermissionsMatrix />
      )}

      {(creating || editing) && (
        <UserDialog
          initial={
            editing
              ? {
                  id: editing.id,
                  name: editing.name,
                  username: editing.username,
                  email: editing.email,
                  password: "",
                  role: editing.role,
                  assignedCampCode: editing.assignedCampCode ?? null,
                  status: editing.status,
                }
              : emptyForm
          }
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={async (u) => {
            if (u.id) {
              const body: any = { ...u };
              if (!body.password) delete body.password;
              await update.mutateAsync(body);
            } else {
              await create.mutateAsync({
                name: u.name, username: u.username, email: u.email,
                password: u.password!, role: u.role,
                assignedCampCode: u.assignedCampCode, status: u.status,
              });
            }
            setEditing(null); setCreating(false);
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          user={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            await remove.mutateAsync(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
      {label}
    </button>
  );
}

function PermissionsMatrix() {
  const session = useSession();
  const canEdit = session.can("users", "edit");
  const { data: matrix } = usePermissions();
  const setPerm = useSetPermission();

  if (!matrix) {
    return <div className="text-sm text-muted-foreground">Loading permissions…</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Toggle <span className="inline-flex items-center gap-1"><Eye className="size-3" />View</span>,{" "}
          <span className="inline-flex items-center gap-1"><Edit3 className="size-3" />Edit</span>,{" "}
          <span className="inline-flex items-center gap-1"><Trash className="size-3" />Delete</span> per role per tab.
        </div>
      </div>

      {ROLES.filter((r) => r.key !== "admin").map((role) => (
        <div key={role.key} className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full border ${role.tone}`}>{role.label}</span>
              <span className="text-xs text-muted-foreground">{role.key === "manager" ? "Supplier — sees only their assigned camp" : ""}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">Tab</th>
                  <th className="text-center px-3 py-2 font-medium">View</th>
                  <th className="text-center px-3 py-2 font-medium">Edit</th>
                  <th className="text-center px-3 py-2 font-medium">Delete</th>
                </tr>
              </thead>
              <tbody>
                {TABS.map((t) => {
                  const p: Perm = matrix[role.key]?.[t.key as TabKey] ?? { view: false, edit: false, delete: false };
                  return (
                    <tr key={t.key} className="border-t border-border">
                      <td className="px-5 py-2.5 font-medium">{t.label}</td>
                      {(["view", "edit", "delete"] as const).map((action) => (
                        <td key={action} className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={p[action]}
                            onChange={(e) => {
                              const next = { ...p, [action]: e.target.checked };
                              if (action === "view" && !e.target.checked) { next.edit = false; next.delete = false; }
                              if ((action === "edit" || action === "delete") && e.target.checked) next.view = true;
                              setPerm.mutate({ role: role.key, tab: t.key, ...next });
                            }}
                            className="size-4 rounded border-border accent-primary"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function UserDialog({ initial, onClose, onSave }: {
  initial: FormUser;
  onClose: () => void;
  onSave: (u: FormUser) => void;
}) {
  const [form, setForm] = useState<FormUser>(initial);
  const isEdit = Boolean(initial.id);
  const { data: camps = [] } = useCamps();

  function update<K extends keyof FormUser>(k: K, v: FormUser[K]) { setForm((f) => ({ ...f, [k]: v })); }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.username.trim()) return;
    if (!isEdit && !form.password) {
      alert("Password is required for new users.");
      return;
    }
    if (form.role === "manager" && !form.assignedCampCode) {
      alert("Suppliers must be assigned a camp.");
      return;
    }
    onSave(form);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-elegant overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="font-display font-semibold">{isEdit ? "Edit user" : "Add new user"}</div>
            <div className="text-xs text-muted-foreground">{isEdit ? `Updating ${initial.username}` : "Create a software operator, user or supplier"}</div>
          </div>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-md hover:bg-secondary text-muted-foreground"><X className="size-4" /></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <Field label="Full name" value={form.name} onChange={(v) => update("name", v)} required />
          <Field label="Username" value={form.username} onChange={(v) => update("username", v)} required />
          <Field label="Email" value={form.email} onChange={(v) => update("email", v)} type="email" />
          <Field
            label={isEdit ? "Password (leave blank to keep)" : "Password"}
            value={form.password ?? ""}
            onChange={(v) => update("password", v)}
            type="password"
            required={!isEdit}
          />
          <div>
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <select value={form.role}
              onChange={(e) => update("role", e.target.value as Role)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none">
              {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          {form.role === "manager" && (
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Assigned camp</label>
              <select value={form.assignedCampCode ?? ""}
                onChange={(e) => update("assignedCampCode", e.target.value || null)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none">
                <option value="">Select camp…</option>
                {camps.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">This manager will only see data for the assigned camp.</p>
            </div>
          )}
          <div className="col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <div className="mt-1 inline-flex rounded-lg border border-border bg-secondary/40 p-1">
              {(["Active", "Inactive"] as const).map((s) => (
                <button key={s} type="button" onClick={() => update("status", s)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium ${form.status === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm font-semibold shadow-glow">
            {isEdit ? "Save changes" : "Create user"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{required && <span className="text-destructive ml-0.5">*</span>}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} required={required}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30" />
    </div>
  );
}

function ConfirmDialog({ user, onCancel, onConfirm }: { user: SessionUser; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-card border border-border rounded-2xl shadow-elegant overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="size-10 rounded-full bg-destructive/10 grid place-items-center text-destructive"><AlertTriangle className="size-5" /></div>
            <div className="flex-1">
              <div className="font-display font-semibold">Delete user?</div>
              <p className="text-sm text-muted-foreground mt-1">
                This will permanently remove <span className="font-medium text-foreground">{user.name}</span> (@{user.username}). This cannot be undone.
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border bg-secondary/30 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-95">Delete user</button>
        </div>
      </div>
    </div>
  );
}
