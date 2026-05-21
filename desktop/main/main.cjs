// MyMeal desktop shell — Electron main process.
//
// First launch  : show the Setup window (DB connection + admin + ports),
//                 persist it, provision the database, then open the app.
// Later launches: read the saved config, bring the servers up, open the app.
// Settings       : reopen Setup at any time to change DB/ports; on save the
//                 servers restart against the new config.

const path = require("path");
const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require("electron");
const logger = require("./logger.cjs");
logger.init();
const {
  defaultConfig,
  loadConfig,
  saveConfig,
} = require("./config.cjs");
const { paths } = require("./paths.cjs");
const fs = require("fs");
const servers = require("./servers.cjs");

let setupWindow = null;
let mainWindow = null;
let logsWindow = null;
let isQuitting = false;

const SETUP_HTML = path.join(__dirname, "..", "renderer", "setup.html");
const LOGS_HTML = path.join(__dirname, "..", "renderer", "logs.html");

function preflightRuntime() {
  // Make a missing build obvious instead of failing deep inside a child process.
  const p = paths();
  const missing = [];
  if (!fs.existsSync(p.apiEntry)) missing.push("server/dist/index.js");
  if (!fs.existsSync(p.distServer)) missing.push("dist/server/server.js");
  if (!fs.existsSync(p.webServer)) missing.push("web-server.mjs");
  return missing;
}

function createSetupWindow(mode) {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 720,
    height: 760,
    resizable: true,
    title: mode === "settings" ? "MyMeal — Settings" : "MyMeal — Setup",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.loadFile(SETUP_HTML);
  // Surface renderer console + preload-load failures in desktop.log (the
  // renderer has its own console we otherwise can't see).
  setupWindow.webContents.on("console-message", (e, level, message) => {
    console.log(`[setup-console] ${message != null ? message : e && e.message}`);
  });
  setupWindow.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error(`[setup-preload-error] ${preloadPath}: ${(error && error.stack) || error}`);
  });
  setupWindow.on("closed", () => {
    setupWindow = null;
    // Closing setup before the app exists (first run, user cancelled) = quit.
    if (!mainWindow && !isQuitting) app.quit();
  });
}

