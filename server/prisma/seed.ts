/**
 * Seed the database from the existing frontend mock data.
 * Idempotent: safe to re-run.
 */
import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = "password123";

const camps = [
  { code: "AD-01", name: "Al Reem Camp", site: "Reem Tower Project", employees: 1240, online: true, companyCode: "INNOVOBLD",
    breakfastStart: "05:30", breakfastEnd: "08:30", lunchStart: "12:00", lunchEnd: "14:00", dinnerStart: "18:30", dinnerEnd: "21:30" },
  { code: "DXB-04", name: "Marina Workers Village", site: "Marina Heights", employees: 980, online: true, companyCode: "ALFUTTAIM",
    breakfastStart: "06:00", breakfastEnd: "09:00", lunchStart: "12:30", lunchEnd: "14:30", dinnerStart: "19:00", dinnerEnd: "22:00" },
  { code: "SHJ-02", name: "Sharjah Industrial Camp", site: "Industrial Park 7", employees: 1560, online: true, companyCode: "ARABTEC",
    breakfastStart: "05:00", breakfastEnd: "08:00", lunchStart: "11:30", lunchEnd: "13:30", dinnerStart: "18:00", dinnerEnd: "21:00" },
  { code: "AUH-09", name: "Mussafah Labour Camp", site: "Mussafah Bridge", employees: 2110, online: false, companyCode: "DUTCOBALFR",
    breakfastStart: "05:30", breakfastEnd: "08:30", lunchStart: "12:00", lunchEnd: "14:00", dinnerStart: "19:00", dinnerEnd: "22:00" },
  { code: "RAK-01", name: "Al Hamra Camp", site: "Al Hamra Mall Ext.", employees: 740, online: true, companyCode: "KHANSAHEB",
    breakfastStart: "06:00", breakfastEnd: "08:30", lunchStart: "12:00", lunchEnd: "13:30", dinnerStart: "18:30", dinnerEnd: "21:00" },
  { code: "AJM-03", name: "Ajman Central Camp", site: "Corniche Towers", employees: 1320, online: true, companyCode: "GINCON",
    breakfastStart: "05:45", breakfastEnd: "08:45", lunchStart: "12:15", lunchEnd: "14:15", dinnerStart: "18:45", dinnerEnd: "21:45" },
];

const companies = [
  // INNOVOBLD matches the `company` field on every seeded CMS employee below.
  { code: "INNOVOBLD", name: "Innovo Building Contracting", contact: "Ahmed Khan", email: "ops@innovo.ae", phone: "+971 4 123 4567", employees: 32, active: true },
  { code: "ALFUTTAIM", name: "Al Futtaim Construction", contact: "Rashid Al Mansoori", email: "hr@alfuttaim-c.ae", phone: "+971 4 222 1100", employees: 1840, active: true },
  { code: "ARABTEC", name: "Arabtec Holding", contact: "Samir Haddad", email: "contact@arabtec.ae", phone: "+971 4 333 9000", employees: 2750, active: true },
  { code: "DUTCOBALFR", name: "Dutco Balfour Beatty", contact: "John Pereira", email: "info@dutcobb.ae", phone: "+971 4 444 7788", employees: 1120, active: true },
  { code: "KHANSAHEB", name: "Khansaheb Civil Engineering", contact: "Imran Sheikh", email: "careers@khansaheb.ae", phone: "+971 4 555 6677", employees: 960, active: false },
  { code: "GINCON", name: "Ginco General Contracting", contact: "Fatima Al Zahra", email: "admin@ginco.ae", phone: "+971 2 666 5544", employees: 1430, active: true },
];

