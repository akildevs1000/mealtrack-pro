export type CmsEmployee = {
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

export const cmsEmployees: CmsEmployee[] = [
  {"company": "INNOVOBLD", "laborId": 57175, "laborCode": "INVOW00001", "name": "INNOVO EMPLOYEE 1", "designation": "STEEL FITTER", "doj": "2021-07-07", "campCode": "CAMP 19", "campName": "Al Quoz Rent Camp- 02", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2026-01-01"},
  {"company": "INNOVOBLD", "laborId": 57180, "laborCode": "INVOW00002", "name": "INNOVO EMPLOYEE 2", "designation": "HELPER", "doj": "2021-07-12", "campCode": "CAMP 04", "campName": "M-2", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2025-08-01", "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57181, "laborCode": "INVOW00003", "name": "INNOVO EMPLOYEE 3", "designation": "HELPER", "doj": "2021-07-13", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57182, "laborCode": "INVOW00004", "name": "INNOVO EMPLOYEE 4", "designation": "HELPER", "doj": "2021-07-14", "campCode": "CAMP 12", "campName": "J-4", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2025-08-01", "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57190, "laborCode": "INVOW00005", "name": "INNOVO EMPLOYEE 5", "designation": "HELPER", "doj": "2021-07-26", "campCode": "CAMP 02", "campName": "Al Qouz -2", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2022-11-21", "lastUpdated": "2021-07-26"},
  {"company": "INNOVOBLD", "laborId": 57191, "laborCode": "INVOW00006", "name": "INNOVO EMPLOYEE 6", "designation": "TILE MASON", "doj": "2021-07-26", "campCode": "CAMP 09", "campName": "J-3", "mealsEligibility": "Y", "status": "leave", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57192, "laborCode": "INVOW00007", "name": "INNOVO EMPLOYEE 7", "designation": "HELPER", "doj": "2021-07-26", "campCode": "CAMP 09", "campName": "J-3", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57193, "laborCode": "INVOW00008", "name": "INNOVO EMPLOYEE 8", "designation": "HELPER", "doj": "2021-07-27", "campCode": "CAMP 02", "campName": "Al Qouz -2", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2022-05-23", "lastUpdated": "2021-07-27"},
  {"company": "INNOVOBLD", "laborId": 59933, "laborCode": "INVOW00009", "name": "INNOVO EMPLOYEE 9", "designation": "HELPER CHARGE HAND", "doj": "2021-08-24", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2025-04-01"},
  {"company": "INNOVOBLD", "laborId": 59934, "laborCode": "INVOW00010", "name": "INNOVO EMPLOYEE 10", "designation": "LOGISTICS CHARGE HAND", "doj": "2021-08-24", "campCode": "CAMP 03", "campName": "M-1", "mealsEligibility": "N", "status": "InActive", "effectiveDate": "2025-05-01", "lastUpdated": "2024-11-01"},
  {"company": "INNOVOBLD", "laborId": 59937, "laborCode": "INVOW00011", "name": "INNOVO EMPLOYEE 11", "designation": "SAFETY CHARGE HAND", "doj": "2021-08-24", "campCode": "CAMP 09", "campName": "J-3", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2025-09-01"},
  {"company": "INNOVOBLD", "laborId": 59939, "laborCode": "INVOW00012", "name": "INNOVO EMPLOYEE 12", "designation": "STEEL FITTER", "doj": "2021-08-24", "campCode": "CAMP 09", "campName": "J-3", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57240, "laborCode": "INVOW00013", "name": "INNOVO EMPLOYEE 13", "designation": "MASON", "doj": "2021-08-24", "campCode": "CAMP 09", "campName": "J-3", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2024-11-01", "lastUpdated": "2024-07-01"},
  {"company": "INNOVOBLD", "laborId": 59935, "laborCode": "INVOW00014", "name": "INNOVO EMPLOYEE 14", "designation": "CARPENTER", "doj": "2021-08-24", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59936, "laborCode": "INVOW00015", "name": "INNOVO EMPLOYEE 15", "designation": "SCAFFOLDER", "doj": "2021-08-24", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2026-01-01"},
  {"company": "INNOVOBLD", "laborId": 59938, "laborCode": "INVOW00016", "name": "INNOVO EMPLOYEE 16", "designation": "CARPENTER", "doj": "2021-08-24", "campCode": "CAMP 15", "campName": "AL NASSER AUH", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57267, "laborCode": "INVOW00017", "name": "INNOVO EMPLOYEE 17", "designation": "HELPER", "doj": "2021-09-06", "campCode": "CAMP 12", "campName": "J-4", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2025-07-14", "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57285, "laborCode": "INVOW00018", "name": "INNOVO EMPLOYEE 18", "designation": "MASON", "doj": "2021-09-15", "campCode": "CAMP 16", "campName": "DIC Rent Camp", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 57286, "laborCode": "INVOW00019", "name": "INNOVO EMPLOYEE 19", "designation": "TILE MASON", "doj": "2021-09-15", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59940, "laborCode": "INVOW00020", "name": "INNOVO EMPLOYEE 20", "designation": "STEEL FITTER", "doj": "2021-09-22", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "N", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59941, "laborCode": "INVOW00021", "name": "INNOVO EMPLOYEE 21", "designation": "SENIOR CARPENTER", "doj": "2021-09-22", "campCode": "CAMP 17", "campName": "Al Quoz Rent Camp 1", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2025-09-01"},
  {"company": "INNOVOBLD", "laborId": 59942, "laborCode": "INVOW00022", "name": "INNOVO EMPLOYEE 22", "designation": "STEEL FITTER CHARGE HAND", "doj": "2021-09-22", "campCode": "CAMP 17", "campName": "Al Quoz Rent Camp 1", "mealsEligibility": "N", "status": "Active", "effectiveDate": null, "lastUpdated": "2026-01-01"},
  {"company": "INNOVOBLD", "laborId": 59943, "laborCode": "INVOW00023", "name": "INNOVO EMPLOYEE 23", "designation": "CARPENTER", "doj": "2021-09-22", "campCode": "CAMP 19", "campName": "Al Quoz Rent Camp- 02", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59944, "laborCode": "INVOW00024", "name": "INNOVO EMPLOYEE 24", "designation": "WATCHMAN", "doj": "2021-10-16", "campCode": "CAMP 09", "campName": "J-3", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2025-09-01", "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59945, "laborCode": "INVOW00025", "name": "INNOVO EMPLOYEE 25", "designation": "HELPER", "doj": "2021-10-16", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "N", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59946, "laborCode": "INVOW00026", "name": "INNOVO EMPLOYEE 26", "designation": "ASSISTANT STORE KEEPER", "doj": "2021-10-16", "campCode": "CAMP 18", "campName": "DIP Rent Camp 1 ", "mealsEligibility": "N", "status": "Active", "effectiveDate": null, "lastUpdated": "2025-04-01"},
  {"company": "INNOVOBLD", "laborId": 59947, "laborCode": "INVOW00027", "name": "INNOVO EMPLOYEE 27", "designation": "CARPENTER", "doj": "2021-10-16", "campCode": "CAMP 19", "campName": "Al Quoz Rent Camp- 02", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59948, "laborCode": "INVOW00028", "name": "INNOVO EMPLOYEE 28", "designation": "CARPENTER", "doj": "2021-10-16", "campCode": "CAMP 19", "campName": "Al Quoz Rent Camp- 02", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2026-01-01"},
  {"company": "INNOVOBLD", "laborId": 59949, "laborCode": "INVOW00029", "name": "INNOVO EMPLOYEE 29", "designation": "HELPER", "doj": "2021-10-16", "campCode": "CAMP 19", "campName": "Al Quoz Rent Camp- 02", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59950, "laborCode": "INVOW00030", "name": "INNOVO EMPLOYEE 30", "designation": "CARPENTER", "doj": "2021-10-16", "campCode": "CAMP 16", "campName": "DIC Rent Camp", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2024-10-01"},
  {"company": "INNOVOBLD", "laborId": 59951, "laborCode": "INVOW00031", "name": "INNOVO EMPLOYEE 31", "designation": "ASST. MASON", "doj": "2021-10-16", "campCode": "CAMP 08", "campName": "J-2", "mealsEligibility": "Y", "status": "InActive", "effectiveDate": "2023-05-25", "lastUpdated": "2020-07-01"},
  {"company": "INNOVOBLD", "laborId": 59952, "laborCode": "INVOW00032", "name": "INNOVO EMPLOYEE 32", "designation": "OFFICE BOY", "doj": "2021-10-16", "campCode": "CAMP 09", "campName": "J-3", "mealsEligibility": "Y", "status": "Active", "effectiveDate": null, "lastUpdated": "2025-01-01"}

];

// Deterministic seeded RNG so meal logs are stable per employee
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export type MealKind = "breakfast" | "lunch" | "dinner";
export type MealRecord = {
  date: string; // YYYY-MM-DD
  breakfast: { taken: boolean; time: string | null };
  lunch: { taken: boolean; time: string | null };
  dinner: { taken: boolean; time: string | null };
};

const slot = (h: number, m: number) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export function buildMealLog(emp: CmsEmployee, from: Date, to: Date): MealRecord[] {
  const rng = seeded(emp.laborId);
  const out: MealRecord[] = [];
  const d = new Date(from);
  while (d <= to) {
    const iso = d.toISOString().slice(0, 10);
    const isInactive = emp.status !== "Active" || emp.mealsEligibility === "N";
    const isLeave = emp.status === "leave";
    const baseRate = isInactive ? 0.05 : isLeave ? 0.2 : 0.85;

    const mk = (h1: number, h2: number, bias = 0) => {
      const taken = rng() < baseRate + bias;
      if (!taken) return { taken: false, time: null as string | null };
      const h = h1 + Math.floor(rng() * (h2 - h1 + 1));
      const m = Math.floor(rng() * 60);
      return { taken: true, time: slot(h, m) };
    };

    out.push({
      date: iso,
      breakfast: mk(5, 8, -0.05),
      lunch: mk(12, 14, 0.05),
      dinner: mk(18, 21, 0),
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function summarize(records: MealRecord[]) {
  const total = records.length;
  const sum = (k: MealKind) => records.filter((r) => r[k].taken).length;
  const b = sum("breakfast"), l = sum("lunch"), dn = sum("dinner");
  return {
    total,
    breakfast: b,
    lunch: l,
    dinner: dn,
    served: b + l + dn,
    possible: total * 3,
    rate: total ? Math.round(((b + l + dn) / (total * 3)) * 100) : 0,
  };
}
