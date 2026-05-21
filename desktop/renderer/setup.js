// Setup / settings window. Two steps:
//   1. choose "New database" or "Existing database"  (skipped in Settings mode)
//   2. fill the connection form and launch
// Talks to the main process only through the `mymeals` bridge (preload.cjs).

const $ = (id) => document.getElementById(id);

const els = {
  title: $("title"),
  subtitle: $("subtitle"),
  choose: $("choose"),
  choiceNew: $("choice-new"),
  choiceExisting: $("choice-existing"),
  formScreen: $("form-screen"),
  backBtn: $("back-btn"),
  dbHost: $("db-host"),
  dbPort: $("db-port"),
  dbUser: $("db-user"),
  dbPassword: $("db-password"),
  dbName: $("db-name"),
  dbNameLabel: $("db-name-label"),
  dbNameHint: $("db-name-hint"),
  testBtn: $("test-btn"),
  testResult: $("test-result"),
  adminGroup: $("admin-group"),
  adminUser: $("admin-user"),
  adminPassword: $("admin-password"),
  adminPassword2: $("admin-password2"),
  apiPort: $("api-port"),
  webPort: $("web-port"),
  serverAddress: $("server-address"),
  serverAddressHint: $("server-address-hint"),
  formError: $("form-error"),
  saveBtn: $("save-btn"),
  overlay: $("overlay"),
  overlayTitle: $("overlay-title"),
  progressLog: $("progress-log"),
};

// "new" | "existing" | "settings"
let flowMode = "new";
let cfg = null;

function bridgeReady() {
  return window.mymeals && typeof window.mymeals.save === "function";
}

function readDb() {
  return {
    host: els.dbHost.value.trim() || "127.0.0.1",
    port: Number(els.dbPort.value) || 5432,
    user: els.dbUser.value.trim() || "postgres",
    password: els.dbPassword.value,
    database: els.dbName.value.trim() || "mymeals",
  };
}

function showError(msg) {
  els.formError.hidden = !msg;
  els.formError.textContent = msg || "";
}

function setTestResult(text, kind) {
  els.testResult.textContent = text || "";
  els.testResult.className = "result" + (kind ? " " + kind : "");
}

function prefillConnection() {
  els.dbHost.value = cfg.db.host || "";
  els.dbPort.value = cfg.db.port || "";
  els.dbUser.value = cfg.db.user || "";
  els.dbPassword.value = cfg.db.password || "";
  els.dbName.value = cfg.db.database || "";
  els.apiPort.value = cfg.apiPort || "";
  els.webPort.value = cfg.webPort || "";
  els.serverAddress.value = cfg.serverAddress || "";
  if (cfg.detectedIp) {
    els.serverAddress.placeholder = cfg.detectedIp;
    els.serverAddressHint.textContent =
      `Leave blank to detect automatically (detected: ${cfg.detectedIp}). ` +
      "This is the address other devices/scanners use to open MyMeal.";
  }
}

function showForm(mode) {
  flowMode = mode;
  showError(null);
  setTestResult("", "");
  els.choose.hidden = true;
  els.formScreen.hidden = false;

  const isNew = mode === "new";
  els.adminGroup.hidden = !isNew; // admin only when creating a new database
  els.backBtn.hidden = mode === "settings";

  if (mode === "new") {
    els.title.textContent = "Set up a new database";
    els.subtitle.textContent = "We'll create the database and your administrator account.";
    els.dbNameLabel.textContent = "New database name";
    els.dbNameHint.textContent = "Created automatically — pick a name that doesn't exist yet.";
    els.saveBtn.textContent = "Create & Launch";
  } else if (mode === "existing") {
    els.title.textContent = "Connect to an existing database";
    els.subtitle.textContent = "We'll apply any pending updates, then open the app.";
    els.dbNameLabel.textContent = "Existing database name";
    els.dbNameHint.textContent = "This database must already exist.";
    els.saveBtn.textContent = "Connect & Launch";
  } else {
    // settings
    els.title.textContent = "Settings";
    els.subtitle.textContent = "Update the database connection or application ports.";
    els.dbNameLabel.textContent = "Database name";
    els.dbNameHint.textContent = "";
    els.saveBtn.textContent = "Save & Restart";
  }
}

