/**
 * React Query hooks for all backend resources.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_BASE } from "./api";

export type Role = "admin" | "operator" | "user" | "manager";
export type UserStatus = "Active" | "Inactive";

export type AppUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  assignedCampCode: string | null;
  lastLoginAt?: string | null;
};


export type Camp = {
  id: string;
  code: string;
  name: string;
  site: string;
  companyCode: string | null;
  employees: number;
  online: boolean;
  schedule: {
    breakfast: { start: string; end: string };
    lunch: { start: string; end: string };
    dinner: { start: string; end: string };
  };
};

export type Company = {
  id: string;
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  employees: number;
  active: boolean;
};

export type Project = {
  id: string;
  code: string;
  name: string;
  location: string;
  company: string;
  companyCode: string | null;
  manager: string;
  employees: number;
  active: boolean;
  // Meal windows — a project is a physical scanning site like a camp.
  schedule: {
    breakfast: { start: string; end: string };
    lunch: { start: string; end: string };
    dinner: { start: string; end: string };
  };
};

export type FoodEstimation = {
  id: string;
  date: string;
  companyCode: string;
  supplierId: string | null;
  projectCode: string | null;
  campCode: string | null;
  breakfast: number;
  lunch: number;
  dinner: number;
};

export type CmsEmployee = {
  id: string;
  company: string;
  laborId: number;
  laborCode: string;
  name: string;
  designation: string;
  grade: string | null;
  doj: string;
  campCode: string;
  campName: string;
  mealsEligibility: "Y" | "N";
  status: "Active" | "InActive" | "leave";
  effectiveDate: string | null;
  lastUpdated: string;
  /** True when a profile photo is stored on disk (false for un-photographed,
   *  Oracle-synced rows). Lets the UI skip the <img> + 404 fallback. */
  hasPhoto: boolean;
};

export type MealRecord = {
  date: string;
  breakfast: { taken: boolean; time: string | null };
  lunch: { taken: boolean; time: string | null };
  dinner: { taken: boolean; time: string | null };
};

export type Device = {
  id: string;
  name: string;
  camp: string | null;
  projectCode: string | null;
  battery: number;
  online: boolean;
  lastSync: string;
  macAddress: string;
  serial: string;
  model: string;
  androidVersion: string;
  appVersion: string;
  ipAddress: string;
  assignedTo: string;
  registeredOn: string;
};

export type Manager = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  emiratesId: string;
  // Primary camp (first assigned).
  camp: string;
  // Full set of assigned camps (includes `camp`).
  camps: string[];
  companyCode: string | null;
  cateringCompanyId: string | null;
  cateringCompanyName: string | null;
  role: "Camp Manager" | "Senior Manager" | "Supervisor";
  shift: "Morning" | "Evening" | "Full Day";
  joinDate: string;
  expiryDate: string;
  status: "Active" | "Suspended" | "Expired";
  lastLogin: string | null;
  avatar: string;
  hasPin: boolean;
  permissions: { breakfast: boolean; lunch: boolean; dinner: boolean; reports: boolean };
};

export type Scan = {
  id: string;
  time: string;
  name: string;
  labourId: string;
  camp: string;
  meal: "Breakfast" | "Lunch" | "Dinner";
  status: "Eligible" | "Already Served" | "Not Eligible" | "Wrong Camp" | "Expired";
};

export type Overview = {
  kpis: {
    totalCamps: number;
    activeEmployees: number;
    servedToday: number;
    estimatedToday: number;
    balance: number;
    duplicates: number;
    onlineDevices: number;
    totalDevices: number;
  };
  hourlyDistribution: { hour: string; breakfast: number; lunch: number; dinner: number }[];
  weeklyTrend: { day: string; served: number; estimated: number }[];
  mealSplit: { name: string; value: number }[];
  mealSessions: {
    breakfast: { served: number; estimated: number };
    lunch: { served: number; estimated: number };
    dinner: { served: number; estimated: number };
  };
  campComparison: { name: string; served: number; estimated: number }[];
};

