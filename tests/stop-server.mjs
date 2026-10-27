/**
 * Stop any running Next.js dev server for this project.
 *
 * The dev server writes a lock file under `.next/dev`. Stopping it through
 * the task manager is unreliable across shells, so this finds the process
 * holding the port and terminates it.
 */
import { execFileSync } from "node:child_process";

const isWindows = process.platform === "win32";

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

let killed = 0;

if (isWindows) {
  // Find the PID listening on port 3000 via netstat, then stop it.
  const netstat = run("netstat", ["-ano", "-p", "TCP"]);
  const pids = new Set();

  for (const line of netstat.split("\n")) {
    if (!/LISTENING/i.test(line)) continue;
    if (!/:3000\s/.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== "0") pids.add(pid);
  }

  for (const pid of pids) {
    const result = run("taskkill", ["/PID", pid, "/F", "/T"]);
    if (result) {
      console.log(`stopped PID ${pid}`);
      killed += 1;
    }
  }
} else {
  const result = run("pkill", ["-f", "next dev"]);
  if (result) {
    console.log(result);
    killed += 1;
  }
}

console.log(killed > 0 ? `✓ stopped ${killed} server(s)` : "no server was running");