function showChoose() {
  els.formScreen.hidden = true;
  els.choose.hidden = false;
  els.title.textContent = "Welcome to MyMeal";
  els.subtitle.textContent = "How would you like to connect your database?";
}

async function init() {
  if (!bridgeReady()) {
    els.choose.hidden = true;
    els.formScreen.hidden = false;
    els.backBtn.hidden = true;
    showError(
      "The setup bridge failed to load (preload script). Please close and restart MyMeal. " +
        "If this keeps happening, check %APPDATA%\\mymeals-desktop\\desktop.log.",
    );
    return;
  }
  cfg = await window.mymeals.getConfig();
  if (cfg.mode === "settings") {
    prefillConnection();
    showForm("settings");
  } else {
    showChoose();
  }
}

els.choiceNew.addEventListener("click", () => {
  prefillConnection();
  els.dbName.value = ""; // force a deliberate new name
  showForm("new");
});

els.choiceExisting.addEventListener("click", () => {
  prefillConnection();
  showForm("existing");
});

els.backBtn.addEventListener("click", showChoose);

els.testBtn.addEventListener("click", async () => {
  els.testBtn.disabled = true;
  setTestResult("Testing…", "");
  try {
    const res = await window.mymeals.testConnection(readDb());
    setTestResult(res.message, res.ok ? "ok" : "err");
  } catch (err) {
    setTestResult(String(err && err.message ? err.message : err), "err");
  } finally {
    els.testBtn.disabled = false;
  }
});

function validate() {
  if (!els.dbName.value.trim()) return "Enter a database name.";
  if (flowMode === "new") {
    const u = els.adminUser.value.trim();
    const p = els.adminPassword.value;
    if (!u) return "Enter an administrator username.";
    if (p.length < 6) return "Administrator password must be at least 6 characters.";
    if (p !== els.adminPassword2.value) return "The two administrator passwords do not match.";
  }
  return null;
}

function endOverlay() {
  els.overlay.hidden = true;
  els.saveBtn.disabled = false;
}

els.saveBtn.addEventListener("click", async () => {
  showError(null);
  if (!bridgeReady()) return showError("Setup bridge not available — please restart MyMeal.");
  const problem = validate();
  if (problem) return showError(problem);

  const data = {
    mode: flowMode === "settings" ? "existing" : flowMode,
    db: readDb(),
    apiPort: Number(els.apiPort.value) || 5044,
    webPort: Number(els.webPort.value) || 8044,
    serverAddress: els.serverAddress.value.trim(),
    admin:
      flowMode === "new"
        ? { username: els.adminUser.value.trim(), password: els.adminPassword.value }
        : null,
  };

  els.progressLog.textContent = "";
  els.overlayTitle.textContent = flowMode === "settings" ? "Restarting…" : "Setting things up…";
  els.overlay.hidden = false;
  els.saveBtn.disabled = true;

  let unsubscribe;
  try {
    unsubscribe = window.mymeals.onProgress((msg) => {
      els.progressLog.textContent += msg + "\n";
      els.progressLog.scrollTop = els.progressLog.scrollHeight;
    });
    const res = await window.mymeals.save(data);
    if (!res || !res.ok) {
      endOverlay();
      showError((res && res.error) || "Setup failed.");
    }
    // On success the main process closes this window and opens the app.
  } catch (err) {
    endOverlay();
    showError(String(err && err.message ? err.message : err));
  } finally {
    if (typeof unsubscribe === "function") unsubscribe();
  }
});

init().catch((err) => showError("Startup error: " + (err && err.message ? err.message : err)));