// Camps
export function useCamps() {
  return useQuery({ queryKey: ["camps"], queryFn: () => api<Camp[]>("/camps") });
}

export function useUpsertCamp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { existingCode?: string } & Omit<Camp, "id">) => {
      const { existingCode, ...body } = input;
      return existingCode
        ? api<Camp>(`/camps/${existingCode}`, { method: "PUT", body: JSON.stringify(body) })
        : api<Camp>(`/camps`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["camps"] }),
  });
}

export function useDeleteCamp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<void>(`/camps/${code}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["camps"] }),
  });
}

// Companies
export function useCompanies() {
  return useQuery({ queryKey: ["companies"], queryFn: () => api<Company[]>("/companies") });
}

export function useUpsertCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { existingCode?: string } & Omit<Company, "id">) => {
      const { existingCode, ...body } = input;
      return existingCode
        ? api<Company>(`/companies/${existingCode}`, { method: "PUT", body: JSON.stringify(body) })
        : api<Company>(`/companies`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<void>(`/companies/${code}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

// Catering companies
export type CateringCompany = {
  id: string;
  name: string;                 // display / catering company name
  customerType: "Business" | "Individual";
  companyName: string;
  salutation: string;
  firstName: string;
  lastName: string;
  contact: string;              // legacy single contact
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
  trn: string;                  // VAT / TRN
  taxTreatment: string;
  placeOfSupply: string;
  notes: string;
  status: "Active" | "Inactive";
};

export function useCateringCompanies() {
  return useQuery({
    queryKey: ["catering-companies"],
    queryFn: () => api<CateringCompany[]>("/catering-companies"),
  });
}

export function useUpsertCateringCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string } & Omit<CateringCompany, "id">) => {
      const { id, ...body } = input;
      return id
        ? api<CateringCompany>(`/catering-companies/${id}`, { method: "PUT", body: JSON.stringify(body) })
        : api<CateringCompany>(`/catering-companies`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catering-companies"] }),
  });
}

export function useDeleteCateringCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/catering-companies/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catering-companies"] }),
  });
}

// Projects
export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/projects") });
}

