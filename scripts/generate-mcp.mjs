import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sourcePath = ".agent/config/mcp/source.json";
const absoluteSourcePath = resolve(root, sourcePath);

let source;
try {
  source = JSON.parse(readFileSync(absoluteSourcePath, "utf-8"));
} catch {
  console.error(`ERROR: ${sourcePath} not found or invalid JSON`);
  process.exit(1);
}

const servers = source.servers ?? {};
const serverNames = Object.keys(servers);

function commandExists(cmd) {
  try {
    const check = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(check, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const toolDetectors = {
  claude: () => commandExists("claude"),
  opencode: () => commandExists("opencode"),
  cursor: () => commandExists("cursor"),
  kiro: () => commandExists("kiro"),
  kilocode: () => commandExists("kilocode"),
  "github-copilot": () => commandExists("gh"),
  codex: () => commandExists("codex"),
  antigravity: () => commandExists("antigravity"),
};

function toStdioEntry(name) {
  switch (name) {
    case "context7":
      return {
        type: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
      };
    default:
      console.error(`ERROR: no adapter for MCP server '${name}' in ${sourcePath}`);
      process.exit(1);
  }
}

const stdioServers = Object.fromEntries(serverNames.map((name) => [name, toStdioEntry(name)]));

const toolOutputs = [
  { dir: ".claude", file: "settings.json", type: "mcpServers", tool: "claude" },
  { dir: ".opencode", file: "opencode.json", type: "opencode", tool: "opencode" },
  { dir: ".cursor", file: "mcp.json", type: "mcpServers", tool: "cursor" },
  { dir: ".kilo", file: "kilo.json", type: "mcpServers", tool: "kilo" },
  { dir: ".kiro", file: "mcp.json", type: "mcpServers", tool: "kiro" },
  { dir: ".kilocode", file: "mcp.json", type: "mcpServers", tool: "kilocode" },
  { dir: ".github-copilot", file: "mcp.json", type: "mcpServers", tool: "github-copilot" },
  { dir: ".codex", file: "mcp.json", type: "mcpServers", tool: "codex" },
  { dir: ".antigravity", file: "mcp.json", type: "mcpServers", tool: "antigravity" },
];

let generated = 0;
let skipped = 0;

for (const { dir, file, type, tool } of toolOutputs) {
  const detector = toolDetectors[tool];
  if (detector && !detector()) {
    console.log(`✗ ${dir}/${file} (${tool} not found)`);
    skipped++;
    continue;
  }

  mkdirSync(resolve(root, dir), { recursive: true });

  const content =
    type === "opencode"
      ? { $schema: "https://opencode.ai/config.json", mcp: servers }
      : { mcpServers: stdioServers };

  writeFileSync(resolve(root, dir, file), `${JSON.stringify(content, null, 2)}\n`);

  console.log(`✓ ${dir}/${file}`);
  generated++;
}

console.log(`Done — ${generated} generated, ${skipped} skipped (source: ${sourcePath})`);
