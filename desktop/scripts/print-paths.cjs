// Prints the resolved app paths (run: npx electron scripts/print-paths.cjs).
const { app } = require("electron");
const { paths } = require("../main/paths.cjs");
app.whenReady().then(() => {
  console.log("name=" + app.getName());
  console.log("userData=" + app.getPath("userData"));
  console.log("runtimeRoot=" + paths().root);
  console.log("apiEntry=" + paths().apiEntry);
  app.quit();
});