export function useUpsertProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { existingCode?: string } & Omit<Project, "id">) => {
      const { existingCode, ...body } = input;
      return existingCode
        ? api<Project>(`/projects/${existingCode}`, { method: "PUT", body: JSON.stringify(body) })
        : api<Project>(`/projects`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<void>(`/projects/${code}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// Food estimations
export function useFoodEstimations(params?: { companyCode?: string; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params?.companyCode) qs.set("companyCode", params.companyCode);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const s = qs.toString();
  return useQuery({
    queryKey: ["food-estimations", params ?? {}],
    queryFn: () => api<FoodEstimation[]>(`/food-estimations${s ? `?${s}` : ""}`),
  });
}

export function useCreateFoodEstimation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<FoodEstimation, "id" | "date"> & { date?: string }) =>
      api<FoodEstimation>("/food-estimations", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["food-estimations"] }),
  });
}

// CMS employees
export type EmployeesPage = {
  rows: CmsEmployee[];
  total: number;
  page: number;
  pageSize: number;
};

export function useEmployees(params?: {
  q?: string;
  status?: string;
  campCode?: string;
  company?: string;
  page?: number;
  pageSize?: number;
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status && params.status !== "all") search.set("status", params.status);
  if (params?.campCode && params.campCode !== "all") search.set("campCode", params.campCode);
  if (params?.company && params.company !== "all") search.set("company", params.company);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return useQuery({
    queryKey: ["employees", params ?? {}],
    queryFn: () => api<EmployeesPage>(`/employees${qs ? `?${qs}` : ""}`),
    // Keep showing the previous page while the next one loads — no flicker.
    placeholderData: (prev) => prev,
  });
}

export type EmployeesMeta = {
  counts: { total: number; active: number; inactive: number; leave: number };
  camps: { code: string; name: string }[];
};

/** Roster facets (status counts + distinct camp codes) for the Employees page. */
export function useEmployeesMeta() {
  return useQuery({
    queryKey: ["employees", "meta"],
    queryFn: () => api<EmployeesMeta>("/employees/meta"),
  });
}

export type EmployeeImportRow = {
  company: string;
  laborId: number;
  laborCode: string;
  name: string;
  designation: string;
  grade?: string | null;
  doj: string;             // YYYY-MM-DD
  campCode: string;
  campName: string;
  mealsEligibility: "Y" | "N";
  status: "Active" | "InActive" | "leave";
  /** EFECTIVE_DATE in the source workbook — meal-eligibility expiry. */
  effectiveDate: string | null;
};

export function useImportEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: EmployeeImportRow[]) =>
      api<{ deleted: number; inserted: number }>("/employees/import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

/** Fields the user may edit from the Employees page. `laborId` keys the row. */
export type EmployeeUpdate = {
  company: string;
  laborId: number;
  laborCode: string;
  name: string;
  designation: string;
  doj: string; // YYYY-MM-DD
  campCode: string;
  campName: string;
  mealsEligibility: "Y" | "N";
  status: "Active" | "InActive" | "leave";
  effectiveDate: string | null;
};

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (emp: EmployeeUpdate) =>
      api<CmsEmployee>(`/employees/${emp.laborId}`, {
        method: "PUT",
        // The server stamps lastUpdated itself, but the schema requires it.
        body: JSON.stringify({ ...emp, lastUpdated: new Date().toISOString().slice(0, 10) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

/**
 * Public URL of an employee's profile photo (served from disk by the backend,
 * keyed on laborCode). Usable directly in `<img src>`. Returns 404 when no
 * photo is uploaded — render with an onError fallback to initials.
 */
export function employeePhotoUrl(laborCode: string): string {
  return `${API_BASE}/employees/photo/${encodeURIComponent(laborCode)}`;
}

/**
 * Photo URL for the printable access card: the live Oracle CMS EMP_PHOTO if the
 * backend can reach Oracle, falling back server-side to a manually-uploaded disk
 * photo, else 404. Usable directly in `<img src>` — render with an onError
 * fallback to the placeholder icon.
 */
export function employeeCardPhotoUrl(laborCode: string): string {
  return `${API_BASE}/employees/${encodeURIComponent(laborCode)}/cms-photo`;
}

/** Upload/replace an employee's profile photo. `dataUrl` is a base64 data URL. */
export function useSetEmployeePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ laborCode, dataUrl }: { laborCode: string; dataUrl: string }) =>
      api<{ ok: boolean }>(`/employees/photo/${encodeURIComponent(laborCode)}`, {
        method: "PUT",
        body: JSON.stringify({ dataUrl }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

/** Remove an employee's profile photo. */
export function useDeleteEmployeePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (laborCode: string) =>
      api<void>(`/employees/photo/${encodeURIComponent(laborCode)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useEmployeeMeals(laborId: number | null, from: string, to: string) {
  return useQuery({
    queryKey: ["employee-meals", laborId, from, to],
    queryFn: () =>
      api<{ employee: CmsEmployee; records: MealRecord[] }>(
        `/employees/${laborId}/meals?from=${from}&to=${to}`,
      ),
    enabled: !!laborId,
  });
}

// Devices
export function useDevices() {
  return useQuery({ queryKey: ["devices"], queryFn: () => api<Device[]>("/devices") });
}

export type DeviceInput = {
  name: string;
  campCode: string | null;
  projectCode: string | null;
  battery: number;
  online: boolean;
  macAddress: string;
  serial: string;
  model: string;
  androidVersion: string;
  appVersion: string;
  ipAddress: string;
  assignedTo: string;
  registeredOn: string;
};

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeviceInput) =>
      api<Device>("/devices", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DeviceInput }) =>
      api<Device>(`/devices/${id}`, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
}

// Managers
export function useManagers() {
  return useQuery({ queryKey: ["managers"], queryFn: () => api<Manager[]>("/managers") });
}

export type ManagerInput = {
  name: string;
  username: string;
  password?: string;
  // Mobile-app PIN (4–12 digits). "" or null clears; undefined leaves unchanged on update.
  pin?: string | null;
  email: string;
  phone: string;
  emiratesId: string;
  // One or more camps; campCodes[0] becomes the primary camp.
  campCodes: string[];
  companyCode?: string | null;
  cateringCompanyId?: string | null;
  role: "Camp Manager" | "Senior Manager" | "Supervisor";
  shift: "Morning" | "Evening" | "Full Day";
  joinDate: string;
  expiryDate: string;
  status: "Active" | "Suspended" | "Expired";
  permissions: { breakfast: boolean; lunch: boolean; dinner: boolean; reports: boolean };
};

function packManager(input: ManagerInput) {
  return {
    name: input.name,
    username: input.username,
    password: input.password,
    pin: input.pin,
    email: input.email,
    phone: input.phone,
    emiratesId: input.emiratesId,
    campCodes: input.campCodes,
    companyCode: input.companyCode ?? null,
    cateringCompanyId: input.cateringCompanyId ?? null,
    role: input.role === "Camp Manager" ? "CampManager"
        : input.role === "Senior Manager" ? "SeniorManager" : "Supervisor",
    shift: input.shift === "Full Day" ? "FullDay" : input.shift,
    joinDate: input.joinDate,
    expiryDate: input.expiryDate,
    status: input.status,
    permBreakfast: input.permissions.breakfast,
    permLunch: input.permissions.lunch,
    permDinner: input.permissions.dinner,
    permReports: input.permissions.reports,
  };
}

export function useCreateManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManagerInput) =>
      api<Manager>("/managers", { method: "POST", body: JSON.stringify(packManager(input)) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managers"] }),
  });
}

