/**
 * End-to-end smoke test for the WEB-SIDE camp-manager flow.
 *
 * Drives the live API (default http://localhost:5044/api) through the full
 * lifecycle an admin and a camp manager go through in the web app:
 *
 *   1. admin logs in
 *   2. admin creates a camp manager (which also creates the linked User row)
 *   3. the create endpoint rejects a duplicate username (409)
 *   4. the manager logs in and is tagged role=manager + assignedCampCode
 *   5. every list endpoint is camp-scoped to the manager's camp
 *   6. /overview auto-scopes and 403s on a camp outside the manager's scope
 *   7. admin-only / operator-only routes are forbidden for the manager
 *   8. admin deletes the manager; the linked login then stops working
 *
 * The mobile-scanner (PIN / device-gate / scan) leg is intentionally NOT
 * covered here — this is the web side only.
 *
 * Run:  cd server && npx tsx scripts/test-manager-flow.ts
 * Env:  API_BASE, ADMIN_USER, ADMIN_PASS, NO_COLOR
 */

const BASE = process.env.API_BASE ?? "http://localhost:5044/api";
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASS ?? "password123";

const useColor = !process.env.NO_COLOR;
const c = {
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
};

type ApiResult = { status: number; ok: boolean; data: any };

async function api(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers["Authorization"] = `Bearer ${init.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

let passed = 0;
let failed = 0;

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ${c.green("✓")} ${label}`);
  } else {
    failed++;
    console.log(`  ${c.red("✗")} ${label}${detail ? c.dim(`  — ${detail}`) : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${c.cyan(title)}`);
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function main() {
  console.log(c.dim(`API base: ${BASE}`));

  // --- Preflight: is the server up? ---------------------------------------
  section("Preflight");
  let health: ApiResult;
  try {
    health = await api("/health");
  } catch (e) {
    console.log(
      c.red(`\nCannot reach ${BASE}. Is the backend running? (cd server && npm run dev)\n`),
    );
    throw e;
  }
  check("GET /health responds 200", health.status === 200, `got ${health.status}`);

  // --- 1. Admin login -----------------------------------------------------
  section("1. Admin login");
  const adminLogin = await api("/auth/login", {
    method: "POST",
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  check("admin login → 200", adminLogin.status === 200, `got ${adminLogin.status}`);
  check("admin token issued", typeof adminLogin.data?.token === "string");
  check("user.role === admin", adminLogin.data?.user?.role === "admin", adminLogin.data?.user?.role);
  const adminToken: string | null = adminLogin.data?.token ?? null;
  if (!adminToken) {
    console.log(c.red("\nNo admin token — cannot continue. Check ADMIN_USER/ADMIN_PASS.\n"));
    return;
  }

  // --- 2. Pick camps to work with -----------------------------------------
  section("2. Resolve camps (as admin)");
  const campsRes = await api("/camps", { token: adminToken });
  check("GET /camps → 200", campsRes.status === 200, `got ${campsRes.status}`);
  const camps: { code: string; name: string }[] = Array.isArray(campsRes.data) ? campsRes.data : [];
  check("at least one camp exists", camps.length >= 1, `found ${camps.length}`);
  if (camps.length === 0) {
    console.log(c.red("\nNo camps seeded — run `npm run seed` first.\n"));
    return;
  }
  const campA = camps[0].code;
  const campB = camps.find((c) => c.code !== campA)?.code ?? null;
  console.log(c.dim(`  primary camp: ${campA}${campB ? `, secondary: ${campB}` : " (only one camp)"}`));

  // --- 3. Admin creates a camp manager ------------------------------------
  section("3. Create camp manager (as admin)");
  const uniq = Date.now().toString().slice(-8);
  const mgrUsername = `test.mgr.${uniq}`;
  const mgrPassword = "TestPass123";
  const createPayload = {
    name: "Flow Test Manager",
    username: mgrUsername,
    password: mgrPassword,
    email: `flow.${uniq}@example.com`,
    phone: "+971 50 000 0000",
    emiratesId: "784-0000-0000000-0",
    campCode: campA,
    role: "CampManager",
    shift: "FullDay",
    joinDate: today(),
    expiryDate: plusDays(365),
    status: "Active",
    permBreakfast: true,
    permLunch: true,
    permDinner: true,
    permReports: true,
  };
  const created = await api("/managers", {
    method: "POST",
    token: adminToken,
    body: createPayload,
  });
  check("POST /managers → 201", created.status === 201, `got ${created.status}: ${JSON.stringify(created.data)}`);
  check("manager.camp === assigned camp", created.data?.camp === campA, created.data?.camp);
  check("manager has no PIN (web-only create)", created.data?.hasPin === false, String(created.data?.hasPin));
  const mgrId: string | null = created.data?.id ?? null;

  // Wrap the rest so we always attempt cleanup of the created manager.
  try {
    if (!mgrId) {
      console.log(c.red("\nManager was not created — skipping remaining steps.\n"));
      return;
    }

    // --- 4. Duplicate-username guard --------------------------------------
    section("4. Duplicate username is rejected");
    const dupe = await api("/managers", { method: "POST", token: adminToken, body: createPayload });
    check("re-creating same username → 409", dupe.status === 409, `got ${dupe.status}`);

    // --- 5. Manager logs in -----------------------------------------------
    section("5. Manager web login");
    const mgrLogin = await api("/auth/login", {
      method: "POST",
      body: { username: mgrUsername, password: mgrPassword },
    });
    check("manager login → 200 (linked User row exists)", mgrLogin.status === 200, `got ${mgrLogin.status}`);
    check("user.role === manager", mgrLogin.data?.user?.role === "manager", mgrLogin.data?.user?.role);
    check(
      "user.assignedCampCode === assigned camp",
      mgrLogin.data?.user?.assignedCampCode === campA,
      mgrLogin.data?.user?.assignedCampCode,
    );
    const mgrToken: string | null = mgrLogin.data?.token ?? null;
    if (!mgrToken) {
      console.log(c.red("\nManager login failed — skipping scoping/RBAC checks.\n"));
      return;
    }

    section("6. GET /auth/me (as manager)");
    const me = await api("/auth/me", { token: mgrToken });
    check("/auth/me role === manager", me.data?.role === "manager", me.data?.role);
    check("/auth/me assignedCampCode === assigned camp", me.data?.assignedCampCode === campA, me.data?.assignedCampCode);

    // --- 7. Camp scoping on list endpoints --------------------------------
    section("7. Camp scoping (as manager)");
    const mCamps = await api("/camps", { token: mgrToken });
    const camplist: any[] = Array.isArray(mCamps.data) ? mCamps.data : [];
    check(
      "GET /camps returns only the manager's camp",
      camplist.length === 1 && camplist.every((x) => x.code === campA),
      `len=${camplist.length}`,
    );

    const mMgrs = await api("/managers", { token: mgrToken });
    const mgrlist: any[] = Array.isArray(mMgrs.data) ? mMgrs.data : [];
    check(
      "GET /managers limited to the manager's camp",
      mgrlist.every((x) => x.camp === campA),
      `offending=${mgrlist.filter((x) => x.camp !== campA).map((x) => x.camp).join(",")}`,
    );

    const mEmp = await api("/employees", { token: mgrToken });
    const emplist: any[] = Array.isArray(mEmp.data) ? mEmp.data : [];
    check(
      "GET /employees limited to the manager's camp",
      emplist.every((x) => x.campCode === campA),
      `offending=${[...new Set(emplist.filter((x) => x.campCode !== campA).map((x) => x.campCode))].join(",")}`,
    );

    const mScans = await api("/scans?limit=200", { token: mgrToken });
    const scanlist: any[] = Array.isArray(mScans.data) ? mScans.data : [];
    check(
      "GET /scans limited to the manager's camp",
      scanlist.every((x) => x.camp === campA),
      `offending=${[...new Set(scanlist.filter((x) => x.camp !== campA).map((x) => x.camp))].join(",")}`,
    );

    const mOv = await api("/overview", { token: mgrToken });
    check("GET /overview → 200", mOv.status === 200, `got ${mOv.status}`);
    check("overview.kpis.totalCamps === 1 (auto-scoped)", mOv.data?.kpis?.totalCamps === 1, String(mOv.data?.kpis?.totalCamps));
    const comp: any[] = Array.isArray(mOv.data?.campComparison) ? mOv.data.campComparison : [];
    check(
      "overview.campComparison only the manager's camp",
      comp.every((x) => x.name === campA),
      comp.map((x) => x.name).join(","),
    );

    if (campB) {
      const cross = await api(`/overview?campCode=${encodeURIComponent(campB)}`, { token: mgrToken });
      check("GET /overview?campCode=<other camp> → 403", cross.status === 403, `got ${cross.status}`);
    } else {
      console.log(c.dim("  (skipped cross-scope 403 — only one camp seeded)"));
    }

    // --- 8. RBAC denials --------------------------------------------------
    section("8. RBAC denials (as manager)");
    check("GET /users → 403 (admin only)", (await api("/users", { token: mgrToken })).status === 403);
    check(
      "GET /users/permissions/all → 403 (admin only)",
      (await api("/users/permissions/all", { token: mgrToken })).status === 403,
    );
    const campPost = await api("/camps", {
      method: "POST",
      token: mgrToken,
      body: { code: "ZZ-99", name: "Nope", site: "Nowhere" },
    });
    check("POST /camps → 403 (admin|operator only)", campPost.status === 403, `got ${campPost.status}`);
    const selfDelete = await api(`/managers/${mgrId}`, { method: "DELETE", token: mgrToken });
    check("DELETE /managers/:id → 403 (admin only)", selfDelete.status === 403, `got ${selfDelete.status}`);
  } finally {
    // --- 9. Cleanup -------------------------------------------------------
    section("9. Cleanup (as admin)");
    if (mgrId) {
      const del = await api(`/managers/${mgrId}`, { method: "DELETE", token: adminToken });
      check("DELETE /managers/:id → 204", del.status === 204, `got ${del.status}`);
      const after = await api("/managers", { token: adminToken });
      const stillThere = Array.isArray(after.data) && after.data.some((m: any) => m.id === mgrId);
      check("manager no longer listed", !stillThere);
      const reLogin = await api("/auth/login", {
        method: "POST",
        body: { username: mgrUsername, password: mgrPassword },
      });
      check("manager login now fails (linked User removed)", reLogin.status === 401, `got ${reLogin.status}`);
    } else {
      console.log(c.dim("  (nothing to clean up)"));
    }
  }
}

main()
  .then(() => {
    console.log(
      `\n${failed === 0 ? c.green("ALL PASSED") : c.red("FAILURES")}  ${c.green(`${passed} passed`)}, ${
        failed > 0 ? c.red(`${failed} failed`) : "0 failed"
      }\n`,
    );
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(c.red(`\nUnexpected error: ${err?.message ?? err}\n`));
    process.exit(1);
  });
