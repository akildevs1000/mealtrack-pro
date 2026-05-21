/**
 * Lightweight fetch wrapper for the MealTrack Pro backend.
 * Adds the bearer token from localStorage and unwraps JSON.
 */

const TOKEN_KEY = "mymeals.token.v1";

/**
 * Resolve the API base URL.
 *
 * Order of precedence:
 *   1. Runtime override — used by the desktop (Electron) build, where the API
 *      port is user-configurable and therefore unknown at build time:
 *        - client: `window.__MEALOPS_API_BASE__` (injected into the HTML <head>
 *          by web-server.mjs before any app script runs)
 *        - SSR/Node: `process.env.MEALOPS_API_BASE`
 *   2. Build-time `VITE_API_BASE` (the web deployment sets this in .env.production).
 *   3. Localhost default.
 *
 * When neither runtime source is present this collapses to the original
 * behaviour, so the existing web app is unaffected.
 */
function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const fromWindow = (window as { __MEALOPS_API_BASE__?: string }).__MEALOPS_API_BASE__;
    if (typeof fromWindow === "string" && fromWindow) return fromWindow;
  } else if (typeof process !== "undefined" && process.env?.MEALOPS_API_BASE) {
    return process.env.MEALOPS_API_BASE;
  }
  const baked = typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE;
  return baked || "http://localhost:5044/api";
}

export const API_BASE = resolveApiBase();

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...rest } = init;
  const h = new Headers(headers);
  if (!h.has("Content-Type") && rest.body && !(rest.body instanceof FormData)) {
    h.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getToken();
    if (token) h.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers: h });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401) {
      // Token rejected — clear it so the app routes the user back to login.
      setToken(null);
    }
    throw new ApiError(
      res.status,
      (data && typeof data === "object" && (data as any).error) || res.statusText,
      data,
    );
  }
  return data as T;
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}