export function useUpdateManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & ManagerInput) => {
      const body: any = packManager(input);
      delete body.password; // PUT doesn't accept password
      // Drop pin if the caller didn't explicitly set/clear it — preserves the existing hash.
      if (body.pin === undefined) delete body.pin;
      return api<Manager>(`/managers/${id}`, { method: "PUT", body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managers"] }),
  });
}

export function useDeleteManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/managers/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managers"] }),
  });
}

export function useToggleManagerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "Active" | "Suspended" | "Expired" }) =>
      api<Manager>(`/managers/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managers"] }),
  });
}

// App users (admin only)
export function useAppUsers() {
  return useQuery({ queryKey: ["app-users"], queryFn: () => api<AppUser[]>("/users") });
}

export function useCreateAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AppUser> & { password: string }) =>
      api<AppUser>("/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

export function useUpdateAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<AppUser> & { password?: string }) =>
      api<AppUser>(`/users/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

export function useToggleAppUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      api<{ id: string; status: UserStatus }>(`/users/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

export function useDeleteAppUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-users"] }),
  });
}

// Role permissions
export type Perm = { view: boolean; edit: boolean; delete: boolean };
export type RolePermsMatrix = Record<Role, Record<string, Perm>>;

export function usePermissions() {
  return useQuery({
    queryKey: ["permissions"],
    queryFn: () => api<RolePermsMatrix>("/users/permissions/all"),
  });
}

export function useSetPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { role: Role; tab: string } & Perm) =>
      api(`/users/permissions/one`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permissions"] }),
  });
}

// Scans
export function useScans(limit = 50) {
  return useQuery({
    queryKey: ["scans", limit],
    queryFn: () => api<Scan[]>(`/scans?limit=${limit}`),
  });
}

// ---------------- Reports ----------------

// Row types are defined in the neutral types file so the server-side renderer
// can import them without dragging in this hooks module's React Query deps.
export type {
  ReportConsumptionRow,
  ReportScanRow,
} from "@/components/app/report-preview-types";

import type {
  ReportConsumptionRow,
  ReportScanRow,
} from "@/components/app/report-preview-types";

type ReportRange<T> = { from: string; to: string; days: number; rows: T[] };

function reportQs(p: Record<string, string | undefined>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") s.set(k, v);
  }
  const out = s.toString();
  return out ? `?${out}` : "";
}

export function useReportConsumption(p: { from: string; to: string; campCode?: string; companyCode?: string }) {
  return useQuery({
    queryKey: ["reports", "consumption", p],
    queryFn: () => api<ReportRange<ReportConsumptionRow>>(`/reports/consumption${reportQs(p)}`),
  });
}
export function useReportScans(p: {
  from: string; to: string; campCode?: string; companyCode?: string; meal?: string; status?: string; q?: string;
}) {
  return useQuery({
    queryKey: ["reports", "scans", p],
    queryFn: () => api<ReportScanRow[]>(`/reports/scans${reportQs(p)}`),
  });
}
// ---------------- Integrated Reports Suite (5 components) ----------------
export type DailyDistRow = {
  company: string; employeeId: string; name: string;
  breakfast: string; lunch: string; dinner: string;
};
export function useReportDailyDistribution(p: { date: string; companyCode?: string; campCode?: string }) {
  return useQuery({
    queryKey: ["reports", "daily-distribution", p],
    queryFn: () => api<{ date: string; rows: DailyDistRow[] }>(`/reports/daily-distribution${reportQs(p)}`),
  });
}

type MealTriple = { breakfast: number; lunch: number; dinner: number };
export type BySupplierData = {
  suppliers: { id: string; name: string }[];
  rows: { date: string; perSupplier: Record<string, MealTriple>; totals: MealTriple; avgPerDay: number }[];
};
export function useReportBySupplier(p: { from: string; to: string; companyCode?: string; campCode?: string; supplierId?: string }) {
  return useQuery({
    queryKey: ["reports", "by-supplier", p],
    queryFn: () => api<BySupplierData>(`/reports/by-supplier${reportQs(p)}`),
  });
}

export type ByLocationRow = { date: string; location: string; locationName: string } & MealTriple;
export function useReportByLocation(p: { from: string; to: string; companyCode?: string; campCode?: string }) {
  return useQuery({
    queryKey: ["reports", "by-location", p],
    queryFn: () => api<{ rows: ByLocationRow[] }>(`/reports/by-location${reportQs(p)}`),
  });
}

export type ComparisonRow = {
  date: string; supplier: string; site: string; meal: string;
  requestedYesterday: number | null; requestedToday: number;
  variance: number | null; pctChange: number | null;
};
export function useReportRequestComparison(p: { from: string; to: string; companyCode?: string; supplierId?: string }) {
  return useQuery({
    queryKey: ["reports", "request-comparison", p],
    queryFn: () => api<{ rows: ComparisonRow[] }>(`/reports/request-comparison${reportQs(p)}`),
  });
}

export type DuplicateRow = {
  workerId: string; actualLocation: string; scanLocation: string;
  status: string; severity: "duplicate" | "ineligible"; reason: string;
  meal: string; date: string; time: string;
};
export function useReportDuplicateEligibility(p: { from: string; to: string; companyCode?: string; campCode?: string }) {
  return useQuery({
    queryKey: ["reports", "duplicate-eligibility", p],
    queryFn: () => api<{ from: string; to: string; rows: DuplicateRow[] }>(`/reports/duplicate-eligibility${reportQs(p)}`),
  });
}

// Overview / dashboard. Pass a camp code to narrow to one camp and/or a company
// code to narrow to that parent company's camps (Camp is a sibling of Company).
export function useOverview(campCode?: string | null, companyCode?: string | null) {
  const params = new URLSearchParams();
  if (campCode) params.set("campCode", campCode);
  if (companyCode) params.set("companyCode", companyCode);
  const qs = params.toString();
  return useQuery({
    queryKey: ["overview", campCode ?? "all", companyCode ?? "all"],
    queryFn: () => api<Overview>(`/overview${qs ? `?${qs}` : ""}`),
  });
}

// ---------------- Scheduled reports + FTP config ----------------

export type ScheduleReportType =
  | "dailyTransaction" | "bySupplier" | "byLocation" | "requestComparison" | "duplicateEligibility";
export type ScheduleFormat = "pdf" | "excel" | "both";
export type ScheduleFrequency = "daily" | "weekly" | "monthly";
export type ScheduleDestination = "email" | "ftp";
export type ScheduleRunStatus = "success" | "failed";

export type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  reportType: ScheduleReportType;
  format: ScheduleFormat;
  frequency: ScheduleFrequency;
  time: string;
  weekday: number | null;
  dayOfMonth: number | null;
  destination: ScheduleDestination;
  recipientIds: string[];
  recipientEmails: string[];
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: ScheduleRunStatus | null;
  lastRunDetail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleInput = Omit<
  Schedule,
  "id" | "createdAt" | "updatedAt" | "nextRunAt" | "lastRunAt" | "lastRunStatus" | "lastRunDetail"
>;

export type FtpConfigView = {
  host: string;
  port: number;
  user: string;
  hasPassword: boolean;
  remotePath: string;
  secure: boolean;
  updatedAt: string;
} | null;

export type FtpConfigInput = {
  host: string;
  port: number;
  user: string;
  password: string;
  remotePath: string;
  secure?: boolean;
};

export function useSchedules() {
  return useQuery({ queryKey: ["schedules"], queryFn: () => api<Schedule[]>("/schedules") });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ScheduleInput) =>
      api<Schedule>("/schedules", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<ScheduleInput>) =>
      api<Schedule>(`/schedules/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useRunSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean; detail: string; uploaded?: { name: string; bytes: number }[] }>(
        `/schedules/${id}/run`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });
}

