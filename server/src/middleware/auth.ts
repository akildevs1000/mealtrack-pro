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
      };
      scanner?: {
        managerId: string;
        username: string;
        name: string;
        campCode: string;
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
      select: { id: true, role: true, username: true, status: true, assignedCampCode: true },
    });
    if (!user) return res.status(401).json({ error: "User no longer exists" });
    if (user.status !== "Active") return res.status(403).json({ error: "User is not active" });
    req.user = {
      id: user.id,
      role: user.role,
      username: user.username,
      assignedCampCode: user.assignedCampCode,
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

// Returns the camp scope for the current request (null = unrestricted)
export function campScopeOf(req: Request): string[] | null {
  if (!req.user) return null;
  if (req.user.role === "manager" && req.user.assignedCampCode) {
    return [req.user.assignedCampCode];
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
    req.scanner = {
      managerId: manager.id,
      username: manager.username,
      name: manager.name,
      campCode: manager.campCode,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
