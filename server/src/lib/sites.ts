// A "site" is a physical scanning location — a Camp OR a Project. Both carry
// meal windows and can host scans (Scan.campCode holds a camp or project code).
// These helpers unify the two so reports/dashboards count project-site meals
// the same way they count camp meals.

import { prisma } from "./prisma.js";

export type ReportSite = {
  code: string;
  name: string;
  site: string;
  employees: number;
  online: boolean;
  type: "camp" | "project";
};

// Unified site list (camps + projects), optionally narrowed to a set of codes.
// `codes === null` means "all sites".
export async function listReportSites(codes?: string[] | null): Promise<ReportSite[]> {
  const where = codes ? { code: { in: codes } } : undefined;
  const [camps, projects] = await Promise.all([
    prisma.camp.findMany({ where, orderBy: { code: "asc" } }),
    (prisma as any).project.findMany({ where, orderBy: { code: "asc" } }),
  ]);
  const campSites: ReportSite[] = camps.map((c) => ({
    code: c.code, name: c.name, site: c.site, employees: c.employees, online: c.online, type: "camp",
  }));
  const projSites: ReportSite[] = projects.map((p: any) => ({
    code: p.code, name: p.name, site: p.location, employees: p.employees, online: p.active, type: "project",
  }));
  return [...campSites, ...projSites].sort((a, b) => a.code.localeCompare(b.code));
}

// All site codes (camp + project) belonging to a company — for scan filters.
export async function companySiteCodes(companyCode: string): Promise<string[]> {
  const [camps, projects] = await Promise.all([
    prisma.camp.findMany({ where: { companyCode }, select: { code: true } }),
    (prisma as any).project.findMany({ where: { companyCode }, select: { code: true } }),
  ]);
  return [...camps.map((c) => c.code), ...projects.map((p: any) => p.code)];
}
