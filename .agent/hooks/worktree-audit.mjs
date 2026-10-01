#!/usr/bin/env node
// PostToolUse detector: instead of predicting which commands write (impossible once a
// script or build tool is involved), ask git what actually changed in the main checkout.
// Catches every write regardless of how it happened; reports each new path once.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The repo root is two levels up from .agent/hooks/ — no tool-specific env var,
// and it resolves to the worktree root when this file runs inside one.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Kill switch, kept out of any single tool's directory and out of git.
const DISABLED = resolve(dirname(fileURLToPath(import.meta.url)), ".disabled");
const BASELINE = resolve(dirname(fileURLToPath(import.meta.url)), ".baseline");

const done = () => process.exit(0);

function dirtyPaths() {
  // --no-optional-locks: never fight another session for index.lock.
  const out = execFileSync("git", ["--no-optional-locks", "-C", ROOT, "status", "--porcelain"], {
    encoding: "utf8",
    timeout: 5000,
  });
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3);
      // Renames read "old -> new"; the destination is what got written.
      return path.includes(" -> ") ? path.split(" -> ")[1] : path;
    })
    .map((p) => p.replace(/^"|"$/g, ""));
}

let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  if (process.env.WT_GUARD_OFF === "1" || existsSync(DISABLED)) done();
  // A linked worktree has .git as a file; there the audit has nothing to protect.
  if (existsSync(`${ROOT}/.git`) && !statSync(`${ROOT}/.git`).isDirectory()) done();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    done();
  }

  let current;
  try {
    current = dirtyPaths();
  } catch {
    done();
  }

  if (!existsSync(BASELINE)) {
    writeFileSync(BASELINE, current.join("\n"));
    done();
  }

  const before = new Set(readFileSync(BASELINE, "utf8").split("\n").filter(Boolean));
  const fresh = current.filter((p) => !before.has(p));
  writeFileSync(BASELINE, current.join("\n"));

  // Edit/Write already pass the PreToolUse gate, so only Bash needs reporting here.
  if (fresh.length === 0 || payload.tool_name !== "Bash") done();

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        `This Bash command changed the MAIN CHECKOUT, not a worktree: ${fresh.join(", ")}. ` +
        "Project rule: code changes live in their own worktree. Either move the change " +
        `(\`git -C ${ROOT} stash\` here, then redo it under .worktrees/<name>/), or state ` +
        "to the user that the main checkout was the intended target and continue. " +
        "This path is now the baseline and will not be reported again.",
    }),
  );
  process.exit(0);
});
