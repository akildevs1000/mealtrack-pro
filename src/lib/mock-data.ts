export type MealWindow = { start: string; end: string };
export type MealSchedule = { breakfast: MealWindow; lunch: MealWindow; dinner: MealWindow };
export type Camp = {
  id: string; code: string; name: string; site: string; employees: number; online: boolean;
  schedule: MealSchedule;
};

export const defaultSchedule: MealSchedule = {
  breakfast: { start: "05:30", end: "08:30" },
  lunch: { start: "11:30", end: "14:00" },
  dinner: { start: "18:30", end: "21:30" },
};

export const camps: Camp[] = [
  { id: "c1", code: "AD-01", name: "Al Reem Camp", site: "Reem Tower Project", employees: 1240, online: true,
    schedule: { breakfast: { start: "05:30", end: "08:30" }, lunch: { start: "12:00", end: "14:00" }, dinner: { start: "18:30", end: "21:30" } } },
  { id: "c2", code: "DXB-04", name: "Marina Workers Village", site: "Marina Heights", employees: 980, online: true,
    schedule: { breakfast: { start: "06:00", end: "09:00" }, lunch: { start: "12:30", end: "14:30" }, dinner: { start: "19:00", end: "22:00" } } },
  { id: "c3", code: "SHJ-02", name: "Sharjah Industrial Camp", site: "Industrial Park 7", employees: 1560, online: true,
    schedule: { breakfast: { start: "05:00", end: "08:00" }, lunch: { start: "11:30", end: "13:30" }, dinner: { start: "18:00", end: "21:00" } } },
  { id: "c4", code: "AUH-09", name: "Mussafah Labour Camp", site: "Mussafah Bridge", employees: 2110, online: false,
    schedule: { breakfast: { start: "05:30", end: "08:30" }, lunch: { start: "12:00", end: "14:00" }, dinner: { start: "19:00", end: "22:00" } } },
  { id: "c5", code: "RAK-01", name: "Al Hamra Camp", site: "Al Hamra Mall Ext.", employees: 740, online: true,
    schedule: { breakfast: { start: "06:00", end: "08:30" }, lunch: { start: "12:00", end: "13:30" }, dinner: { start: "18:30", end: "21:00" } } },
  { id: "c6", code: "AJM-03", name: "Ajman Central Camp", site: "Corniche Towers", employees: 1320, online: true,
    schedule: { breakfast: { start: "05:45", end: "08:45" }, lunch: { start: "12:15", end: "14:15" }, dinner: { start: "18:45", end: "21:45" } } },
];

export const kpis = {
  totalCamps: camps.length,
  activeEmployees: 7950,
  servedToday: 18420,
  estimatedToday: 22340,
  balance: 3920,
  duplicates: 47,
  onlineDevices: 38,
  totalDevices: 42,
};

export const hourlyDistribution = [
  { hour: "5AM", breakfast: 120, lunch: 0, dinner: 0 },
  { hour: "6AM", breakfast: 480, lunch: 0, dinner: 0 },
  { hour: "7AM", breakfast: 1840, lunch: 0, dinner: 0 },
  { hour: "8AM", breakfast: 920, lunch: 0, dinner: 0 },
  { hour: "11AM", breakfast: 0, lunch: 360, dinner: 0 },
  { hour: "12PM", breakfast: 0, lunch: 2240, dinner: 0 },
  { hour: "1PM", breakfast: 0, lunch: 1680, dinner: 0 },
  { hour: "2PM", breakfast: 0, lunch: 540, dinner: 0 },
  { hour: "6PM", breakfast: 0, lunch: 0, dinner: 820 },
  { hour: "7PM", breakfast: 0, lunch: 0, dinner: 2640 },
  { hour: "8PM", breakfast: 0, lunch: 0, dinner: 1920 },
  { hour: "9PM", breakfast: 0, lunch: 0, dinner: 410 },
];

export const weeklyTrend = [
  { day: "Mon", served: 21240, estimated: 22100 },
  { day: "Tue", served: 21680, estimated: 22300 },
  { day: "Wed", served: 20940, estimated: 22000 },
  { day: "Thu", served: 22110, estimated: 22500 },
  { day: "Fri", served: 19820, estimated: 21800 },
  { day: "Sat", served: 18420, estimated: 22340 },
  { day: "Sun", served: 0, estimated: 22200 },
];

export const mealSplit = [
  { name: "Breakfast", value: 5240, color: "var(--chart-3)" },
  { name: "Lunch", value: 7820, color: "var(--chart-1)" },
  { name: "Dinner", value: 5360, color: "var(--chart-2)" },
];

export const campComparison = camps.map((c) => ({
  name: c.code,
  served: Math.round(c.employees * (2 + Math.random())),
  estimated: Math.round(c.employees * 2.7),
}));

export type Scan = {
  id: string;
  time: string;
  name: string;
  labourId: string;
  camp: string;
  meal: "Breakfast" | "Lunch" | "Dinner";
  status: "Eligible" | "Already Served" | "Not Eligible" | "Wrong Camp" | "Expired";
};

