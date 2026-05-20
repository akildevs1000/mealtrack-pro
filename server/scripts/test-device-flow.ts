/**
 * End-to-end smoke test for the DEVICE REGISTRATION + SCANNER-ENROLMENT flow.
 *
 * This is the leg that test-manager-flow.ts intentionally skips ("the
 * mobile-scanner PIN / device-gate / scan leg is NOT covered here"). It drives
 * the live API the same way a physical Android scanner would — except the
 * "device" is just a synthetic MAC string, so NO physical hardware is needed.
 *
 *   1. before registration the device-gate rejects scanner login (403) and the
 *      public device lookup 404s
 *   2. admin registers the device in the web app (POST /devices)
 *   3. a non-admin/operator (camp manager) cannot register devices (403)
 *   4. the public lookup now resolves the device + its bound camp
 *   5. the scanner manager-picker lists the (active, PIN-bearing) manager
 *   6. scanner login: gate passes only for a REGISTERED MAC, and only with the
 *      correct PIN — wrong PIN 401s, unregistered MAC 403s
 *   7. a device bound to a different camp logs in but is flagged campMismatch
 *      (warning, not a block)
 *   8. the authenticated scanner can read /scanner/me and post a /scanner/scan
 *   9. after the device is de-registered the gate rejects login again
 *
 * Everything created here (devices + the test manager) is torn down at the end,
 * and the scan uses a bogus QR code so no real employee meal record is mutated.
 *
 * Run:  cd server && npx tsx scripts/test-device-flow.ts
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

// Build a device-registration payload (matches devices.ts upsertSchema).
function devicePayload(over: { name: string; macAddress: string; serial: string; campCode: string }) {
  return {
    name: over.name,
    campCode: over.campCode,
    battery: 87,
    online: true,
    macAddress: over.macAddress,
    serial: over.serial,
    model: "Zebra TC21",
    androidVersion: "11",
    appVersion: "1.0.0",
    ipAddress: "192.168.1.50",
    assignedTo: "Flow Test",
    registeredOn: today(),
  };
}

async function main() {
  console.log(c.dim(`API base: ${BASE}`));

  // --- Preflight ----------------------------------------------------------
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
  const adminToken: string | null = adminLogin.data?.token ?? null;
  if (!adminToken) {
    console.log(c.red("\nNo admin token — cannot continue. Check ADMIN_USER/ADMIN_PASS.\n"));
    return;
  }

  // --- 2. Resolve camps ---------------------------------------------------
  section("2. Resolve camps (as admin)");
  const campsRes = await api("/camps", { token: adminToken });
  const camps: { code: string; name: string }[] = Array.isArray(campsRes.data) ? campsRes.data : [];
  check("at least one camp exists", camps.length >= 1, `found ${camps.length}`);
  if (camps.length === 0) {
    console.log(c.red("\nNo camps seeded — run `npm run seed` first.\n"));
    return;
  }
  const campA = camps[0].code;
  const campB = camps.find((x) => x.code !== campA)?.code ?? null;
  console.log(
    c.dim(`  primary camp: ${campA}${campB ? `, secondary: ${campB}` : " (only one camp)"}`),
  );

  // Synthetic identity for our virtual scanner — no physical device involved.
  const uniq = Date.now().toString().slice(-8);
  const deviceMac = `AA:BB:CC:DD:${uniq.slice(0, 2)}:${uniq.slice(2, 4)}`;
  const macPath = encodeURIComponent(deviceMac);

  // IDs we must clean up no matter what fails mid-flow.
  let deviceId: string | null = null;
  let device2Id: string | null = null;
  let mgrId: string | null = null;

  try {
    // --- 3. Device-gate BEFORE registration (negative) ------------------
    section("3. Device-gate rejects an unregistered MAC");
    const preLookup = await api(`/scanner/device/${macPath}`);
    check("GET /scanner/device/:mac → 404 (not registered yet)", preLookup.status === 404, `got ${preLookup.status}`);
    const preLogin = await api("/scanner/login", {
      method: "POST",
      body: { managerId: "does-not-exist", pin: "1234", deviceMac },
    });
    check("POST /scanner/login (bogus creds) → 403", preLogin.status === 403, `got ${preLogin.status}`);
    check(
      "  ...reason === device_not_registered (gate fires before creds)",
      preLogin.data?.reason === "device_not_registered",
      String(preLogin.data?.reason),
    );

    // --- 4. Create a camp manager WITH a PIN ----------------------------
    section("4. Create camp manager with a scanner PIN (as admin)");
    const mgrUsername = `dev.flow.mgr.${uniq}`;
    const mgrPassword = "TestPass123";
    const mgrPin = "4321";
    const created = await api("/managers", {
      method: "POST",
      token: adminToken,
      body: {
        name: "Device Flow Manager",
        username: mgrUsername,
        password: mgrPassword,
        pin: mgrPin,
        email: `dev.flow.${uniq}@example.com`,
        phone: "+971 50 000 0000",
        emiratesId: "784-0000-0000000-0",
        campCode: campA,
        role: "CampManager",
        shift: "FullDay",
        joinDate: today(),
        expiryDate: plusDays(365),
        status: "Active",
      },
    });
    check("POST /managers → 201", created.status === 201, `got ${created.status}: ${JSON.stringify(created.data)}`);
    check("manager has a PIN (hasPin === true)", created.data?.hasPin === true, String(created.data?.hasPin));
    mgrId = created.data?.id ?? null;
    if (!mgrId) {
      console.log(c.red("\nManager not created — cannot exercise scanner login.\n"));
      return;
    }

    // --- 5. RBAC: a manager cannot register devices ---------------------
    section("5. RBAC — manager web token cannot register a device");
    const mgrWebLogin = await api("/auth/login", {
      method: "POST",
      body: { username: mgrUsername, password: mgrPassword },
    });
    const mgrWebToken: string | null = mgrWebLogin.data?.token ?? null;
    check("manager web login → 200", mgrWebLogin.status === 200, `got ${mgrWebLogin.status}`);
    const forbid = await api("/devices", {
      method: "POST",
      token: mgrWebToken,
      body: devicePayload({ name: `nope-${uniq}`, macAddress: deviceMac, serial: `NOPE-${uniq}`, campCode: campA }),
    });
    check("POST /devices as manager → 403 (admin|operator only)", forbid.status === 403, `got ${forbid.status}`);

    // --- 6. Register the device (as admin) ------------------------------
    section("6. Register the device (as admin)");
    const reg = await api("/devices", {
      method: "POST",
      token: adminToken,
      body: devicePayload({ name: `Scanner ${uniq}`, macAddress: deviceMac, serial: `SN-${uniq}`, campCode: campA }),
    });
    check("POST /devices → 201", reg.status === 201, `got ${reg.status}: ${JSON.stringify(reg.data)}`);
    check("device bound to camp A", reg.data?.camp === campA, reg.data?.camp);
    deviceId = reg.data?.id ?? null;

    // --- 7. Public device lookup now resolves ---------------------------
    section("7. Public device lookup resolves the registered device");
    const lookup = await api(`/scanner/device/${macPath}`);
    check("GET /scanner/device/:mac → 200", lookup.status === 200, `got ${lookup.status}`);
    check("lookup device.campCode === camp A", lookup.data?.device?.campCode === campA, lookup.data?.device?.campCode);
    check("lookup camp.code === camp A", lookup.data?.camp?.code === campA, lookup.data?.camp?.code);

    // --- 8. Scanner manager-picker --------------------------------------
    section("8. Scanner manager-picker lists the PIN-bearing manager");
    const picker = await api("/scanner/managers");
    const pickList: any[] = Array.isArray(picker.data) ? picker.data : [];
    check("GET /scanner/managers → 200", picker.status === 200, `got ${picker.status}`);
    check("our manager appears in the picker", pickList.some((m) => m.id === mgrId));

    // --- 9. Scanner login: gate + credential checks ---------------------
    section("9. Scanner login (device-gate + PIN)");
    const wrongPin = await api("/scanner/login", {
      method: "POST",
      body: { managerId: mgrId, pin: "0000", deviceMac },
    });
    check("registered MAC + WRONG pin → 401", wrongPin.status === 401, `got ${wrongPin.status}`);

    const wrongMac = await api("/scanner/login", {
      method: "POST",
      body: { managerId: mgrId, pin: mgrPin, deviceMac: "00:00:00:00:00:00" },
    });
    check("UNREGISTERED MAC + correct pin → 403", wrongMac.status === 403, `got ${wrongMac.status}`);
    check(
      "  ...reason === device_not_registered",
      wrongMac.data?.reason === "device_not_registered",
      String(wrongMac.data?.reason),
    );

    const ok = await api("/scanner/login", {
      method: "POST",
      body: { managerId: mgrId, pin: mgrPin, deviceMac },
    });
    check("registered MAC + correct pin → 200", ok.status === 200, `got ${ok.status}: ${JSON.stringify(ok.data)}`);
    check("scanner token issued", typeof ok.data?.token === "string");
    check("login returns the bound device", ok.data?.device?.id === deviceId, ok.data?.device?.id);
    check("login returns the manager's camp", ok.data?.camp?.code === campA, ok.data?.camp?.code);
    check("campMismatch === false (device matches manager's camp)", ok.data?.campMismatch === false, String(ok.data?.campMismatch));
    const scannerToken: string | null = ok.data?.token ?? null;

    // --- 10. Cross-camp device → campMismatch warning -------------------
    section("10. Cross-camp device is a warning, not a block");
    if (campB) {
      const mac2 = `AA:BB:CC:EE:${uniq.slice(0, 2)}:${uniq.slice(2, 4)}`;
      const reg2 = await api("/devices", {
        method: "POST",
        token: adminToken,
        body: devicePayload({ name: `Scanner B ${uniq}`, macAddress: mac2, serial: `SN-B-${uniq}`, campCode: campB }),
      });
      check("register a 2nd device on camp B → 201", reg2.status === 201, `got ${reg2.status}`);
      device2Id = reg2.data?.id ?? null;
      const crossLogin = await api("/scanner/login", {
        method: "POST",
        body: { managerId: mgrId, pin: mgrPin, deviceMac: mac2 },
      });
      check("manager (camp A) on a camp-B device → 200", crossLogin.status === 200, `got ${crossLogin.status}`);
      check("  ...campMismatch === true", crossLogin.data?.campMismatch === true, String(crossLogin.data?.campMismatch));
      check("  ...camp still resolves to the MANAGER's camp", crossLogin.data?.camp?.code === campA, crossLogin.data?.camp?.code);
    } else {
      console.log(c.dim("  (skipped — only one camp seeded)"));
    }

    // --- 11. Authenticated scanner session ------------------------------
    section("11. Authenticated scanner session");
    if (scannerToken) {
      const me = await api("/scanner/me", { token: scannerToken });
      check("GET /scanner/me → 200", me.status === 200, `got ${me.status}`);
      check("/scanner/me returns our manager", me.data?.manager?.id === mgrId, me.data?.manager?.id);

      // Non-destructive scan: bogus code + forced meal → deterministic
      // "not_eligible / unknown_employee" without touching real meal records.
      const scan = await api("/scanner/scan", {
        method: "POST",
        token: scannerToken,
        body: { code: `__BOGUS_${uniq}`, meal: "Lunch", deviceMac },
      });
      check("POST /scanner/scan → 200", scan.status === 200, `got ${scan.status}`);
      check(
        "unknown QR → status not_eligible / unknown_employee",
        scan.data?.status === "not_eligible" && scan.data?.reason === "unknown_employee",
        `${scan.data?.status} / ${scan.data?.reason}`,
      );
      check("scan recorded against the manager's camp", scan.data?.scan?.camp === campA, scan.data?.scan?.camp);

      const noToken = await api("/scanner/me");
      check("GET /scanner/me without token → 401", noToken.status === 401, `got ${noToken.status}`);
    } else {
      console.log(c.red("  no scanner token — skipping session checks"));
    }
  } finally {
    // --- 12. Cleanup ----------------------------------------------------
    section("12. Cleanup (as admin)");
    if (deviceId) {
      const del = await api(`/devices/${deviceId}`, { method: "DELETE", token: adminToken });
      check("DELETE /devices/:id → 204", del.status === 204, `got ${del.status}`);
      // De-registered → the gate must reject login again.
      const afterLogin = await api("/scanner/login", {
        method: "POST",
        body: { managerId: mgrId ?? "x", pin: "4321", deviceMac },
      });
      check("scanner login after de-registration → 403", afterLogin.status === 403, `got ${afterLogin.status}`);
      const afterLookup = await api(`/scanner/device/${macPath}`);
      check("GET /scanner/device/:mac → 404 again", afterLookup.status === 404, `got ${afterLookup.status}`);
    }
    if (device2Id) {
      const del2 = await api(`/devices/${device2Id}`, { method: "DELETE", token: adminToken });
      check("DELETE 2nd device → 204", del2.status === 204, `got ${del2.status}`);
    }
    if (mgrId) {
      const delMgr = await api(`/managers/${mgrId}`, { method: "DELETE", token: adminToken });
      check("DELETE /managers/:id → 204", delMgr.status === 204, `got ${delMgr.status}`);
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
