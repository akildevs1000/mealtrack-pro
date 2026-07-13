import type { NextFunction, Request, Response } from "express";
import { verifyToken, type Role } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        username: string;
        assignedCampCode: string | null;
        assignedCampCodes: string[];
      };
      scanner?: {
        managerId: string;
        username: string;
        name: string;
        // Site the scan is attributed to (camp OR project code), from the token.
        campCode: string;
        siteType: "camp" | "project";
        companyCode: string | null;
      };
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  try {
    const payload = verifyToken(token);
    if (payload.kind === "scanner") {
      return res.status(401).json({ error: "Scanner token cannot access web routes" });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, username: true, status: true, assignedCampCode: true, assignedCampCodes: true },
    });
    if (!user) return res.status(401).json({ error: "User no longer exists" });
    if (user.status !== "Active") return res.status(403).json({ error: "User is not active" });
    req.user = {
      id: user.id,
      role: user.role,
      username: user.username,
      assignedCampCode: user.assignedCampCode,
      assignedCampCodes: user.assignedCampCodes,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export type PermAction = "view" | "edit" | "delete";

/**
 * Enforce the ADMIN-EDITABLE permission matrix (RolePermission) instead of a
 * hardcoded role list — so ticking View/Edit/Delete on the Users page actually
 * grants API access, not just UI visibility. Admins always pass; a missing row
 * means denied.
 *
 * NB: /api/users stays hardcoded admin-only on purpose — granting a role
 * "users: edit" via the matrix must not become a privilege-escalation path.
 */
export function requirePerm(tab: string, action: PermAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (req.user.role === "admin") return next();
    try {
      const perm = await prisma.rolePermission.findUnique({
        where: { role_tab: { role: req.user.role, tab } },
        select: { view: true, edit: true, delete: true },
      });
      if (!perm?.[action]) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}

// Returns the camp scope for the current request (null = unrestricted)
export function campScopeOf(req: Request): string[] | null {
  if (!req.user) return null;
  if (req.user.role === "manager") {
    // Prefer the multi-camp set; fall back to the single primary for users
    // created before the array column existed.
    const codes = req.user.assignedCampCodes.length
      ? req.user.assignedCampCodes
      : req.user.assignedCampCode
        ? [req.user.assignedCampCode]
        : [];
    if (codes.length) return codes;
  }
  return null;
}

// Scanner tokens are issued by /api/scanner/login and only accepted by scanner routes.
export async function requireScannerAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  try {
    const payload = verifyToken(token);
    if (payload.kind !== "scanner") {
      return res.status(401).json({ error: "Not a scanner token" });
    }
    const manager = await prisma.campManager.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, name: true, campCode: true, status: true, pinHash: true },
    });
    if (!manager || !manager.pinHash) {
      return res.status(401).json({ error: "Manager no longer accepts scanner logins" });
    }
    if (manager.status !== "Active") {
      return res.status(403).json({ error: "Manager account is not active" });
    }
    // Site + company come from the TOKEN (set at login from the device's
    // binding), NOT the manager's primary camp — so a supplier scanning at a
    // device anchored elsewhere is attributed to that device's site.
    req.scanner = {
      managerId: manager.id,
      username: manager.username,
      name: manager.name,
      campCode: payload.campCode,
      siteType: payload.siteType ?? "camp",
      companyCode: payload.companyCode ?? null,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