export function useFtpConfig() {
  return useQuery({ queryKey: ["ftp-config"], queryFn: () => api<FtpConfigView>("/ftp-config") });
}

export function useSaveFtpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FtpConfigInput) =>
      api<FtpConfigView>("/ftp-config", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ftp-config"] }),
  });
}

export function useDeleteFtpConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>("/ftp-config", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ftp-config"] }),
  });
}

export type MailConfigView = {
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
  secure: boolean;
  fromName: string;
  fromEmail: string;
  updatedAt: string;
} | null;

export type MailConfigInput = {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  fromName: string;
  fromEmail: string;
};

export function useMailConfig() {
  return useQuery({ queryKey: ["mail-config"], queryFn: () => api<MailConfigView>("/mail-config") });
}

export function useSaveMailConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MailConfigInput) =>
      api<MailConfigView>("/mail-config", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-config"] }),
  });
}

export function useDeleteMailConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>("/mail-config", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-config"] }),
  });
}

export type CmsSyncSummary = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  fetched: number;
  created: number;
  updated: number;
  skipped: number;
  stale: number;
  staleDeactivated?: number;
  campsCreated?: number;
  companiesCreated?: number;
  error?: string;
};

export type CmsSyncStatus = {
  configured: boolean;
  enabled: boolean;
  intervalMin: number;
  running: boolean;
  lastRun: CmsSyncSummary | null;
};

export function useCmsSyncStatus() {
  return useQuery({
    queryKey: ["cms-sync"],
    queryFn: () => api<CmsSyncStatus>("/cms-sync"),
    // Poll fast while a sync is in flight so the card updates live.
    refetchInterval: (q) => (q.state.data?.running ? 3_000 : 60_000),
  });
}

export function useRunCmsSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<CmsSyncSummary>("/cms-sync/run", { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["cms-sync"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}