const projects = [
  { code: "PRJ-01", name: "Reem Tower", location: "Al Reem Island, Abu Dhabi", company: "Innovo Building Contracting", companyCode: "INNOVOBLD", manager: "Ahmed Khan", employees: 420, active: true },
  { code: "PRJ-02", name: "Marina Heights", location: "Dubai Marina", company: "Arabtec Holding", companyCode: "ARABTEC", manager: "Samir Haddad", employees: 610, active: true },
  { code: "PRJ-03", name: "Industrial Park 7", location: "Sharjah", company: "Al Futtaim Construction", companyCode: "ALFUTTAIM", manager: "Rashid Al Mansoori", employees: 380, active: true },
  { code: "PRJ-04", name: "Mussafah Bridge Works", location: "Mussafah, Abu Dhabi", company: "Dutco Balfour Beatty", companyCode: "DUTCOBALFR", manager: "John Pereira", employees: 540, active: false },
  { code: "PRJ-05", name: "Al Hamra Mall Extension", location: "Ras Al Khaimah", company: "Khansaheb Civil Engineering", companyCode: "KHANSAHEB", manager: "Imran Sheikh", employees: 260, active: true },
  { code: "PRJ-06", name: "Corniche Towers", location: "Ajman", company: "Ginco General Contracting", companyCode: "GINCON", manager: "Fatima Al Zahra", employees: 470, active: true },
];

