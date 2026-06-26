import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, BuildingIcon, Building2, FolderKanban, Smartphone, FileBarChart, CalendarRange,
  Bell, Settings, UtensilsCrossed, Moon, Sun, Search, KeyRound, ShieldCheck,
  LogOut, Loader2, CalendarClock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SessionProvider, useSession, type TabKey } from "@/lib/session";
import { Login } from "@/components/app/Login";

const nav: { to: string; label: string; icon: typeof LayoutDashboard; key: TabKey }[] = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard, key: "overview" },
  { to: "/companies", label: "Companies", icon: Building2, key: "companies" },
  { to: "/camps", label: "Camps", icon: BuildingIcon, key: "camps" },
  { to: "/projects", label: "Projects", icon: FolderKanban, key: "projects" },
  { to: "/employees", label: "Employees", icon: Users, key: "employees" },
  { to: "/managers", label: "Suppliers", icon: KeyRound, key: "managers" },
  { to: "/forecast", label: "Forecast", icon: CalendarRange, key: "forecast" },
  { to: "/devices", label: "Devices", icon: Smartphone, key: "devices" },
  { to: "/reports", label: "Reports", icon: FileBarChart, key: "reports" },
  { to: "/schedules", label: "Automation", icon: CalendarClock, key: "automation" },
  { to: "/users", label: "User Profiles", icon: ShieldCheck, key: "users" },
];

export function AppLayout() {
  return (
    <SessionProvider>
      <AppLayoutInner />
    </SessionProvider>
  );
}

function AppLayoutInner() {
  const session = useSession();

  if (session.status === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (session.status === "unauthenticated" || !session.currentUser) {
    return <Login />;
  }

  return <Shell />;
}

function Shell() {
  const location = useLocation();
  const [dark, setDark] = useState(true);
  const session = useSession();
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  if (!session.currentUser) return null;

  const visibleNav = nav.filter((n) => session.can(n.key, "view"));
  const initials = session.currentUser.name
    .split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex flex-col w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 py-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="size-10 rounded-xl gradient-primary grid place-items-center shadow-glow">
            <UtensilsCrossed className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display font-bold text-base leading-tight">MyMeals</div>
            <div className="text-xs text-sidebar-foreground/60">Distribution Suite</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {visibleNav.map((n) => {
            const active = location.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-primary shadow-elegant"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="size-4" />
                {n.label}
                {active && <span className="ml-auto size-1.5 rounded-full bg-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="m-3 p-4 rounded-xl bg-sidebar-accent/60 border border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/60">System status</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            All systems operational
          </div>
          <div className="mt-2 text-xs text-sidebar-foreground/60">Logged in as {session.currentUser.role}</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-border">
          <div className="h-16 px-4 md:px-8 flex items-center gap-4">
            <div className="md:hidden size-9 rounded-lg gradient-primary grid place-items-center shrink-0">
              <UtensilsCrossed className="size-4 text-primary-foreground" />
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                placeholder="Search employees, camps, devices…"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-secondary text-sm border border-transparent focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setDark((d) => !d)}
                className="size-9 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground"
                aria-label="Toggle theme"
              >
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <button className="relative size-9 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground">
                <Bell className="size-4" />
                <span className="absolute top-2 right-2 size-1.5 rounded-full bg-destructive" />
              </button>
              <button className="size-9 grid place-items-center rounded-lg hover:bg-secondary text-muted-foreground">
                <Settings className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-3 pl-3 ml-1 border-l border-border">
              <div className="hidden sm:block text-right leading-tight">
                <div className="text-sm font-medium">{session.currentUser.name}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {session.currentUser.role}
                  {session.currentUser.assignedCampCode ? ` · ${session.currentUser.assignedCampCode}` : ""}
                </div>
              </div>
              <div className="size-9 rounded-full gradient-accent grid place-items-center text-primary-foreground font-semibold text-xs shrink-0">
                {initials}
              </div>
              <button
                onClick={session.logout}
                className="size-9 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 md:px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
