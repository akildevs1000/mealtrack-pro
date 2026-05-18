// Type-only module shared between ReportPreview (frontend) and the server-side
// scheduler. Importing this file pulls in no runtime code, so it's safe for
// react-dom/server consumers that can't reach @/lib/hooks.

export type ReportConsumptionRow = {
  code: string; name: string; site: string; employees: number;
  breakfast: number; lunch: number; dinner: number;
  served: number; estimated: number; variance: number;
};
export type ReportCampRow = {
  code: string; name: string; site: string; employees: number;
  served: number; estimated: number; coverage: number; balance: number; duplicates: number;
  online: boolean; devicesOnline: number; devicesTotal: number;
};
export type ReportWastageRow = {
  code: string; name: string; site: string;
  estimated: number; served: number; wastage: number; pct: number;
  status: "healthy" | "watch" | "critical";
};
export type ReportScanRow = {
  id: string; time: string; date: string;
  name: string; labourId: string; camp: string;
  meal: "Breakfast" | "Lunch" | "Dinner";
  status: "Eligible" | "Already Served" | "Not Eligible" | "Wrong Camp" | "Expired";
  device?: string;
  reason?: string;
};
export type ReportEmployeeRow = {
  labourId: string; name: string; camp: string; company: string; designation: string;
  status: "Active" | "Leave" | "Vacation" | "Inactive";
  breakfast: boolean; lunch: boolean; dinner: boolean;
};

export type ReportType = "consumption" | "employee" | "scans" | "camp" | "wastage";
export type MealFilter = "All" | "Breakfast" | "Lunch" | "Dinner";

export type ReportFilters = {
  from: string;
  to: string;
  camp: string;
  meal: MealFilter;
  status: string;
  query: string;
};

export type ReportData =
  | { kind: "consumption"; rows: ReportConsumptionRow[] }
  | { kind: "camp"; rows: ReportCampRow[] }
  | { kind: "wastage"; rows: ReportWastageRow[] }
  | { kind: "scans"; rows: ReportScanRow[] }
  | { kind: "employee"; rows: ReportEmployeeRow[] };
