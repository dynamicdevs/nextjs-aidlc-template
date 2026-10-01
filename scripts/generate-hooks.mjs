import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sourcePath = ".agent/hooks/hooks.json";
const absoluteSourcePath = resolve(root, sourcePath);

const checkMode = process.argv.includes("--check");

let source;
try {
  source = JSON.parse(readFileSync(absoluteSourcePath, "utf-8"));
} catch {
  console.error(`ERROR: ${sourcePath} not found or invalid JSON`);
  process.exit(1);
}

const hooks = source.hooks ?? [];

for (const hook of hooks) {
  if (!hook.id || !hook.event || !hook.script || !hook.interpreter) {
    console.error(`ERROR: hook '${hook.id ?? "?"}' must declare id, event, interpreter and script`);
    process.exit(1);
  }
  if (!existsSync(resolve(root, ".agent/hooks", hook.script))) {
    console.error(
      `ERROR: hook '${hook.id}' points at .agent/hooks/${hook.script}, which does not exist`,
    );
    process.exit(1);
  }
}

// An executable on PATH, not a shell word or alias.
function commandExists(cmd) {
  try {
    const check = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
    const out = execSync(check, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return process.platform === "win32" ? out.length > 0 : out.startsWith("/");
  } catch {
    return false;
  }
}

// Devcontainer lifecycle commands (postCreateCommand) may run with a PATH that lacks
// ~/.local/bin, where Claude Code installs itself.
function toolExists(cmd) {
  return commandExists(cmd) || existsSync(resolve(homedir(), ".local/bin", cmd));
}

// A hook group is ours when every command in it runs a script from .agent/hooks/.
const OWNED = "/.agent/hooks/";
const isOwned = (group) =>
  (group.hooks ?? []).length > 0 &&
  group.hooks.every((h) => String(h.command ?? "").includes(OWNED));

// Hooks are the least portable of the generated config kinds: skills and MCP servers are the
// same file in a different directory, but a hook is a contract of events that each tool names
// differently — and most agent CLIs have no pre-tool gate at all. Hence one adapter.
const toolAdapters = {
  claude: {
    detect: () => toolExists("claude"),
    // Not settings.json: AI-DLC owns its `hooks` key, and Claude Code merges the hooks of
    // every settings level instead of letting one replace another.
    file: ".claude/settings.local.json",
    // Claude Code expands $CLAUDE_PROJECT_DIR in hook commands, so the wiring stays correct
    // from a worktree without regenerating.
    render: (declared) => {
      const events = {
        "before-tool": "PreToolUse",
        "after-tool": "PostToolUse",
        "user-prompt": "UserPromptSubmit",
      };
      const tools = {
        edit: "Edit",
        write: "Write",
        "notebook-edit": "NotebookEdit",
        shell: "Bash",
      };
      const out = {};

      for (const hook of declared) {
        const event = events[hook.event];
        if (!event) {
          console.error(
            `ERROR: hook '${hook.id}' uses event '${hook.event}', which claude has no mapping for`,
          );
          process.exit(1);
        }

        const entry = {
          type: "command",
          command: `${hook.interpreter} "$CLAUDE_PROJECT_DIR/.agent/hooks/${hook.script}"`,
        };
        if (hook.timeout) entry.timeout = hook.timeout;
        if (hook.statusMessage) entry.statusMessage = hook.statusMessage;

        const group = { hooks: [entry] };
        const matcher = (hook.tools ?? [])
          .map((t) => tools[t])
          .filter(Boolean)
          .join("|");
        if (matcher) group.matcher = matcher;

        out[event] ??= [];
        out[event].push(group);
      }

      return out;
    },
  },
};

// The hooks of `settings` minus ours: what a person or another tool put there survives.
function foreignHooks(settings) {
  const out = {};
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    const kept = (groups ?? []).filter((group) => !isOwned(group));
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}

// Ours, keyed by event in a stable order: the file keeps foreign events first, so its key
// order says nothing about drift.
function ownedHooks(settings) {
  const out = {};
  for (const event of Object.keys(settings.hooks ?? {}).sort()) {
    const owned = (settings.hooks[event] ?? []).filter(isOwned);
    if (owned.length > 0) out[event] = owned;
  }
  return out;
}

const sortedKeys = (hooksByEvent) =>
  Object.fromEntries(
    Object.keys(hooksByEvent)
      .sort()
      .map((event) => [event, hooksByEvent[event]]),
  );

let generated = 0;
let skipped = 0;
let drift = 0;

for (const [tool, adapter] of Object.entries(toolAdapters)) {
  if (adapter.detect && !adapter.detect()) {
    console.log(`✗ ${adapter.file} (${tool} not found)`);
    skipped++;
    continue;
  }

  const targetPath = resolve(root, adapter.file);
  let settings = {};

  if (existsSync(targetPath)) {
    try {
      settings = JSON.parse(readFileSync(targetPath, "utf-8"));
    } catch {
      console.error(`ERROR: ${adapter.file} exists but is invalid JSON; not touching it`);
      process.exit(1);
    }
  }

  const rendered = adapter.render(hooks);

  if (checkMode) {
    if (JSON.stringify(ownedHooks(settings)) !== JSON.stringify(sortedKeys(rendered))) {
      console.error(`DRIFT ${adapter.file} — run: pnpm generate:hooks`);
      drift++;
    }
    continue;
  }

  const merged = foreignHooks(settings);
  for (const [event, groups] of Object.entries(rendered)) {
    merged[event] = [...(merged[event] ?? []), ...groups];
  }
  if (Object.keys(merged).length > 0) settings.hooks = merged;
  else delete settings.hooks;

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`✓ ${adapter.file} (${hooks.length} hooks wired)`);
  generated++;
}

if (checkMode) {
  if (drift > 0) {
    console.error(`✗ hook wiring out of sync with ${sourcePath}`);
    process.exit(1);
  }
  console.log(`✓ hook wiring in sync with ${sourcePath}`);
  process.exit(0);
}

console.log(`Done — ${generated} generated, ${skipped} tool(s) skipped (source: ${sourcePath})`);
