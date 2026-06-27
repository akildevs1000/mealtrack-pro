import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FolderKanban, Users, Plus, Pencil, Trash2, LayoutGrid, List, Search, X, AlertTriangle, MapPin, Building2, User, Sunrise, Sun, Moon } from "lucide-react";
import { useProjects, useUpsertProject, useDeleteProject, useCompanies, type Project } from "@/lib/hooks";
import { defaultSchedule, type MealSchedule } from "@/lib/mock-data";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
  head: () => ({ meta: [{ title: "Projects — MyMeals" }] }),
});

type View = "card" | "list";
type FormState = Omit<Project, "id">;

const emptyForm: FormState = { code: "", name: "", location: "", company: "", companyCode: null, manager: "", employees: 0, active: true, schedule: defaultSchedule };

function ProjectsPage() {
  const { data: list = [] } = useProjects();
  const { data: companies = [] } = useCompanies();
  const upsert = useUpsertProject();
  const del = useDeleteProject();
  const [view, setView] = useState<View>("card");
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);

  const filtered = useMemo(() => {
    let scoped = companyFilter === "all" ? list : list.filter((c) => c.companyCode === companyFilter);
    if (!query) return scoped;
    const q = query.toLowerCase();
    return scoped.filter((c) =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q) || c.company.toLowerCase().includes(q),
    );
  }, [list, query, companyFilter]);

  async function save(form: FormState, id?: string) {
    const existing = id ? list.find((c) => c.id === id)?.code : undefined;
    await upsert.mutateAsync({ existingCode: existing, ...form });
    setEditing(null);
    setCreating(false);
  }

  async function remove(id: string) {
    const code = list.find((c) => c.id === id)?.code;
    if (code) await del.mutateAsync(code);
    setConfirmDelete(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage construction projects and sites — add, edit or remove projects.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95"
        >
          <Plus className="size-4" /> Add New Project
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, name, location, company…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <option value="all">All companies</option>
          {companies.map((co) => (
            <option key={co.id} value={co.code}>{co.code} — {co.name}</option>
          ))}
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-2xl bg-card border border-border p-5 hover:border-primary/40 transition group">
              <div className="flex items-start justify-between">
                <div className="size-11 rounded-xl gradient-primary grid place-items-center text-primary-foreground shadow-elegant">
                  <FolderKanban className="size-5" />
                </div>
                <span className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1.5 ${c.active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                  <span className={`size-1.5 rounded-full ${c.active ? "bg-success animate-pulse" : "bg-destructive"}`} />
                  {c.active ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="mt-4">
                <div className="font-display text-lg font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><MapPin className="size-3" /> {c.location || "—"}</div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <Stat label="Code" value={c.code} />
                <Stat label="Workers" value={c.employees.toLocaleString()} icon={<Users className="size-3" />} />
              </div>
              <div className="mt-3 space-y-1.5">
                <Meta icon={<Building2 className="size-3.5" />} value={c.company} />
                <Meta icon={<User className="size-3.5" />} value={c.manager} />
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setEditing(c)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-secondary hover:bg-secondary/80 px-3 py-2 text-xs font-medium">
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button onClick={() => setConfirmDelete(c)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 px-3 py-2 text-xs font-medium">
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-sm text-muted-foreground py-12">No projects match your search.</div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Manager</th>
                  <th className="px-4 py-3 font-medium">Workers</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
                          <FolderKanban className="size-4" />
                        </div>
                        <div className="font-medium">{c.name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="rounded-md bg-primary/10 text-primary text-xs font-medium px-2 py-0.5">{c.code}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{c.location || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.company || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.manager || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{c.employees.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 ${c.active ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        <span className={`size-1.5 rounded-full ${c.active ? "bg-success animate-pulse" : "bg-destructive"}`} />
                        {c.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditing(c)} className="size-8 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground" title="Edit">
                          <Pencil className="size-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(c)} className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 text-destructive" title="Delete">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No projects match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(creating || editing) && (
        <ProjectDialog
          project={editing}
          existingCodes={list.map((c) => c.code)}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={save}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          project={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete.id)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="p-2 rounded-lg bg-secondary/60">
      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">{icon} {label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Meta({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="text-muted-foreground/70">{icon}</span>
      <span className="truncate">{value || "—"}</span>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

function ProjectDialog({ project, existingCodes, onClose, onSave }: {
  project: Project | null;
  existingCodes: string[];
  onClose: () => void;
  onSave: (form: FormState, id?: string) => void;
}) {
  const { data: companies = [] } = useCompanies();
  const [form, setForm] = useState<FormState>(project
    ? { code: project.code, name: project.name, location: project.location, company: project.company, companyCode: project.companyCode, manager: project.manager, employees: project.employees, active: project.active, schedule: project.schedule ?? defaultSchedule }
    : emptyForm);
  const [error, setError] = useState<string | null>(null);

  function setMeal(meal: keyof MealSchedule, key: "start" | "end", value: string) {
    setForm((f) => ({ ...f, schedule: { ...f.schedule, [meal]: { ...f.schedule[meal], [key]: value } } }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code || !form.name) { setError("Code and name are required."); return; }
    if (form.employees < 0) { setError("Workers must be 0 or more."); return; }
    const dupe = existingCodes.some((c) => c.toLowerCase() === form.code.toLowerCase() && c !== project?.code);
    if (dupe) { setError("A project with this code already exists."); return; }
    onSave(form, project?.id);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-elegant" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
              <FolderKanban className="size-4" />
            </div>
            <div>
              <div className="font-semibold">{project ? "Edit Project" : "Add New Project"}</div>
              <div className="text-xs text-muted-foreground">{project ? `Updating ${project.code}` : "Register a new project"}</div>
            </div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-lg hover:bg-secondary"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Project Code *">
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="PRJ-01" className={`${inputCls} font-mono`} />
          </Field>
          <Field label="Status">
            <select value={form.active ? "active" : "inactive"} onChange={(e) => setForm({ ...form, active: e.target.value === "active" })} className={inputCls}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Project Name *">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Reem Tower Project" className={inputCls} />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Location / Site">
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Al Reem Island, Abu Dhabi" className={inputCls} />
            </Field>
          </div>
          <Field label="Company">
            <select
              value={form.companyCode ?? ""}
              onChange={(e) => {
                const co = companies.find((x) => x.code === e.target.value);
                setForm({ ...form, companyCode: co ? co.code : null, company: co ? co.name : "" });
              }}
              className={inputCls}
            >
              <option value="">— Select company —</option>
              {companies.map((co) => (
                <option key={co.id} value={co.code}>{co.code} — {co.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Project Manager">
            <input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} placeholder="Ahmed Khan" className={inputCls} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Number of Workers">
              <input type="number" min={0} value={form.employees} onChange={(e) => setForm({ ...form, employees: Number(e.target.value) })} className={inputCls} />
            </Field>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Meal Time Periods</div>
            <div className="space-y-2">
              {([
                { key: "breakfast" as const, label: "Breakfast", icon: <Sunrise className="size-3.5" /> },
                { key: "lunch" as const, label: "Lunch", icon: <Sun className="size-3.5" /> },
                { key: "dinner" as const, label: "Dinner", icon: <Moon className="size-3.5" /> },
              ]).map(({ key, label, icon }) => (
                <div key={key} className="grid grid-cols-[110px_1fr_auto_1fr] items-center gap-2 rounded-lg bg-secondary/40 border border-border/60 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-sm font-medium">{icon} {label}</div>
                  <input type="time" value={form.schedule[key].start} onChange={(e) => setMeal(key, "start", e.target.value)} className={inputCls} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input type="time" value={form.schedule[key].end} onChange={(e) => setMeal(key, "end", e.target.value)} className={inputCls} />
                </div>
              ))}
            </div>
          </div>

          {error && <div className="md:col-span-2 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}

          <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
            <button type="submit" className="rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow">
              {project ? "Save Changes" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function ConfirmDialog({ project, onCancel, onConfirm }: { project: Project; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-elegant p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-destructive/10 text-destructive grid place-items-center">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <div className="font-semibold">Delete project?</div>
            <div className="text-sm text-muted-foreground mt-1">
              This will permanently remove <span className="font-medium text-foreground">{project.name}</span> ({project.code}).
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:opacity-95">
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
}
