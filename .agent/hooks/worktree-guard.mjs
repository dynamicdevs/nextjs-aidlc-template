#!/usr/bin/env node
// PreToolUse guard: code changes must happen inside a worktree, not in the main checkout.
// Reads the hook payload on stdin and answers with a deny/allow decision.
// Bypass: touch .agent/hooks/.disabled (or export WT_GUARD_OFF=1).
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The repo root is two levels up from .agent/hooks/ — no tool-specific env var,
// and it resolves to the worktree root when this file runs inside one.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Kill switch, kept out of any single tool's directory and out of git.
const DISABLED = resolve(dirname(fileURLToPath(import.meta.url)), ".disabled");
const WORKTREES = `${ROOT}/.worktrees/`;
// Paths that stay editable in the main checkout: harness config (this guard included).
const EXEMPT = [`${ROOT}/.claude/`];

const allow = () => process.exit(0);
// A linked worktree has .git as a file; there the guard has nothing to protect.
const inWorktree = () => existsSync(`${ROOT}/.git`) && !statSync(`${ROOT}/.git`).isDirectory();
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function isIgnored(p) {
  try {
    execFileSync("git", ["--no-optional-locks", "-C", ROOT, "check-ignore", "-q", p], {
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

// A path is protected when it lives in the main checkout outside .worktrees/, the exempt
// list and anything git ignores (infra, not code — and invisible to the PostToolUse audit).
function isProtected(p) {
  if (!p.startsWith(`${ROOT}/`)) return false;
  if (p.startsWith(WORKTREES)) return false;
  if (EXEMPT.some((prefix) => p.startsWith(prefix))) return false;
  return !isIgnored(p);
}

// A token is a real destination when its PARENT directory exists. That admits a file that
// does not exist yet — the common case for a new one — while still rejecting leftovers like
// an unquoted sed script, whose parent is nothing.
function resolvesIntoRepo(token, cwd) {
  const abs = isAbsolute(token) ? resolve(token) : resolve(cwd, token);
  if (!isProtected(abs)) return null;
  return existsSync(dirname(abs)) ? abs : null;
}

const WRITE_RE =
  /(?:^|[;&|(]\s*|\s)(?:sed\s+-i|perl\s+-i|tee|dd|patch|truncate|install|touch|mkdir|rmdir|rm|mv|cp|ln|chmod|chown)\b|>>?\s*[^&|\s]/;
// Commands that write through their own tooling and are part of the sanctioned flow.
const SAFE_RE =
  /^(?:git\s+(?!apply|am\b|restore|checkout\s+--)|gh\s|pnpm\s|npm\s|npx\s|docker\s|herdr\s|aidlc\s|\.?\/?\.devcontainer\/wt\/)/;

function bashTargets(command, cwd) {
  const cleaned = command
    .replace(/[0-9&]*>>?\s*\/dev\/null/g, " ")
    // Drop heredoc bodies: the destination is on the command line, before the marker.
    // Whatever the body says is content being written, not a second target.
    .split(/<<-?\s*['"]?[A-Za-z_]\w*/)[0];
  const hits = [];
  for (const segment of cleaned.split(/&&|\|\||[;|]/)) {
    const seg = segment.trim();
    if (!seg || SAFE_RE.test(seg)) continue;
    // Quoted spans are data, not targets: test harnesses and echoed instructions mention
    // `sed -i` and repo paths as text. What actually gets written is unquoted.
    const bare = seg.replace(/'[^']*'/g, " ").replace(/"[^"]*"/g, " ");
    if (!WRITE_RE.test(bare)) continue;
    // Every token that looks like a path, in order.
    let candidates = [];
    for (let token of bare.split(/\s+/)) {
      token = token.replace(/^[<>'"`(]+|['"`)]+$/g, "");
      if (!token || token.startsWith("-")) continue;
      // Bare words count as paths only when they already exist on disk.
      if (
        !token.includes("/") &&
        !/\.[A-Za-z0-9]{1,6}$/.test(token) &&
        !existsSync(resolve(cwd, token))
      )
        continue;
      candidates.push(token);
    }
    // cp/mv/ln read their leading arguments and write only the last one, so the sources
    // are dropped before asking which token is protected.
    if (/^(?:cp|mv|ln|install)\b/.test(bare)) candidates = candidates.slice(-1);

    for (const token of candidates) {
      const abs = resolvesIntoRepo(token, cwd);
      if (abs && !hits.includes(abs)) hits.push(abs);
    }
  }
  return hits;
}

let raw = "";
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  if (process.env.WT_GUARD_OFF === "1" || existsSync(DISABLED)) allow();
  if (inWorktree()) allow();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    allow();
  }

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const cwd = payload.cwd || ROOT;

  let targets = [];
  if (tool === "Bash") {
    targets = bashTargets(String(input.command || ""), cwd);
  } else {
    const file = input.file_path || input.notebook_path;
    if (!file) allow();
    const abs = isAbsolute(file) ? resolve(file) : resolve(cwd, file);
    if (isProtected(abs)) targets = [abs];
  }
  if (targets.length === 0) allow();

  const shown = targets.map((t) => t.replace(`${ROOT}/`, "")).join(", ");
  deny(
    `BLOCKED: writing into the main checkout (${shown}) instead of a worktree. ` +
      "Project rule: every code change and every /aidlc workflow works from its own worktree. " +
      "Create or reuse one with `.devcontainer/wt/new <name>` (see the `worktree` skill), then edit under .worktrees/<name>/. " +
      "If the user genuinely wants this change in the main checkout, say so and ask them before " +
      "lifting the guard with `touch .agent/hooks/.disabled` (remove it right after).",
  );
});
