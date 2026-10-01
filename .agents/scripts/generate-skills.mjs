import { execSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Not .agents/skills/, where Codex reads skills: AI-DLC's Codex harness owns that directory (see
// toolTargets below), so a source kept there is deleted on the second refresh, versioned or not.
const sourceDir = ".agents/shared-skills";
const absoluteSourceDir = resolve(root, sourceDir);

// An executable on PATH, not a shell word: `command -v continue` succeeds for the builtin.
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
// ~/.local/bin, where Claude Code and kiro-cli install themselves.
function toolExists(cmd) {
  return commandExists(cmd) || existsSync(resolve(homedir(), ".local/bin", cmd));
}

// Every target is a link and never a copy: AI-DLC owns .claude/ and .agents/ and, on a refresh,
// adopts the regular files it finds under their skills/ directories and deletes them on the next
// one. It skips symbolic links.
const toolTargets = {
  claude: { dir: ".claude", detect: () => toolExists("claude") },
  // Codex reads .agents/skills/; opencode reads it as well as .claude/skills/.
  agents: { dir: ".agents", detect: () => toolExists("codex") || toolExists("opencode") },
  cline: { dir: ".cline", detect: () => toolExists("cline") },
  continue: { dir: ".continue", detect: () => toolExists("continue") },
  codebuddy: { dir: ".codebuddy", detect: () => toolExists("codebuddy") },
  junie: { dir: ".junie", detect: () => toolExists("junie") },
  // The Kiro CLI binary is `kiro-cli`; `kiro` is the desktop IDE.
  kiro: { dir: ".kiro", detect: () => toolExists("kiro-cli") },
};

const requestedTools = process.env.AGENTS_TOOLS
  ? process.env.AGENTS_TOOLS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : Object.entries(toolTargets)
      .filter(([, t]) => t.detect() || existsSync(resolve(root, t.dir)))
      .map(([name]) => name);

if (!existsSync(absoluteSourceDir)) {
  console.log(`No skills source in ${sourceDir}; nothing to do.`);
  process.exit(0);
}

const skills = readdirSync(absoluteSourceDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

if (skills.length === 0) {
  console.log(`No skills in ${sourceDir}; nothing to do.`);
  process.exit(0);
}

if (requestedTools.length === 0) {
  console.log("No target tools detected (set AGENTS_TOOLS to force); nothing to do.");
  process.exit(0);
}

let linked = 0;
let pruned = 0;

for (const tool of requestedTools) {
  const target = toolTargets[tool];
  if (!target) {
    console.error(`ERROR: no adapter for tool '${tool}'`);
    process.exit(1);
  }

  const skillsRoot = resolve(root, target.dir, "skills");
  mkdirSync(skillsRoot, { recursive: true });

  // Retiring a skill must not leave its link dangling. Only links we own (pointing into
  // .agents/shared-skills/) are pruned — anything a human or another tool put here is not ours.
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;

    const linkPath = join(skillsRoot, entry.name);
    if (!readlinkSync(linkPath).includes(join(".agents", "shared-skills"))) continue;
    if (skills.includes(entry.name)) continue;

    rmSync(linkPath, { force: true });
    console.log(`✗ ${target.dir}/skills/${entry.name} (source retired)`);
    pruned++;
  }

  for (const name of skills) {
    const linkPath = join(skillsRoot, name);
    const relTarget = join("..", "..", ".agents", "shared-skills", name);
    const stat = lstatSync(linkPath, { throwIfNoEntry: false });

    if (stat?.isSymbolicLink()) {
      if (readlinkSync(linkPath) === relTarget) continue;
      rmSync(linkPath, { force: true });
    } else if (stat) {
      console.error(`✗ ${target.dir}/skills/${name} exists and is not our link; left untouched`);
      continue;
    }

    symlinkSync(relTarget, linkPath);
    console.log(`✓ ${target.dir}/skills/${name} -> ${relTarget}`);
    linked++;
  }
}

console.log(
  `Done — ${linked} link(s) written, ${pruned} pruned, for ${skills.length} skill(s) across [${requestedTools.join(", ")}] (source: ${sourceDir})`,
);