function createLogsWindow() {
  if (logsWindow) {
    logsWindow.focus();
    return;
  }
  logsWindow = new BrowserWindow({
    width: 900,
    height: 600,
    title: "MyMeal — Logs",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  logsWindow.loadFile(LOGS_HTML);
  logsWindow.on("closed", () => {
    logsWindow = null;
  });
}

function createMainWindow(cfg) {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    show: false,
    title: "MyMeal",
    autoHideMenuBar: false, // keep the menu bar visible so Settings is easy to find
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  // Open target=_blank / external links in the system browser, not a new window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(`http://127.0.0.1:${cfg.webPort}/`);
  buildMenu();
}

function buildMenu() {
  const template = [
    {
      label: "Settings",
      submenu: [
        {
          label: "Database && Ports…",
          accelerator: "CmdOrCtrl+S",
          click: () => createSetupWindow("settings"),
        },
        {
          label: "View Logs…",
          accelerator: "CmdOrCtrl+L",
          click: () => createLogsWindow(),
        },
        {
          label: "Network Address…",
          click: () => showNetworkAddress(),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showFatal(title, message) {
  dialog.showErrorBox(title, message);
}

function showNetworkAddress() {
  const cfg = loadConfig() || defaultConfig();
  const urls = servers.networkUrls(cfg);
  const detail = urls.length
    ? "Open MyMeal from a phone, tablet or another PC on the same network at:\n\n" +
      urls.map((u) => "    " + u).join("\n") +
      `\n\n(This PC must stay on with MyMeal running. Also reachable here at http://localhost:${cfg.webPort}.)`
    : "No network connection was found. Connect this PC to Wi-Fi or a network and try again.";
  dialog.showMessageBox(mainWindow || undefined, {
    type: "info",
    title: "Network Address",
    message: "Open MyMeal on your network",
    detail,
    buttons: ["OK"],
  });
}

// ---- App startup ---------------------------------------------------------

async function start() {
  const missing = preflightRuntime();
  if (missing.length) {
    showFatal(
      "Build missing",
      "The app files haven't been built yet:\n\n  " +
        missing.join("\n  ") +
        "\n\nRun `npm run build` in the project root and `npm run build` in server/, then relaunch.",
    );
    app.quit();
    return;
  }

  const cfg = loadConfig();
  if (!cfg || !cfg.setupComplete) {
    createSetupWindow("setup");
    return;
  }

  // Returning user: the database already exists — connect, apply any pending
  // migrations, then open the app window.
  try {
    await servers.provision(cfg, { mode: "existing" });
    createMainWindow(cfg);
  } catch (err) {
    // Couldn't start with the saved config (DB moved, server down, …) — fall
    // back to the Setup window so the user can fix the connection.
    servers.stopServers();
    showFatal(
      "Could not start MyMeal",
      String(err && err.message ? err.message : err) +
        "\n\nThe setup screen will open so you can update the connection.",
    );
    createSetupWindow("settings");
  }
}

// ---- IPC (from the setup window) -----------------------------------------

ipcMain.handle("setup:get-config", () => {
  const cfg = loadConfig();
  const base = cfg || defaultConfig();
  return {
    db: base.db,
    apiPort: base.apiPort,
    webPort: base.webPort,
    serverAddress: base.serverAddress || "",
    detectedIp: servers.detectedIp(),
    mode: cfg && cfg.setupComplete ? "settings" : "setup",
  };
});

ipcMain.handle("setup:test-connection", (_e, db) => servers.testConnection(db));

// ---- Logs viewer IPC -----------------------------------------------------

ipcMain.handle("logs:read", () => {
  try {
    return fs.readFileSync(logger.logFile(), "utf8");
  } catch {
    return "";
  }
});
ipcMain.handle("logs:open-file", () => shell.openPath(logger.logFile()));
ipcMain.handle("logs:open-folder", () => shell.showItemInFolder(logger.logFile()));

ipcMain.handle("setup:save", async (event, data) => {
  console.log(
    `[ipc] setup:save mode=${data && data.mode} host=${data && data.db && data.db.host} db=${data && data.db && data.db.database}`,
  );
  const existing = loadConfig() || defaultConfig();
  const cfg = {
    ...existing,
    db: data.db,
    apiPort: Number(data.apiPort) || existing.apiPort,
    webPort: Number(data.webPort) || existing.webPort,
    serverAddress: (data.serverAddress || "").trim(),
  };

  const onProgress = (msg) => {
    if (!event.sender.isDestroyed()) event.sender.send("setup:progress", msg);
  };

  try {
    // Restarting cleanly is required when settings change ports/DB.
    servers.stopServers();
    if (mainWindow) {
      mainWindow.close();
      mainWindow = null;
    }
    await servers.provision(cfg, { mode: data.mode, admin: data.admin }, onProgress);

    cfg.setupComplete = true;
    saveConfig(cfg);

    createMainWindow(cfg);
    if (setupWindow) {
      const toClose = setupWindow;
      setupWindow = null;
      toClose.close();
    }
    return { ok: true };
  } catch (err) {
    console.error("[ipc] setup:save failed:", (err && err.stack) || err);
    servers.stopServers();
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
});

// ---- Lifecycle -----------------------------------------------------------

// Only one instance may run — a second launch would clash on the API/web ports.
// If we don't get the lock, focus the existing window and quit this instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWindow || setupWindow || logsWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(start);
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) start();
});

app.on("window-all-closed", () => {
  // The setup→app handoff briefly has windows opening/closing; only quit when
  // we're genuinely done (handled in the window 'closed' handlers).
  if (process.platform !== "darwin" && !setupWindow && !mainWindow) app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  servers.stopServers();
});
