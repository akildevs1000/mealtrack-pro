import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Smartphone, Plus, Search, Copy, Check, X, Cpu, Calendar, Pencil, Trash2 } from "lucide-react";
import { useCampScope, useSession } from "@/lib/session";
import {
  useCamps, useCompanies, useDevices, useProjects, useCreateDevice, useUpdateDevice,
  useDeleteDevice, type Device,
} from "@/lib/hooks";

export const Route = createFileRoute("/devices")({
  component: DevicesPage,
});

type FormState = Omit<Device, "id" | "lastSync" | "online">;

const initialForm = (): FormState => ({
  name: "", camp: null, projectCode: null, battery: 100, macAddress: "", serial: "",
  model: "Zebra TC22", androidVersion: "Android 13", appVersion: "MyMeals 4.2.1",
  ipAddress: "", assignedTo: "", registeredOn: new Date().toISOString().slice(0, 10),
});


function DevicesPage() {
  const scope = useCampScope();
  const { data: camps = [] } = useCamps();
  const { data: companies = [] } = useCompanies();
  const { data: projects = [] } = useProjects();
  const { data: list = [] } = useDevices();
  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const deleteDevice = useDeleteDevice();
  const { can } = useSession();
  const canEdit = can("devices", "edit");
  const canDelete = can("devices", "delete");
  const [query, setQuery] = useState("");
  const [campFilter, setCampFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  // A device's company is that of the camp OR project it's bound to. Build the
  // set of BOTH camp and project codes for the selected company so the list
  // filter matches project-bound devices too (not just camp-bound ones).
  const companySiteCodes = useMemo(
    () =>
      new Set([
        ...camps.filter((c) => c.companyCode === companyFilter).map((c) => c.code),
        ...projects.filter((p) => p.companyCode === companyFilter).map((p) => p.code),
      ]),
    [camps, projects, companyFilter],
  );
  const visibleCamps = useMemo(() => {
    let cs = scope ? camps.filter((c) => scope.includes(c.code)) : camps;
    if (companyFilter !== "all") cs = cs.filter((c) => c.companyCode === companyFilter);
    return cs;
  }, [scope, camps, companyFilter]);
  const [open, setOpen] = useState(false);
  // When set, the modal is editing this device; otherwise it's registering a new one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialForm());
  // Merged Camp/Project picker value: "c:<code>" (camp), "p:<code>" (project), or "".
  const [location, setLocation] = useState<string>("");
  // Company chosen INSIDE the dialog; the Project/Camp options below cascade
  // from it. Separate from the page-level companyFilter (the list filter above).
  const [formCompany, setFormCompany] = useState<string>("");
  // Camps/projects for the dialog, scoped to the chosen company (none until one
  // is picked, so the operator selects company → then its camp/project).
  const formCamps = useMemo(() => {
    if (!formCompany) return [];
    const cs = scope ? camps.filter((c) => scope.includes(c.code)) : camps;
    return cs.filter((c) => c.companyCode === formCompany);
  }, [scope, camps, formCompany]);
  const formProjects = useMemo(
    () => (formCompany ? projects.filter((p) => p.companyCode === formCompany) : []),
    [projects, formCompany],
  );
  // Resolve which company a camp/project code belongs to (used when editing).
  const companyForLocation = useMemo(() => {
    const campCompany = new Map(camps.map((c) => [c.code, c.companyCode]));
    const projCompany = new Map(projects.map((p) => [p.code, p.companyCode]));
    return (loc: string): string => {
      if (loc.startsWith("c:")) return campCompany.get(loc.slice(2)) ?? "";
      if (loc.startsWith("p:")) return projCompany.get(loc.slice(2)) ?? "";
      return "";
    };
  }, [camps, projects]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Device | null>(null);

  // Resolve a device's camp/project to the same "CODE — Name" label the picker shows.
  const locationLabel = useMemo(() => {
    const campByCode = new Map(camps.map((c) => [c.code, c.name]));
    const projectByCode = new Map(projects.map((p) => [p.code, p.name]));
    return (d: Device) => {
      if (d.camp) return `${d.camp}${campByCode.has(d.camp) ? ` — ${campByCode.get(d.camp)}` : ""}`;
      if (d.projectCode)
        return `${d.projectCode}${projectByCode.has(d.projectCode) ? ` — ${projectByCode.get(d.projectCode)}` : ""}`;
      return "—";
    };
  }, [camps, projects]);

  function openEdit(d: Device) {
    setEditingId(d.id);
    setForm({
      name: d.name, camp: d.camp, projectCode: d.projectCode, battery: d.battery,
      macAddress: d.macAddress, serial: d.serial, model: d.model,
      androidVersion: d.androidVersion, appVersion: d.appVersion, ipAddress: d.ipAddress,
      assignedTo: d.assignedTo, registeredOn: d.registeredOn,
    });
    const loc = d.camp ? `c:${d.camp}` : d.projectCode ? `p:${d.projectCode}` : "";
    setLocation(loc);
    setFormCompany(companyForLocation(loc));
    setError(null);
    setOpen(true);
  }

  const filtered = useMemo(() => {
    const scoped = scope ? list.filter((d) => scope.includes(d.camp ?? "")) : list;
    return scoped.filter((d) => {
      if (
        companyFilter !== "all" &&
        !companySiteCodes.has(d.camp ?? "") &&
        !companySiteCodes.has(d.projectCode ?? "")
      )
        return false;
      if (campFilter !== "all" && d.camp !== campFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.macAddress.toLowerCase().includes(q) ||
        d.serial.toLowerCase().includes(q)
      );
    });
  }, [list, query, campFilter, companyFilter, companySiteCodes, scope]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.macAddress.trim()) {
      setError("MAC address / device ID is required.");
      return;
    }
    if (
      list.some(
        (d) =>
          d.id !== editingId && d.macAddress.toLowerCase() === form.macAddress.toLowerCase(),
      )
    ) {
      setError("This MAC address is already registered.");
      return;
    }
    const campCode = location.startsWith("c:") ? location.slice(2) : null;
    const projectCode = location.startsWith("p:") ? location.slice(2) : null;
    if (!form.name || (!campCode && !projectCode)) {
      setError("Device name and a camp or project are required.");
      return;
    }
    const input = {
      name: form.name,
      campCode,
      projectCode,
      battery: form.battery,
      online: true,
      macAddress: form.macAddress,
      serial: form.serial,
      model: form.model,
      androidVersion: form.androidVersion,
      appVersion: form.appVersion,
      ipAddress: form.ipAddress,
      assignedTo: form.assignedTo,
      registeredOn: form.registeredOn,
    };
    try {
      if (editingId) await updateDevice.mutateAsync({ id: editingId, input });
      else await createDevice.mutateAsync(input);
      setForm(initialForm());
      setLocation("");
      setFormCompany("");
      setEditingId(null);
      setError(null);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save device");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await deleteDevice.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete device");
    }
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Android Scanner Devices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Register and monitor every Android scanner deployed across camps. MAC address is used for device-binding security.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setForm(initialForm());
            setFormCompany("");
            setLocation("");
            setOpen(true);
            setError(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95 transition"
        >
          <Plus className="size-4" /> Register Device
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, MAC, serial…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => { setCompanyFilter(e.target.value); setCampFilter("all"); }}
          className="px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none"
        >
          <option value="all">All companies</option>
          {companies.map((co) => <option key={co.id} value={co.code}>{co.code} — {co.name}</option>)}
        </select>
        <select
          value={campFilter}
          onChange={(e) => setCampFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none"
        >
          <option value="all">All camps</option>
          {visibleCamps.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">MAC Address</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Camp / Project</th>
                <th className="px-4 py-3 font-medium">Registered On</th>
                {(canEdit || canDelete) && <th className="px-4 py-3 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-lg gradient-accent grid place-items-center text-primary-foreground">
                        <Smartphone className="size-4" />
                      </div>
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{d.serial}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copy(d.macAddress)}
                      className="inline-flex items-center gap-2 rounded-md bg-secondary px-2 py-1 font-mono text-xs hover:bg-secondary/70"
                      title="Copy MAC"
                    >
                      {d.macAddress}
                      {copied === d.macAddress ? <Check className="size-3 text-success" /> : <Copy className="size-3 text-muted-foreground" />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">{d.model}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{locationLabel(d)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.registeredOn}</td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(d)}
                            className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                            title="Edit device"
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleting(d)}
                            className="size-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Delete device"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit || canDelete ? 6 : 5} className="px-4 py-12 text-center text-muted-foreground text-sm">No devices match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl bg-card border border-border shadow-elegant" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg gradient-primary grid place-items-center text-primary-foreground">
                  <Cpu className="size-4" />
                </div>
                <div>
                  <div className="font-semibold">{editingId ? "Edit Android Scanner" : "Register Android Scanner"}</div>
                  <div className="text-xs text-muted-foreground">
                    {editingId ? "Update this device's details" : "Bind a new device using its MAC address"}
                  </div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="size-8 grid place-items-center rounded-lg hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Device Name *">
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Scanner-AD01-C" className={inputCls} />
              </Field>
              <Field label="MAC Address *">
                <input required value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value.toUpperCase() })} placeholder="e.g. A4:5E:60:11:8C:23 or L30325BT00423" className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Company *">
                <select
                  value={formCompany}
                  onChange={(e) => { setFormCompany(e.target.value); setLocation(""); }}
                  className={inputCls}
                >
                  <option value="">— Select Company —</option>
                  {companies.map((co) => (
                    <option key={co.id} value={co.code}>{co.code} — {co.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Project / Camp Location *">
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className={inputCls}
                  disabled={!formCompany}
                >
                  <option value="">{formCompany ? "— Select Project or Camp —" : "— Select a company first —"}</option>
                  {formProjects.length > 0 && (
                    <optgroup label="Projects">
                      {formProjects.map((p) => <option key={`p-${p.id}`} value={`p:${p.code}`}>{p.code} — {p.name}</option>)}
                    </optgroup>
                  )}
                  {formCamps.length > 0 && (
                    <optgroup label="Camp Locations">
                      {formCamps.map((c) => <option key={`c-${c.id}`} value={`c:${c.code}`}>{c.code} — {c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </Field>
              <Field label="Model">
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Registered On">
                <input type="date" value={form.registeredOn} onChange={(e) => setForm({ ...form, registeredOn: e.target.value })} className={inputCls} />
              </Field>

              {error && (
                <div className="md:col-span-2 rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
              )}

              <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
                <button type="submit" className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-glow">
                  <Calendar className="size-4" /> {editingId ? "Save Changes" : "Register Device"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-elegant" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
              <div className="size-9 rounded-lg bg-destructive/10 text-destructive grid place-items-center">
                <Trash2 className="size-4" />
              </div>
              <div>
                <div className="font-semibold">Delete device</div>
                <div className="text-xs text-muted-foreground">This action cannot be undone</div>
              </div>
            </div>
            <div className="px-6 py-5 text-sm">
              Remove <span className="font-semibold">{deleting.name}</span>{" "}
              <span className="font-mono text-xs text-muted-foreground">({deleting.macAddress})</span> from the registry?
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setDeleting(null)} className="px-4 py-2 rounded-lg text-sm hover:bg-secondary">Cancel</button>
              <button
                onClick={confirmDelete}
                disabled={deleteDevice.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-semibold hover:opacity-95 disabled:opacity-60"
              >
                <Trash2 className="size-4" /> {deleteDevice.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

