import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Smartphone, Wifi, WifiOff, BatteryLow, Plus, Search, Copy, Check, X, Cpu, User, Calendar } from "lucide-react";
import { useCampScope } from "@/lib/session";
import { useCamps, useCompanies, useDevices, useManagers, useProjects, useCreateDevice, type Device } from "@/lib/hooks";

export const Route = createFileRoute("/devices")({
  component: DevicesPage,
});

type FormState = Omit<Device, "id" | "lastSync" | "online">;

const initialForm = (): FormState => ({
  name: "", camp: null, projectCode: null, battery: 100, macAddress: "", serial: "",
  model: "Zebra TC22", androidVersion: "Android 13", appVersion: "MyMeals 4.2.1",
  ipAddress: "", assignedTo: "", registeredOn: new Date().toISOString().slice(0, 10),
});

const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

function DevicesPage() {
  const scope = useCampScope();
  const { data: camps = [] } = useCamps();
  const { data: companies = [] } = useCompanies();
  const { data: projects = [] } = useProjects();
  const { data: suppliers = [] } = useManagers();
  const { data: list = [] } = useDevices();
  const createDevice = useCreateDevice();
  const [query, setQuery] = useState("");
  const [campFilter, setCampFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  // Camps are siblings of the Company, so a device's company is its camp's
  // company. Build the set of camp codes for the selected company.
  const companyCampCodes = useMemo(
    () => new Set(camps.filter((c) => c.companyCode === companyFilter).map((c) => c.code)),
    [camps, companyFilter],
  );
  const visibleCamps = useMemo(() => {
    let cs = scope ? camps.filter((c) => scope.includes(c.code)) : camps;
    if (companyFilter !== "all") cs = cs.filter((c) => c.companyCode === companyFilter);
    return cs;
  }, [scope, camps, companyFilter]);
  const visibleProjects = useMemo(
    () => (companyFilter === "all" ? projects : projects.filter((p) => p.companyCode === companyFilter)),
    [projects, companyFilter],
  );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm());
  // Merged Camp/Project picker value: "c:<code>" (camp), "p:<code>" (project), or "".
  const [location, setLocation] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const scoped = scope ? list.filter((d) => scope.includes(d.camp ?? "")) : list;
    return scoped.filter((d) => {
      if (companyFilter !== "all" && !companyCampCodes.has(d.camp ?? "")) return false;
      if (campFilter !== "all" && d.camp !== campFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.macAddress.toLowerCase().includes(q) ||
        d.serial.toLowerCase().includes(q) ||
        d.assignedTo.toLowerCase().includes(q)
      );
    });
  }, [list, query, campFilter, companyFilter, companyCampCodes, scope]);

  const stats = useMemo(() => ({
    total: list.length,
    online: list.filter((d) => d.online).length,
    offline: list.filter((d) => !d.online).length,
    lowBattery: list.filter((d) => d.battery < 20).length,
  }), [list]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!macRegex.test(form.macAddress)) {
      setError("MAC address must be in format AA:BB:CC:11:22:33");
      return;
    }
    if (list.some((d) => d.macAddress.toLowerCase() === form.macAddress.toLowerCase())) {
      setError("This MAC address is already registered.");
      return;
    }
    const campCode = location.startsWith("c:") ? location.slice(2) : null;
    const projectCode = location.startsWith("p:") ? location.slice(2) : null;
    if (!form.name || (!campCode && !projectCode)) {
      setError("Device name and a camp or project are required.");
      return;
    }
    try {
      await createDevice.mutateAsync({
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
      });
      setForm(initialForm());
      setLocation("");
      setError(null);
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to register device");
    }
  }

  // Derived from the merged location picker. Suppliers filter by the chosen
  // camp; when a project is picked there's no camp, so we fall back to all
  // suppliers (a project isn't camp-scoped).
  const selectedCampCode = location.startsWith("c:") ? location.slice(2) : "";
  const isProjectPicked = location.startsWith("p:");
  const supplierOptions = selectedCampCode
    ? suppliers.filter((s) => (s.camps?.length ? s.camps : [s.camp]).includes(selectedCampCode))
    : isProjectPicked
      ? suppliers
      : [];

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
            setForm(initialForm());
            setLocation(visibleCamps[0] ? `c:${visibleCamps[0].code}` : "");
            setOpen(true);
            setError(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-glow hover:opacity-95 transition"
        >
          <Plus className="size-4" /> Register Device
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Smartphone className="size-4" />} label="Total Devices" value={stats.total} tone="primary" />
        <StatCard icon={<Wifi className="size-4" />} label="Online" value={stats.online} tone="success" />
        <StatCard icon={<WifiOff className="size-4" />} label="Offline" value={stats.offline} tone="muted" />
        <StatCard icon={<BatteryLow className="size-4" />} label="Low Battery" value={stats.lowBattery} tone="warning" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, MAC, serial, owner…"
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
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="size-3" /> {d.assignedTo}
                        </div>
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
                    <div className="text-xs">{d.model} • {d.androidVersion}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">{d.camp ?? d.projectCode ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{d.registeredOn}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">No devices match these filters.</td>
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
                  <div className="font-semibold">Register Android Scanner</div>
                  <div className="text-xs text-muted-foreground">Bind a new device using its MAC address</div>
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
                <input required value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value.toUpperCase() })} placeholder="A4:5E:60:11:8C:23" className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Project / Camp Location *">
                <select
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); setForm({ ...form, assignedTo: "" }); }}
                  className={inputCls}
                >
                  <option value="">— Select Project or Camp —</option>
                  {visibleProjects.length > 0 && (
                    <optgroup label="Projects">
                      {visibleProjects.map((p) => <option key={`p-${p.id}`} value={`p:${p.code}`}>{p.code} — {p.name}</option>)}
                    </optgroup>
                  )}
                  {visibleCamps.length > 0 && (
                    <optgroup label="Camp Locations">
                      {visibleCamps.map((c) => <option key={`c-${c.id}`} value={`c:${c.code}`}>{c.code} — {c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </Field>
              <Field label="Model">
                <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Android Version">
                <select value={form.androidVersion} onChange={(e) => setForm({ ...form, androidVersion: e.target.value })} className={inputCls}>
                  {["Android 7", "Android 8", "Android 9", "Android 10", "Android 11", "Android 12", "Android 13", "Android 14", "Android 15"].map((v) => <option key={v}>{v}</option>)}
                </select>
              </Field>
              <Field label="Assigned To (Supplier)">
                <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className={inputCls}>
                  <option value="">{location ? "— Select supplier —" : "Select a location first"}</option>
                  {supplierOptions.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
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
                  <Calendar className="size-4" /> Register Device
                </button>
              </div>
            </form>
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

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "primary" | "success" | "muted" | "warning" }) {
  const toneCls = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-warning/10 text-warning",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={`size-10 rounded-lg grid place-items-center ${toneCls}`}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
