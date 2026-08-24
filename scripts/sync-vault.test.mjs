import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

function runSync(outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/sync-vault.mjs"], {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, OUT_DIR: outDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr || `sync exited ${code}`)));
  });
}

test("sync:vault fills the roster without overwriting an existing agent state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dotai-agent-roster-"));
  try {
    await writeFile(join(dir, "agents.json"), JSON.stringify([{
      id: "etsy-growth-radar",
      name: "Etsy Growth Radar",
      emoji: "🧭",
      status: "done",
      lastRun: "2026-08-21T00:00:00.000Z",
      outputCount: 3,
      lastOutput: "kept",
    }], null, 2));

    await runSync(dir);
    const rows = JSON.parse(await readFile(join(dir, "agents.json"), "utf8"));
    assert.equal(rows.length, 11);
    assert.deepEqual(rows.find((row) => row.id === "etsy-growth-radar"), {
      id: "etsy-growth-radar",
      name: "Etsy Growth Radar",
      emoji: "🧭",
      status: "done",
      lastRun: "2026-08-21T00:00:00.000Z",
      outputCount: 3,
      lastOutput: "kept",
    });
    assert.ok(rows.filter((row) => row.id !== "etsy-growth-radar").every((row) => row.status === "idle"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
