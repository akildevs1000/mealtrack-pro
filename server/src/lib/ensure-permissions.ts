// Idempotent boot hook that guarantees every (role, tab) pair has a row in
// RolePermission. Solves the "added a new tab in the source but the live DB
// was already seeded" problem without forcing a destructive re-seed.
//
// IMPORTANT: only inserts NEW (role, tab) combinations. Existing rows are left
// untouched so the admin's manual permission tweaks aren't clobbered.

import { prisma } from "./prisma.js";
import type { Role } from "@prisma/client";

const TABS = [
  "overview", "scanner", "companies", "camps", "projects", "employees", "managers",
  "catering", "forecast", "devices", "reports", "automation", "users",
];

const ALL = { view: true, edit: true, delete: true };
const VIEW = { view: true, edit: false, delete: false };
const EDIT = { view: true, edit: true, delete: false };
const NONE = { view: false, edit: false, delete: false };

const DEFAULTS: Record<Role, Record<string, typeof ALL>> = {
  admin: Object.fromEntries(TABS.map((t) => [t, ALL])) as Record<string, typeof ALL>,
  operator: {
    overview: VIEW, scanner: EDIT, companies: EDIT, camps: EDIT, projects: EDIT, employees: EDIT,
    managers: VIEW, catering: EDIT, forecast: EDIT, devices: EDIT, reports: VIEW,
    automation: EDIT, users: NONE,
  },
  user: {
    overview: VIEW, scanner: VIEW, companies: VIEW, camps: VIEW, projects: VIEW, employees: VIEW,
    managers: NONE, catering: VIEW, forecast: VIEW, devices: VIEW, reports: VIEW,
    automation: NONE, users: NONE,
  },
  manager: {
    overview: VIEW, scanner: EDIT, companies: VIEW, camps: VIEW, projects: VIEW, employees: VIEW,
    managers: NONE, catering: NONE, forecast: VIEW, devices: VIEW, reports: VIEW,
    automation: NONE, users: NONE,
  },
};

export async function ensureDefaultPermissions(): Promise<void> {
  const roles = Object.keys(DEFAULTS) as Role[];
  let inserted = 0;
  for (const role of roles) {
    for (const tab of TABS) {
      // Check first so we can count actual inserts; upsert hides create vs find.
      const existing = await prisma.rolePermission.findUnique({
        where: { role_tab: { role, tab } },
      });
      if (existing) continue;
      const defaults = DEFAULTS[role][tab] ?? NONE;
      await prisma.rolePermission.create({ data: { role, tab, ...defaults } });
      inserted++;
    }
  }
  if (inserted > 0) {
    console.log(`[permissions] inserted ${inserted} missing role-tab row(s)`);
  }
}