export const recentScans: Scan[] = [
  { id: "s1", time: "12:42:08", name: "Mohammed Rafiq", labourId: "LB-22481", camp: "AD-01", meal: "Lunch", status: "Eligible" },
  { id: "s2", time: "12:42:01", name: "Suresh Kumar", labourId: "LB-19022", camp: "DXB-04", meal: "Lunch", status: "Eligible" },
  { id: "s3", time: "12:41:55", name: "Anwar Hussain", labourId: "LB-31108", camp: "SHJ-02", meal: "Lunch", status: "Already Served" },
  { id: "s4", time: "12:41:40", name: "Ramesh Babu", labourId: "LB-44012", camp: "AUH-09", meal: "Lunch", status: "Eligible" },
  { id: "s5", time: "12:41:22", name: "Bilal Ahmed", labourId: "LB-29980", camp: "AD-01", meal: "Lunch", status: "Wrong Camp" },
  { id: "s6", time: "12:41:09", name: "Vinod Sharma", labourId: "LB-12245", camp: "RAK-01", meal: "Lunch", status: "Eligible" },
  { id: "s7", time: "12:40:51", name: "Iqbal Khan", labourId: "LB-55981", camp: "AJM-03", meal: "Lunch", status: "Not Eligible" },
  { id: "s8", time: "12:40:33", name: "Tariq Mahmood", labourId: "LB-77821", camp: "DXB-04", meal: "Lunch", status: "Eligible" },
];

export type Employee = {
  id: string; labourId: string; name: string; camp: string; company: string;
  designation: string; status: "Active" | "Leave" | "Vacation" | "Inactive";
  breakfast: boolean; lunch: boolean; dinner: boolean;
};

export const employees: Employee[] = Array.from({ length: 24 }).map((_, i) => {
  const c = camps[i % camps.length];
  const statuses: Employee["status"][] = ["Active", "Active", "Active", "Leave", "Vacation", "Inactive"];
  return {
    id: `e${i}`,
    labourId: `LB-${20000 + i * 137}`,
    name: ["Mohammed Rafiq","Suresh Kumar","Anwar Hussain","Ramesh Babu","Bilal Ahmed","Vinod Sharma","Iqbal Khan","Tariq Mahmood","Sanjay Patel","Imran Sheikh","Ravi Verma","Karim Aslam"][i % 12] + (i > 11 ? " " + (i - 11) : ""),
    camp: c.code,
    company: ["Al Futtaim Construction","Arabtec","ALEC","Khansaheb"][i % 4],
    designation: ["Mason","Carpenter","Steel Fixer","Electrician","Plumber","Helper"][i % 6],
    status: statuses[i % statuses.length],
    breakfast: i % 7 !== 0,
    lunch: true,
    dinner: i % 5 !== 0,
  };
});

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

export const devices: Device[] = [
  { id: "d1", name: "Scanner-AD01-A", camp: "AD-01", battery: 86, online: true, lastSync: "2s ago", macAddress: "A4:5E:60:11:8C:21", serial: "ZBR-AD01A-7781", model: "Zebra TC22", androidVersion: "Android 13", appVersion: "MyMeals 4.2.1", ipAddress: "10.42.10.21", assignedTo: "Ahmed Al Mansouri", registeredOn: "2024-02-14" },
  { id: "d2", name: "Scanner-AD01-B", camp: "AD-01", battery: 42, online: true, lastSync: "8s ago", macAddress: "A4:5E:60:11:8C:22", serial: "ZBR-AD01B-7782", model: "Zebra TC22", androidVersion: "Android 13", appVersion: "MyMeals 4.2.1", ipAddress: "10.42.10.22", assignedTo: "Ahmed Al Mansouri", registeredOn: "2024-02-14" },
  { id: "d3", name: "Scanner-DXB04", camp: "DXB-04", battery: 71, online: true, lastSync: "4s ago", macAddress: "B8:27:EB:44:19:7C", serial: "HON-DXB04-3320", model: "Honeywell EDA52", androidVersion: "Android 12", appVersion: "MyMeals 4.2.0", ipAddress: "10.44.20.11", assignedTo: "Rajesh Pillai", registeredOn: "2023-11-02" },
  { id: "d4", name: "Scanner-SHJ02-A", camp: "SHJ-02", battery: 58, online: true, lastSync: "12s ago", macAddress: "DC:A6:32:8E:55:01", serial: "ZBR-SHJ02A-9120", model: "Zebra MC2200", androidVersion: "Android 11", appVersion: "MyMeals 4.1.8", ipAddress: "10.46.30.31", assignedTo: "Khalid Al Suwaidi", registeredOn: "2023-09-21" },
  { id: "d5", name: "Scanner-AUH09-A", camp: "AUH-09", battery: 12, online: false, lastSync: "14m ago", macAddress: "F0:18:98:21:AC:55", serial: "SAM-AUH09A-1145", model: "Samsung XCover 6 Pro", androidVersion: "Android 13", appVersion: "MyMeals 4.2.1", ipAddress: "10.48.40.12", assignedTo: "Imran Sheikh", registeredOn: "2022-12-08" },
  { id: "d6", name: "Scanner-RAK01", camp: "RAK-01", battery: 94, online: true, lastSync: "1s ago", macAddress: "3C:5A:B4:77:09:E2", serial: "HON-RAK01-5560", model: "Honeywell CT30 XP", androidVersion: "Android 13", appVersion: "MyMeals 4.2.1", ipAddress: "10.50.50.10", assignedTo: "Fatima Al Hosani", registeredOn: "2024-04-03" },
  { id: "d7", name: "Scanner-AJM03", camp: "AJM-03", battery: 67, online: true, lastSync: "6s ago", macAddress: "00:1A:7D:DA:71:13", serial: "ZBR-AJM03-2244", model: "Zebra TC52", androidVersion: "Android 12", appVersion: "MyMeals 4.2.0", ipAddress: "10.52.60.18", assignedTo: "Bilal Ahmed", registeredOn: "2023-06-19" },
];

