import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setToken } from "./api";

export type Role = "admin" | "operator" | "user" | "manager";
export type TabKey =
  | "overview" | "scanner" | "companies" | "camps" | "projects" | "employees" | "managers"
  | "catering" | "forecast" | "devices" | "reports" | "automation" | "users";

export type Perm = { view: boolean; edit: boolean; delete: boolean };
export type RolePermissions = Record<TabKey, Perm>;

export type AppUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  assignedCampCode?: string | null;
  assignedCampCodes?: string[];
  status: "Active" | "Inactive";
};

export const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "scanner", label: "QR Scanner" },
  { key: "companies", label: "Companies" },
  { key: "camps", label: "Camps" },
  { key: "projects", label: "Projects" },
  { key: "employees", label: "Employees" },
  { key: "managers", label: "Distributors" },
  { key: "catering", label: "Catering Companies" },
  { key: "forecast", label: "Forecast" },
  { key: "devices", label: "Devices" },
  { key: "reports", label: "Reports" },
  { key: "automation", label: "Automation" },
  { key: "users", label: "User Profiles" },
];

const NONE: Perm = { view: false, edit: false, delete: false };
const ALL: Perm = { view: true, edit: true, delete: true };

function emptyMatrix(): Record<Role, RolePermissions> {
  const role = (def: Perm) =>
    TABS.reduce((acc, t) => { acc[t.key] = def; return acc; }, {} as RolePermissions);
  return { admin: role(ALL), operator: role(NONE), user: role(NONE), manager: role(NONE) };
}

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; user: AppUser; perms: Record<Role, RolePermissions> };

type Ctx = {
  status: AuthState["status"];
  currentUser: AppUser | null;
  perms: Record<Role, RolePermissions>;
  campScope: string[] | null;
  can: (tab: TabKey, action?: keyof Perm) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const loadSession = async () => {
    try {
      const user = await api<AppUser>("/auth/me");
      // Load the real DB permission matrix. Admins can read all roles
      // (/permissions/all); everyone else reads just their own role
      // (/permissions/me) so the UI reflects what the admin actually
      // configured — NOT a hardcoded default that would over-grant access.
      let perms = emptyMatrix();
      const applyMatrix = (matrix: Record<string, Record<string, Perm>>) => {
        // Only override what the API returned; unseeded tabs keep emptyMatrix()
        // defaults (admin: ALL, others: NONE) so a freshly-deployed tab isn't
        // dead for admins until ensureDefaultPermissions catches up.
        for (const role of Object.keys(perms) as Role[]) {
          for (const t of TABS) {
            const apiPerm = matrix[role]?.[t.key];
            if (apiPerm) perms[role][t.key] = apiPerm;
          }
        }
      };
      try {
        const endpoint =
          user.role === "admin" ? "/users/permissions/all" : "/users/permissions/me";
        applyMatrix(await api<Record<string, Record<string, Perm>>>(endpoint));
      } catch {
        // Network/endpoint failure only — fall back to the seed-matching default.
        perms = defaultPermsFor(user.role);
      }
      setState({ status: "authenticated", user, perms });
    } catch {
      setToken(null);
      setState({ status: "unauthenticated" });
    }
  };

  useEffect(() => {
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(() => {
    const currentUser = state.status === "authenticated" ? state.user : null;
    const perms = state.status === "authenticated" ? state.perms : emptyMatrix();
    const campScope =
      currentUser?.role === "manager"
        ? currentUser.assignedCampCodes?.length
          ? currentUser.assignedCampCodes
          : currentUser.assignedCampCode
            ? [currentUser.assignedCampCode]
            : null
        : null;

    return {
      status: state.status,
      currentUser,
      perms,
      campScope,
      can: (tab, action = "view") => {
        if (!currentUser) return false;
        return Boolean(perms[currentUser.role]?.[tab]?.[action]);
      },
      login: async (username, password) => {
        const res = await api<{ token: string; user: AppUser }>("/auth/login", {
          method: "POST",
          auth: false,
          body: JSON.stringify({ username, password }),
        });
        setToken(res.token);
        await loadSession();
      },
      logout: () => {
        setToken(null);
        setState({ status: "unauthenticated" });
      },
      refresh: loadSession,
    };
  }, [state]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function useTabPerm(tab: TabKey): Perm {
  const { currentUser, perms } = useSession();
  if (!currentUser) return NONE;
  return perms[currentUser.role][tab];
}

export function useCampScope() {
  return useSession().campScope;
}

const VIEW: Perm = { view: true, edit: false, delete: false };
const EDIT: Perm = { view: true, edit: true, delete: false };

// Fallback for non-admins who can't read the global permissions matrix.
// Mirrors the seed defaults.
function defaultPermsFor(role: Role): Record<Role, RolePermissions> {
  const m = emptyMatrix();
  const apply = (r: Role, p: Partial<Record<TabKey, Perm>>) => {
    for (const t of TABS) m[r][t.key] = p[t.key] ?? NONE;
  };
  if (role === "operator") {
    apply("operator", {
      overview: VIEW, scanner: EDIT, companies: EDIT, camps: EDIT, projects: EDIT, employees: EDIT,
      managers: VIEW, forecast: EDIT, devices: EDIT, reports: VIEW,
      automation: EDIT, users: NONE,
    });
  } else if (role === "user") {
    apply("user", {
      overview: VIEW, scanner: VIEW, companies: VIEW, camps: VIEW, projects: VIEW, employees: VIEW,
      managers: NONE, forecast: VIEW, devices: VIEW, reports: VIEW,
      automation: NONE, users: NONE,
    });
  } else if (role === "manager") {
    apply("manager", {
      overview: VIEW, scanner: EDIT, companies: VIEW, camps: VIEW, projects: VIEW, employees: VIEW,
      managers: NONE, forecast: VIEW, devices: VIEW, reports: VIEW,
      automation: NONE, users: NONE,
    });
  }
  return m;
}