const cmsEmployees = [
  { company: "INNOVOBLD", laborId: 57175, laborCode: "INVOW00001", name: "INNOVO EMPLOYEE 1", designation: "STEEL FITTER", doj: "2021-07-07", campCode: "CAMP 19", campName: "Al Quoz Rent Camp- 02", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2026-01-01" },
  { company: "INNOVOBLD", laborId: 57180, laborCode: "INVOW00002", name: "INNOVO EMPLOYEE 2", designation: "HELPER", doj: "2021-07-12", campCode: "CAMP 04", campName: "M-2", mealsEligibility: "Y", status: "InActive", effectiveDate: "2025-08-01", lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57181, laborCode: "INVOW00003", name: "INNOVO EMPLOYEE 3", designation: "HELPER", doj: "2021-07-13", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57182, laborCode: "INVOW00004", name: "INNOVO EMPLOYEE 4", designation: "HELPER", doj: "2021-07-14", campCode: "CAMP 12", campName: "J-4", mealsEligibility: "Y", status: "InActive", effectiveDate: "2025-08-01", lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57190, laborCode: "INVOW00005", name: "INNOVO EMPLOYEE 5", designation: "HELPER", doj: "2021-07-26", campCode: "CAMP 02", campName: "Al Qouz -2", mealsEligibility: "Y", status: "InActive", effectiveDate: "2022-11-21", lastUpdated: "2021-07-26" },
  { company: "INNOVOBLD", laborId: 57191, laborCode: "INVOW00006", name: "INNOVO EMPLOYEE 6", designation: "TILE MASON", doj: "2021-07-26", campCode: "CAMP 09", campName: "J-3", mealsEligibility: "Y", status: "leave", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57192, laborCode: "INVOW00007", name: "INNOVO EMPLOYEE 7", designation: "HELPER", doj: "2021-07-26", campCode: "CAMP 09", campName: "J-3", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57193, laborCode: "INVOW00008", name: "INNOVO EMPLOYEE 8", designation: "HELPER", doj: "2021-07-27", campCode: "CAMP 02", campName: "Al Qouz -2", mealsEligibility: "Y", status: "InActive", effectiveDate: "2022-05-23", lastUpdated: "2021-07-27" },
  { company: "INNOVOBLD", laborId: 59933, laborCode: "INVOW00009", name: "INNOVO EMPLOYEE 9", designation: "HELPER CHARGE HAND", doj: "2021-08-24", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2025-04-01" },
  { company: "INNOVOBLD", laborId: 59934, laborCode: "INVOW00010", name: "INNOVO EMPLOYEE 10", designation: "LOGISTICS CHARGE HAND", doj: "2021-08-24", campCode: "CAMP 03", campName: "M-1", mealsEligibility: "N", status: "InActive", effectiveDate: "2025-05-01", lastUpdated: "2024-11-01" },
  { company: "INNOVOBLD", laborId: 59937, laborCode: "INVOW00011", name: "INNOVO EMPLOYEE 11", designation: "SAFETY CHARGE HAND", doj: "2021-08-24", campCode: "CAMP 09", campName: "J-3", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2025-09-01" },
  { company: "INNOVOBLD", laborId: 59939, laborCode: "INVOW00012", name: "INNOVO EMPLOYEE 12", designation: "STEEL FITTER", doj: "2021-08-24", campCode: "CAMP 09", campName: "J-3", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57240, laborCode: "INVOW00013", name: "INNOVO EMPLOYEE 13", designation: "MASON", doj: "2021-08-24", campCode: "CAMP 09", campName: "J-3", mealsEligibility: "Y", status: "InActive", effectiveDate: "2024-11-01", lastUpdated: "2024-07-01" },
  { company: "INNOVOBLD", laborId: 59935, laborCode: "INVOW00014", name: "INNOVO EMPLOYEE 14", designation: "CARPENTER", doj: "2021-08-24", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59936, laborCode: "INVOW00015", name: "INNOVO EMPLOYEE 15", designation: "SCAFFOLDER", doj: "2021-08-24", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2026-01-01" },
  { company: "INNOVOBLD", laborId: 59938, laborCode: "INVOW00016", name: "INNOVO EMPLOYEE 16", designation: "CARPENTER", doj: "2021-08-24", campCode: "CAMP 15", campName: "AL NASSER AUH", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57267, laborCode: "INVOW00017", name: "INNOVO EMPLOYEE 17", designation: "HELPER", doj: "2021-09-06", campCode: "CAMP 12", campName: "J-4", mealsEligibility: "Y", status: "InActive", effectiveDate: "2025-07-14", lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57285, laborCode: "INVOW00018", name: "INNOVO EMPLOYEE 18", designation: "MASON", doj: "2021-09-15", campCode: "CAMP 16", campName: "DIC Rent Camp", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 57286, laborCode: "INVOW00019", name: "INNOVO EMPLOYEE 19", designation: "TILE MASON", doj: "2021-09-15", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59940, laborCode: "INVOW00020", name: "INNOVO EMPLOYEE 20", designation: "STEEL FITTER", doj: "2021-09-22", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "N", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59941, laborCode: "INVOW00021", name: "INNOVO EMPLOYEE 21", designation: "SENIOR CARPENTER", doj: "2021-09-22", campCode: "CAMP 17", campName: "Al Quoz Rent Camp 1", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2025-09-01" },
  { company: "INNOVOBLD", laborId: 59942, laborCode: "INVOW00022", name: "INNOVO EMPLOYEE 22", designation: "STEEL FITTER CHARGE HAND", doj: "2021-09-22", campCode: "CAMP 17", campName: "Al Quoz Rent Camp 1", mealsEligibility: "N", status: "Active", effectiveDate: null, lastUpdated: "2026-01-01" },
  { company: "INNOVOBLD", laborId: 59943, laborCode: "INVOW00023", name: "INNOVO EMPLOYEE 23", designation: "CARPENTER", doj: "2021-09-22", campCode: "CAMP 19", campName: "Al Quoz Rent Camp- 02", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59944, laborCode: "INVOW00024", name: "INNOVO EMPLOYEE 24", designation: "WATCHMAN", doj: "2021-10-16", campCode: "CAMP 09", campName: "J-3", mealsEligibility: "Y", status: "InActive", effectiveDate: "2025-09-01", lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59945, laborCode: "INVOW00025", name: "INNOVO EMPLOYEE 25", designation: "HELPER", doj: "2021-10-16", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "N", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59946, laborCode: "INVOW00026", name: "INNOVO EMPLOYEE 26", designation: "ASSISTANT STORE KEEPER", doj: "2021-10-16", campCode: "CAMP 18", campName: "DIP Rent Camp 1", mealsEligibility: "N", status: "Active", effectiveDate: null, lastUpdated: "2025-04-01" },
  { company: "INNOVOBLD", laborId: 59947, laborCode: "INVOW00027", name: "INNOVO EMPLOYEE 27", designation: "CARPENTER", doj: "2021-10-16", campCode: "CAMP 19", campName: "Al Quoz Rent Camp- 02", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59948, laborCode: "INVOW00028", name: "INNOVO EMPLOYEE 28", designation: "CARPENTER", doj: "2021-10-16", campCode: "CAMP 19", campName: "Al Quoz Rent Camp- 02", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2026-01-01" },
  { company: "INNOVOBLD", laborId: 59949, laborCode: "INVOW00029", name: "INNOVO EMPLOYEE 29", designation: "HELPER", doj: "2021-10-16", campCode: "CAMP 19", campName: "Al Quoz Rent Camp- 02", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59950, laborCode: "INVOW00030", name: "INNOVO EMPLOYEE 30", designation: "CARPENTER", doj: "2021-10-16", campCode: "CAMP 16", campName: "DIC Rent Camp", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2024-10-01" },
  { company: "INNOVOBLD", laborId: 59951, laborCode: "INVOW00031", name: "INNOVO EMPLOYEE 31", designation: "ASST. MASON", doj: "2021-10-16", campCode: "CAMP 08", campName: "J-2", mealsEligibility: "Y", status: "InActive", effectiveDate: "2023-05-25", lastUpdated: "2020-07-01" },
  { company: "INNOVOBLD", laborId: 59952, laborCode: "INVOW00032", name: "INNOVO EMPLOYEE 32", designation: "OFFICE BOY", doj: "2021-10-16", campCode: "CAMP 09", campName: "J-3", mealsEligibility: "Y", status: "Active", effectiveDate: null, lastUpdated: "2025-01-01" },
];

const devices = [
  { name: "Scanner-AD01-A", campCode: "AD-01", battery: 86, online: true, macAddress: "A4:5E:60:11:8C:21", serial: "ZBR-AD01A-7781", model: "Zebra TC22", androidVersion: "Android 13", appVersion: "MyMeal 4.2.1", ipAddress: "10.42.10.21", assignedTo: "Ahmed Al Mansouri", registeredOn: "2024-02-14" },
  { name: "Scanner-AD01-B", campCode: "AD-01", battery: 42, online: true, macAddress: "A4:5E:60:11:8C:22", serial: "ZBR-AD01B-7782", model: "Zebra TC22", androidVersion: "Android 13", appVersion: "MyMeal 4.2.1", ipAddress: "10.42.10.22", assignedTo: "Ahmed Al Mansouri", registeredOn: "2024-02-14" },
  { name: "Scanner-DXB04", campCode: "DXB-04", battery: 71, online: true, macAddress: "B8:27:EB:44:19:7C", serial: "HON-DXB04-3320", model: "Honeywell EDA52", androidVersion: "Android 12", appVersion: "MyMeal 4.2.0", ipAddress: "10.44.20.11", assignedTo: "Rajesh Pillai", registeredOn: "2023-11-02" },
  { name: "Scanner-SHJ02-A", campCode: "SHJ-02", battery: 58, online: true, macAddress: "DC:A6:32:8E:55:01", serial: "ZBR-SHJ02A-9120", model: "Zebra MC2200", androidVersion: "Android 11", appVersion: "MyMeal 4.1.8", ipAddress: "10.46.30.31", assignedTo: "Khalid Al Suwaidi", registeredOn: "2023-09-21" },
  { name: "Scanner-AUH09-A", campCode: "AUH-09", battery: 12, online: false, macAddress: "F0:18:98:21:AC:55", serial: "SAM-AUH09A-1145", model: "Samsung XCover 6 Pro", androidVersion: "Android 13", appVersion: "MyMeal 4.2.1", ipAddress: "10.48.40.12", assignedTo: "Imran Sheikh", registeredOn: "2022-12-08" },
  { name: "Scanner-RAK01", campCode: "RAK-01", battery: 94, online: true, macAddress: "3C:5A:B4:77:09:E2", serial: "HON-RAK01-5560", model: "Honeywell CT30 XP", androidVersion: "Android 13", appVersion: "MyMeal 4.2.1", ipAddress: "10.50.50.10", assignedTo: "Fatima Al Hosani", registeredOn: "2024-04-03" },
  { name: "Scanner-AJM03", campCode: "AJM-03", battery: 67, online: true, macAddress: "00:1A:7D:DA:71:13", serial: "ZBR-AJM03-2244", model: "Zebra TC52", androidVersion: "Android 12", appVersion: "MyMeal 4.2.0", ipAddress: "10.52.60.18", assignedTo: "Bilal Ahmed", registeredOn: "2023-06-19" },
];

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

// `pin` is a demo Android-scanner PIN (4 digits) — admin should overwrite via the UI.
const managers = [
  { name: "Ahmed Al Mansouri", username: "ahmed.mansouri", password: "Ad@2025!Reem", pin: "1111", email: "ahmed.m@mymeals.ae", phone: "+971 50 442 8821", emiratesId: "784-1988-2237811-3", campCode: "AD-01", companyCode: "INNOVOBLD", role: "CampManager", shift: "FullDay", joinDate: new Date("2023-03-12"), expiryDate: addDays(184), status: "Active", avatar: "AM", permBreakfast: true, permLunch: true, permDinner: true, permReports: true },
  { name: "Rajesh Pillai", username: "rajesh.pillai", password: "Mar!na#0420", pin: "2222", email: "rajesh.p@mymeals.ae", phone: "+971 55 119 7733", emiratesId: "784-1985-9912334-1", campCode: "DXB-04", companyCode: "ALFUTTAIM", role: "SeniorManager", shift: "Morning", joinDate: new Date("2022-08-04"), expiryDate: addDays(42), status: "Active", avatar: "RP", permBreakfast: true, permLunch: true, permDinner: false, permReports: true },
  { name: "Khalid Al Suwaidi", username: "khalid.suwaidi", password: "ShJ$Indus#02", pin: "3333", email: "khalid.s@mymeals.ae", phone: "+971 52 880 4471", emiratesId: "784-1990-5567129-7", campCode: "SHJ-02", companyCode: "ARABTEC", role: "CampManager", shift: "FullDay", joinDate: new Date("2024-01-22"), expiryDate: addDays(310), status: "Active", avatar: "KS", permBreakfast: true, permLunch: true, permDinner: true, permReports: false },
  { name: "Imran Sheikh", username: "imran.sheikh", password: "Mus@ffah*09", pin: null,   email: "imran.s@mymeals.ae", phone: "+971 56 339 0098", emiratesId: "784-1982-1133447-9", campCode: "AUH-09", companyCode: "DUTCOBALFR", role: "Supervisor", shift: "Evening", joinDate: new Date("2021-11-18"), expiryDate: addDays(-8), status: "Expired", avatar: "IS", permBreakfast: false, permLunch: true, permDinner: true, permReports: false },
  { name: "Fatima Al Hosani", username: "fatima.hosani", password: "Hamr@2026$RAK", pin: "4444", email: "fatima.h@mymeals.ae", phone: "+971 50 778 1290", emiratesId: "784-1992-7782311-2", campCode: "RAK-01", companyCode: "KHANSAHEB", role: "CampManager", shift: "Morning", joinDate: new Date("2023-09-30"), expiryDate: addDays(96), status: "Active", avatar: "FH", permBreakfast: true, permLunch: true, permDinner: true, permReports: true },
  { name: "Bilal Ahmed", username: "bilal.ahmed", password: "Ajm@n!Cent03", pin: "5555", email: "bilal.a@mymeals.ae", phone: "+971 54 220 9981", emiratesId: "784-1987-4456789-5", campCode: "AJM-03", companyCode: "GINCON", role: "CampManager", shift: "FullDay", joinDate: new Date("2022-05-14"), expiryDate: addDays(15), status: "Suspended", avatar: "BA", permBreakfast: true, permLunch: true, permDinner: false, permReports: true },
];

const TABS = ["overview", "scanner", "camps", "employees", "managers", "forecast", "devices", "reports", "automation", "users"];

const ALL = { view: true, edit: true, delete: true };
const VIEW = { view: true, edit: false, delete: false };
const EDIT = { view: true, edit: true, delete: false };
const NONE = { view: false, edit: false, delete: false };

const rolePerms: Record<Role, Record<string, typeof ALL>> = {
  admin: Object.fromEntries(TABS.map((t) => [t, ALL])) as any,
  operator: {
    overview: VIEW, scanner: EDIT, camps: EDIT, employees: EDIT,
    managers: VIEW, forecast: EDIT, devices: EDIT, reports: VIEW,
    automation: EDIT, users: NONE,
  },
  user: {
    overview: VIEW, scanner: VIEW, camps: VIEW, employees: VIEW,
    managers: NONE, forecast: VIEW, devices: VIEW, reports: VIEW,
    automation: NONE, users: NONE,
  },
  manager: {
    overview: VIEW, scanner: EDIT, camps: VIEW, employees: VIEW,
    managers: NONE, forecast: VIEW, devices: VIEW, reports: VIEW,
    automation: NONE, users: NONE,
  },
};

async function main() {
  console.log("[seed] starting...");

  // Camps
  for (const c of camps) {
    await prisma.camp.upsert({
      where: { code: c.code },
      create: c,
      update: c,
    });
  }
  console.log(`[seed] camps: ${camps.length}`);

  // Companies
  for (const co of companies) {
    await prisma.company.upsert({
      where: { code: co.code },
      create: co,
      update: co,
    });
  }
  console.log(`[seed] companies: ${companies.length}`);

  // Projects
  for (const pr of projects) {
    await prisma.project.upsert({
      where: { code: pr.code },
      create: pr,
      update: pr,
    });
  }
  console.log(`[seed] projects: ${projects.length}`);

  // CMS employees
  for (const e of cmsEmployees) {
    await prisma.cmsEmployee.upsert({
      where: { laborId: e.laborId },
      create: {
        ...e,
        doj: new Date(e.doj),
        effectiveDate: e.effectiveDate ? new Date(e.effectiveDate) : null,
        lastUpdated: new Date(e.lastUpdated),
        mealsEligibility: e.mealsEligibility as any,
        status: e.status as any,
      },
      update: {
        company: e.company,
        laborCode: e.laborCode,
        name: e.name,
        designation: e.designation,
        doj: new Date(e.doj),
        campCode: e.campCode,
        campName: e.campName,
        mealsEligibility: e.mealsEligibility as any,
        status: e.status as any,
        effectiveDate: e.effectiveDate ? new Date(e.effectiveDate) : null,
        lastUpdated: new Date(e.lastUpdated),
      },
    });
  }
  console.log(`[seed] cms employees: ${cmsEmployees.length}`);

  // Devices
  for (const d of devices) {
    await prisma.device.upsert({
      where: { serial: d.serial },
      create: { ...d, registeredOn: new Date(d.registeredOn), lastSync: new Date() },
      update: { ...d, registeredOn: new Date(d.registeredOn) },
    });
  }
  console.log(`[seed] devices: ${devices.length}`);

  // Camp managers — each also gets a linked User row so they can log in.
  for (const m of managers) {
    const passwordHash = await bcrypt.hash(m.password, 10);
    const pinHash = m.pin ? await bcrypt.hash(m.pin, 10) : null;
    const { password, pin, ...rest } = m;
    await prisma.campManager.upsert({
      where: { username: m.username },
      create: { ...rest, passwordHash, pinHash, role: m.role as any, shift: m.shift as any, status: m.status as any, camps: { connect: [{ code: m.campCode }] } },
      // Don't overwrite the PIN if admin has already set one (preserve admin changes on re-seed).
      update: { ...rest, passwordHash, role: m.role as any, shift: m.shift as any, status: m.status as any, ...(pinHash ? { pinHash } : {}), camps: { set: [{ code: m.campCode }] } },
    });
    await prisma.user.upsert({
      where: { username: m.username },
      create: {
        name: m.name,
        username: m.username,
        email: m.email,
        passwordHash,
        role: "manager",
        status: m.status === "Active" ? "Active" : "Inactive",
        assignedCampCode: m.campCode,
        assignedCampCodes: [m.campCode],
      },
      update: {
        name: m.name,
        email: m.email,
        passwordHash,
        role: "manager",
        status: m.status === "Active" ? "Active" : "Inactive",
        assignedCampCode: m.campCode,
        assignedCampCodes: [m.campCode],
      },
    });
  }
  console.log(`[seed] camp managers + matching login users: ${managers.length}`);

  // App users (for auth)
  const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const appUsers = [
    { username: "admin",    name: "Head Office Admin",        email: "admin@mymeals.io",  role: "admin"    as Role, assignedCampCode: null },
    { username: "sara.op",  name: "Sara Operator",            email: "sara@mymeals.io",   role: "operator" as Role, assignedCampCode: null },
    { username: "viewer",   name: "Read-only User",           email: "viewer@mymeals.io", role: "user"     as Role, assignedCampCode: null },
    { username: "khalid.ad01", name: "Khalid (AD-01 Manager)", email: "khalid@mymeals.io", role: "manager" as Role, assignedCampCode: "AD-01" },
    { username: "omar.dxb04",  name: "Omar (DXB-04 Manager)",  email: "omar@mymeals.io",   role: "manager" as Role, assignedCampCode: "DXB-04" },
  ];
  for (const u of appUsers) {
    await prisma.user.upsert({
      where: { username: u.username },
      create: {
        ...u,
        assignedCampCodes: u.assignedCampCode ? [u.assignedCampCode] : [],
        passwordHash: defaultHash,
        status: "Active",
      },
      update: {
        name: u.name,
        email: u.email,
        role: u.role,
        assignedCampCode: u.assignedCampCode,
        assignedCampCodes: u.assignedCampCode ? [u.assignedCampCode] : [],
      },
    });
  }
  console.log(`[seed] app users: ${appUsers.length} (default password: ${DEFAULT_PASSWORD})`);

  // Role permissions
  for (const role of Object.keys(rolePerms) as Role[]) {
    for (const tab of TABS) {
      const perm = rolePerms[role][tab];
      await prisma.rolePermission.upsert({
        where: { role_tab: { role, tab } },
        create: { role, tab, ...perm },
        update: perm,
      });
    }
  }
  console.log(`[seed] role permissions: ${Object.keys(rolePerms).length} roles x ${TABS.length} tabs`);

  // Seed ~30 days of scans across all camps so reports have realistic data.
  // Idempotent: if scans already span more than 14 days, we skip; otherwise reseed.
  const oldestScan = await prisma.scan.findFirst({ orderBy: { time: "asc" } });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const hasMonthData = oldestScan && oldestScan.time < cutoff;

  if (!hasMonthData) {
    if (oldestScan) {
      await prisma.scan.deleteMany({});
      console.log("[seed] clearing existing scans to reseed with 30-day window");
    }

    const meals = ["Breakfast", "Lunch", "Dinner"] as const;
    const names = [
      "Mohammed Rafiq", "Suresh Kumar", "Anwar Hussain", "Ramesh Babu", "Bilal Ahmed",
      "Vinod Sharma", "Iqbal Khan", "Tariq Mahmood", "Sanjay Patel", "Imran Sheikh",
      "Ravi Verma", "Karim Aslam", "Naveen Kumar", "Faisal Iqbal", "Pradeep Singh",
      "Mohammed Asif", "Wasim Akram", "Hari Krishnan", "Vimal Raj", "Younis Ahmed",
    ];

    // Meal time windows (hour ranges, Dubai-ish). Scans bunch around these.
    const mealWindow = (m: typeof meals[number]) =>
      m === "Breakfast" ? { start: 6, end: 9 }
        : m === "Lunch" ? { start: 12, end: 14 }
          : { start: 19, end: 22 };

    // Coverage tuning: smaller share of headcount per meal so we don't blow up.
    // Per camp per meal per day = round(employees * coverageRate * statusMultiplier)
    // Per-meal coverage: ~30% of headcount per meal per camp per day.
    // Across 3 meals ≈ 0.9 × employees served per day — matches a realistic
    // ~90% daily-attendance pattern when compared against the server's
    // `estimated = employees × days` (one expected portion per employee per day).
    const COVERAGE = 0.30;

    const all: any[] = [];
    const DAYS = 30;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let d = 0; d < DAYS; d++) {
      const day = new Date(today);
      day.setDate(today.getDate() - d);

      // Saturday & Sunday (weekend in some camps) — slightly less coverage
      const dow = day.getDay();
      const weekendFactor = dow === 5 || dow === 6 ? 0.85 : 1.0;

      for (const c of camps) {
        // Each camp can have a daily fluctuation factor
        const dailyJitter = 0.85 + Math.random() * 0.3;
        const offlinePenalty = c.online ? 1 : 0.55; // offline camp still has some scans (manual queue) but lower

        for (const meal of meals) {
          const win = mealWindow(meal);
          const count = Math.max(
            10,
            Math.round(c.employees * COVERAGE * weekendFactor * dailyJitter * offlinePenalty),
          );

          for (let i = 0; i < count; i++) {
            const hour = win.start + Math.random() * (win.end - win.start);
            const t = new Date(day);
            t.setHours(Math.floor(hour), Math.floor((hour % 1) * 60), Math.floor(Math.random() * 60), 0);

            // 90% Eligible, 4% AlreadyServed (duplicates), 3% NotEligible, 2% WrongCamp, 1% Expired
            const r = Math.random();
            const status =
              r < 0.90 ? "Eligible"
                : r < 0.94 ? "AlreadyServed"
                  : r < 0.97 ? "NotEligible"
                    : r < 0.99 ? "WrongCamp"
                      : "Expired";

            const nameIdx = (i + d * 7 + c.code.charCodeAt(0)) % names.length;
            // Stable labour ID per employee slot per camp so duplicates can happen across days
            const empSlot = i % Math.max(50, Math.floor(c.employees / 3));
            const labourId = `LB-${(c.code.charCodeAt(0) * 1000 + c.code.charCodeAt(c.code.length - 1) * 10 + empSlot)
              .toString()
              .padStart(5, "0")}`;

            all.push({
              time: t,
              name: names[nameIdx],
              labourId,
              campCode: c.code,
              meal,
              status,
            });
          }
        }
      }
    }

    // Bulk insert in chunks to avoid blowing prisma's max payload
    const CHUNK = 5000;
    for (let i = 0; i < all.length; i += CHUNK) {
      await prisma.scan.createMany({ data: all.slice(i, i + CHUNK) });
    }
    const oldest = all.reduce((acc, s) => (s.time < acc ? s.time : acc), all[0].time);
    const newest = all.reduce((acc, s) => (s.time > acc ? s.time : acc), all[0].time);
    console.log(
      `[seed] scans: ${all.length} across ${DAYS} days ` +
      `(${oldest.toISOString().slice(0, 10)} → ${newest.toISOString().slice(0, 10)})`,
    );
  } else {
    const total = await prisma.scan.count();
    console.log(`[seed] scans already span >14 days (${total} rows) — skipping reseed. Run prisma:reset to refresh.`);
  }

  console.log("[seed] done.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
