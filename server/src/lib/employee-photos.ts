// Employee profile photos — stored on the server's local disk, NOT in Oracle
// and NOT in the CmsEmployee table. This is deliberate: the labour roster is
// owned by the customer's Oracle CMS (re-synced via /api/cms-sync) and is also
// wipe-and-replaced by the Excel import. Keeping photos on disk, keyed by the
// stable `laborCode` (the QR/business identity), means neither the CMS sync nor
// a re-import can ever destroy an uploaded photo.
//
// Files live under `<UPLOADS_DIR>/employee-photos/<laborCode>.<ext>`. The API
// process runs with cwd = `server/`, so the default lands in `server/uploads/`,
// which is gitignored and survives `git pull` / rebuild / `pm2 restart`.

import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";

const ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "uploads");
export const PHOTO_DIR = path.join(ROOT, "employee-photos");

// Accepted image types and their canonical file extension.
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Decoded image bytes must not exceed this. The Express JSON body limit (2mb)
// is the outer guard; clients are expected to downscale before upload.
export const MAX_PHOTO_BYTES = 1_500_000;

/**
 * Reduce a laborCode to a safe filename stem. Returns null for anything that
 * could escape the photo directory (path traversal) or is empty.
 */
export function safeCode(code: string): string | null {
  const c = (code ?? "").trim();
  if (!c || !/^[A-Za-z0-9._-]+$/.test(c) || c.includes("..")) return null;
  return c;
}

function ensureDir() {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
}

/** True if any photo file is stored for this code. */
export function hasPhoto(code: string): boolean {
  return findPhotoFile(code) !== null;
}

/**
 * Set of laborCodes that have a stored photo, built from a single directory
 * read. Use this to flag a whole roster cheaply instead of stat-ing per row.
 * Returns an empty set when nothing has been uploaded yet.
 */
export function photoCodeSet(): Set<string> {
  const set = new Set<string>();
  let names: string[];
  try {
    names = fs.readdirSync(PHOTO_DIR);
  } catch {
    return set; // dir doesn't exist yet → no photos
  }
  for (const n of names) {
    const code = n.replace(/\.(jpe?g|png|webp)$/i, "");
    if (code !== n) set.add(code); // only count recognised image files
  }
  return set;
}

/** Locate the stored photo file for a code, if any. */
export function findPhotoFile(code: string): { file: string; mime: string } | null {
  const safe = safeCode(code);
  if (!safe) return null;
  for (const ext of ["jpg", "png", "webp"]) {
    const file = path.join(PHOTO_DIR, `${safe}.${ext}`);
    if (fs.existsSync(file)) return { file, mime: EXT_TO_MIME[ext] };
  }
  return null;
}

/**
 * Absolute URL the clients (web <img>, printed card, mobile app) can load
 * directly, or null when no photo is stored. Cache-busted by file mtime so a
 * replaced photo shows immediately.
 */
export function photoUrl(req: Request, code: string): string | null {
  const found = findPhotoFile(code);
  if (!found) return null;
  const safe = safeCode(code)!;
  const ext = found.mime === "image/png" ? "png" : found.mime === "image/webp" ? "webp" : "jpg";
  let v = "";
  try {
    v = `?v=${Math.floor(fs.statSync(found.file).mtimeMs)}`;
  } catch {
    /* mtime is best-effort cache busting */
  }
  // Honour reverse-proxy headers (nginx / desktop proxy) so the URL is correct
  // behind a proxy; falls back to the direct host.
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0] || req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host");
  return `${proto}://${host}/api/employees/photo/${encodeURIComponent(safe)}.${ext}${v}`;
}

/** Persist image bytes for a code, replacing any existing photo. */
export function writePhoto(code: string, mime: string, bytes: Buffer): void {
  const safe = safeCode(code);
  if (!safe) throw new Error("Invalid employee code");
  const ext = MIME_TO_EXT[mime];
  if (!ext) throw new Error("Unsupported image type (use JPEG, PNG, or WebP)");
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error("Image too large");
  ensureDir();
  // Remove any other-extension copy first so we never keep two files per code.
  deletePhoto(safe);
  fs.writeFileSync(path.join(PHOTO_DIR, `${safe}.${ext}`), bytes);
}

/** Remove all stored photo files for a code. Returns true if anything existed. */
export function deletePhoto(code: string): boolean {
  const safe = safeCode(code);
  if (!safe) return false;
  let removed = false;
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const file = path.join(PHOTO_DIR, `${safe}.${ext}`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      removed = true;
    }
  }
  return removed;
}

/**
 * Parse a data URL or raw base64 payload into {mime, bytes}. Accepts either a
 * full `data:image/...;base64,xxxx` string or a {mimeType, data} split.
 */
export function decodeImagePayload(input: {
  dataUrl?: string;
  mimeType?: string;
  data?: string;
}): { mime: string; bytes: Buffer } {
  let mime = input.mimeType ?? "";
  let b64 = input.data ?? "";
  if (input.dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(input.dataUrl.trim());
    if (!m) throw new Error("Invalid image data URL");
    mime = m[1];
    b64 = m[2];
  }
  if (!mime || !b64) throw new Error("Missing image data");
  if (!MIME_TO_EXT[mime]) throw new Error("Unsupported image type (use JPEG, PNG, or WebP)");
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length === 0) throw new Error("Empty image");
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error("Image too large");
  return { mime, bytes };
}
