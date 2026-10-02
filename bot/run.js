// Keeps the bot running: restarts it when it crashes or when the panel credentials change.
const { spawn } = require("child_process");
const path = require("path");

function launch() {
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    const delay = code === 75 ? 1000 : 10_000;
    console.log(`[bot] stopped (code ${code}) — restarting in ${delay / 1000}s`);
    setTimeout(launch, delay);
  });
}
launch();
