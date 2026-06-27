import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];
const SCANNER_EXPIRES_IN = (process.env.SCANNER_JWT_EXPIRES_IN || "30d") as SignOptions["expiresIn"];

export type Role = "admin" | "operator" | "user" | "manager";

export type WebJwtPayload = {
  sub: string;
  username: string;
  role: Role;
  kind?: "web";
};

export type ScannerJwtPayload = {
  sub: string;          // campManager.id
  username: string;
  // The site this scanner is anchored to (from the device binding): a Camp.code
  // or a Project.code. `companyCode` scopes meal eligibility to the parent
  // company. Older tokens may carry only `campCode` (back-compat).
  campCode: string;
  siteType?: "camp" | "project";
  companyCode?: string | null;
  kind: "scanner";
};

export type AnyJwtPayload = WebJwtPayload | ScannerJwtPayload;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// PIN uses the same primitive as password, separate function for clarity.
export function hashPin(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPin(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signWebToken(payload: Omit<WebJwtPayload, "kind">): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

export function signScannerToken(payload: Omit<ScannerJwtPayload, "kind">): string {
  return jwt.sign({ ...payload, kind: "scanner" }, SECRET, { expiresIn: SCANNER_EXPIRES_IN });
}

export function verifyToken(token: string): AnyJwtPayload {
  return jwt.verify(token, SECRET) as AnyJwtPayload;
}

// Back-compat for any callers still using the old name.
export const signToken = signWebToken;
export type JwtPayload = WebJwtPayload;
