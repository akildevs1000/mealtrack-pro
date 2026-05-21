// Log viewer. Reads desktop.log via the bridge and shows it, with optional
// auto-refresh and shortcuts to open the raw file/folder.

const pre = document.getElementById("log");
const auto = document.getElementById("auto");

async function load() {
  if (!window.mymeals || !window.mymeals.readLogs) {
    pre.textContent = "Log bridge unavailable.";
    return;
  }
  const wasAtBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 40;
  const text = await window.mymeals.readLogs();
  if (text && text.trim()) {
    pre.classList.remove("empty");
    pre.textContent = text;
  } else {
    pre.classList.add("empty");
    pre.textContent = "(log is empty)";
  }
  if (wasAtBottom) pre.scrollTop = pre.scrollHeight; // keep following the tail
}

document.getElementById("refresh").addEventListener("click", load);
document.getElementById("openfile").addEventListener("click", () => window.mymeals.openLogFile());
document
  .getElementById("openfolder")
  .addEventListener("click", () => window.mymeals.openLogFolder());

setInterval(() => {
  if (auto.checked) load();
}, 2000);

load();
