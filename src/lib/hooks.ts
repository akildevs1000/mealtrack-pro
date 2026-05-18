/**
 * React Query hooks for all backend resources.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

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
  employees: number;
  online: boolean;
  schedule: {
    breakfast: { start: string; end: string };
    lunch: { start: string; end: string };
    dinner: { start: string; end: string };
  };
};

export type CmsEmployee = {
  id: string;
  company: string;
  laborId: number;
  laborCode: string;
  name: string;
  designation: string;
  doj: string;
  campCode: string;
  campName: string;
  mealsEligibility: "Y" | "N";
  status: "Active" | "InActive" | "leave";
  effectiveDate: string | null;
  lastUpdated: string;
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
  camp: string;
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
  camp: string;
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

// CMS employees
export function useEmployees(params?: {
  q?: string;
  status?: string;
  campCode?: string;
}) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.status) search.set("status", params.status);
  if (params?.campCode) search.set("campCode", params.campCode);
  const qs = search.toString();
  return useQuery({
    queryKey: ["employees", params ?? {}],
    queryFn: () => api<CmsEmployee[]>(`/employees${qs ? `?${qs}` : ""}`),
  });
}

export type EmployeeImportRow = {
  company: string;
  laborId: number;
  laborCode: string;
  name: string;
  designation: string;
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
  campCode: string;
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
  campCode: string;
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
    campCode: input.campCode,
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
  ReportCampRow,
  ReportWastageRow,
  ReportScanRow,
  ReportEmployeeRow,
} from "@/components/app/report-preview-types";

import type {
  ReportConsumptionRow,
  ReportCampRow,
  ReportWastageRow,
  ReportScanRow,
  ReportEmployeeRow,
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

export function useReportConsumption(p: { from: string; to: string; campCode?: string }) {
  return useQuery({
    queryKey: ["reports", "consumption", p],
    queryFn: () => api<ReportRange<ReportConsumptionRow>>(`/reports/consumption${reportQs(p)}`),
  });
}
export function useReportCamps(p: { from: string; to: string; campCode?: string }) {
  return useQuery({
    queryKey: ["reports", "camps", p],
    queryFn: () => api<ReportRange<ReportCampRow>>(`/reports/camps${reportQs(p)}`),
  });
}
export function useReportWastage(p: { from: string; to: string; campCode?: string }) {
  return useQuery({
    queryKey: ["reports", "wastage", p],
    queryFn: () => api<ReportRange<ReportWastageRow>>(`/reports/wastage${reportQs(p)}`),
  });
}
export function useReportScans(p: {
  from: string; to: string; campCode?: string; meal?: string; status?: string; q?: string;
}) {
  return useQuery({
    queryKey: ["reports", "scans", p],
    queryFn: () => api<ReportScanRow[]>(`/reports/scans${reportQs(p)}`),
  });
}
export function useReportEmployees(p: { campCode?: string; status?: string; q?: string }) {
  return useQuery({
    queryKey: ["reports", "employees", p],
    queryFn: () => api<ReportEmployeeRow[]>(`/reports/employees${reportQs(p)}`),
  });
}

// Overview / dashboard. Pass a camp code to narrow the dashboard to one camp.
export function useOverview(campCode?: string | null) {
  const qs = campCode ? `?campCode=${encodeURIComponent(campCode)}` : "";
  return useQuery({
    queryKey: ["overview", campCode ?? "all"],
    queryFn: () => api<Overview>(`/overview${qs}`),
  });
}

// ---------------- Scheduled reports + FTP config ----------------

export type ScheduleReportType = "consumption" | "employee" | "scans" | "camp" | "wastage";
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