export const forecast7d = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => ({
  day: d,
  breakfast: 6800 + Math.round(Math.sin(i) * 300),
  lunch: 8400 + Math.round(Math.cos(i) * 350),
  dinner: 7100 + Math.round(Math.sin(i + 1) * 280),
}));

export type CampManager = {
  id: string;
  name: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  emiratesId: string;
  camp: string;
  role: "Camp Manager" | "Senior Manager" | "Supervisor";
  shift: "Morning" | "Evening" | "Full Day";
  joinDate: string;
  expiryDate: string;
  status: "Active" | "Suspended" | "Expired";
  lastLogin: string;
  avatar: string;
  permissions: { breakfast: boolean; lunch: boolean; dinner: boolean; reports: boolean };
};

const today = new Date();
const addDays = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const campManagers: CampManager[] = [
  {
    id: "m1", name: "Ahmed Al Mansouri", username: "ahmed.mansouri", password: "Ad@2025!Reem",
    email: "ahmed.m@mealops.ae", phone: "+971 50 442 8821", emiratesId: "784-1988-2237811-3",
    camp: "AD-01", role: "Camp Manager", shift: "Full Day",
    joinDate: "2023-03-12", expiryDate: addDays(184), status: "Active", lastLogin: "2 min ago",
    avatar: "AM", permissions: { breakfast: true, lunch: true, dinner: true, reports: true },
  },
  {
    id: "m2", name: "Rajesh Pillai", username: "rajesh.pillai", password: "Mar!na#0420",
    email: "rajesh.p@mealops.ae", phone: "+971 55 119 7733", emiratesId: "784-1985-9912334-1",
    camp: "DXB-04", role: "Senior Manager", shift: "Morning",
    joinDate: "2022-08-04", expiryDate: addDays(42), status: "Active", lastLogin: "12 min ago",
    avatar: "RP", permissions: { breakfast: true, lunch: true, dinner: false, reports: true },
  },
  {
    id: "m3", name: "Khalid Al Suwaidi", username: "khalid.suwaidi", password: "ShJ$Indus#02",
    email: "khalid.s@mealops.ae", phone: "+971 52 880 4471", emiratesId: "784-1990-5567129-7",
    camp: "SHJ-02", role: "Camp Manager", shift: "Full Day",
    joinDate: "2024-01-22", expiryDate: addDays(310), status: "Active", lastLogin: "1 hour ago",
    avatar: "KS", permissions: { breakfast: true, lunch: true, dinner: true, reports: false },
  },
  {
    id: "m4", name: "Imran Sheikh", username: "imran.sheikh", password: "Mus@ffah*09",
    email: "imran.s@mealops.ae", phone: "+971 56 339 0098", emiratesId: "784-1982-1133447-9",
    camp: "AUH-09", role: "Supervisor", shift: "Evening",
    joinDate: "2021-11-18", expiryDate: addDays(-8), status: "Expired", lastLogin: "9 days ago",
    avatar: "IS", permissions: { breakfast: false, lunch: true, dinner: true, reports: false },
  },
  {
    id: "m5", name: "Fatima Al Hosani", username: "fatima.hosani", password: "Hamr@2026$RAK",
    email: "fatima.h@mealops.ae", phone: "+971 50 778 1290", emiratesId: "784-1992-7782311-2",
    camp: "RAK-01", role: "Camp Manager", shift: "Morning",
    joinDate: "2023-09-30", expiryDate: addDays(96), status: "Active", lastLogin: "5 min ago",
    avatar: "FH", permissions: { breakfast: true, lunch: true, dinner: true, reports: true },
  },
  {
    id: "m6", name: "Bilal Ahmed", username: "bilal.ahmed", password: "Ajm@n!Cent03",
    email: "bilal.a@mealops.ae", phone: "+971 54 220 9981", emiratesId: "784-1987-4456789-5",
    camp: "AJM-03", role: "Camp Manager", shift: "Full Day",
    joinDate: "2022-05-14", expiryDate: addDays(15), status: "Suspended", lastLogin: "3 days ago",
    avatar: "BA", permissions: { breakfast: true, lunch: true, dinner: false, reports: true },
  },
];