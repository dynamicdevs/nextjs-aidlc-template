#!/usr/bin/env bash
set -e

PNPM_STORE="/home/node/.local/share/pnpm/store"

# Sync host SSH credentials into the container. /home/node is a named Docker
# volume, so the host's ~/.ssh is not visible here; devcontainer.json bind-mounts
# it read-only at ~/.ssh-host. Copy it into ~/.ssh owned by node with the strict
# permissions ssh requires, so git over SSH works from inside the container.
sync_ssh_credentials() {
  [ -d "$HOME/.ssh-host" ] || return 0
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  cp -a "$HOME/.ssh-host/." "$HOME/.ssh/" 2>/dev/null || true
  # cp -a preserves the read-only source mode; relax perms on the writable copy.
  find "$HOME/.ssh" -type d -exec chmod 700 {} \; 2>/dev/null || true
  find "$HOME/.ssh" -type f -exec chmod 600 {} \; 2>/dev/null || true
  chmod 644 "$HOME/.ssh"/*.pub 2>/dev/null || true
  echo "ssh: synced host credentials into ~/.ssh"
}

sync_ssh_credentials || true

pnpm add -g cline \
  --allow-build=cline \
  --allow-build=protobufjs \
  --store-dir "$PNPM_STORE"

pnpm add -g @kilocode/cli \
  --yes \
  --allow-build=@kilocode/cli \
  --reporter=silent \
  --store-dir "$PNPM_STORE"

if ! command -v kiro-cli >/dev/null 2>&1; then
  curl -fsSL https://cli.kiro.dev/install | bash
fi

if ! command -v kimi >/dev/null 2>&1; then
curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash
fi

# Archify: diagram skill (architecture, workflow, sequence, data flow and lifecycle) that
# renders self-contained HTML. Not an npm dependency and NOT in package.json: `archify` on the
# registry belongs to another author and another project. What gets installed is the skill's
# directory (SKILL.md + bin/ + renderers/ + schemas/), invoked through paths relative to it.
#
# Global, not per project, on purpose: it lands in ~/.claude/skills, inside the
# nextjs-node-home volume, so it survives rebuilds and every worktree sees it. A project copy
# would not: .claude/ is gitignored, and AI-DLC owns .claude/skills, adopting what it finds
# there on one refresh and deleting it on the next.
#
# No "already installed" guard: the skill does not self-update (its own SKILL.md says so), so
# this re-run on every provisioning is its only update path. `--copy` makes it self-contained
# instead of a link into the CLI's cache.
npx -y skills add tt-a1i/archify --skill archify --agent claude-code --global --copy --yes || true

# AI-DLC: install the CLI pinned in .aidlc-version and configure every
# installed harness (Claude Code, Codex, opencode). Never blocks the container.
bash scripts/setup-aidlc.sh || echo "aidlc: setup incomplete; run 'pnpm aidlc:setup' to retry"

# Per-tool AI config from the versioned sources in .agent/: MCP servers, the shared skills
# and the worktree hooks. `pnpm install` regenerates them too, but it runs in the nextjs-pnpm
# container, where none of the agent CLIs are installed. Node directly, not `pnpm generate`:
# node_modules may still be installing at this point, and the generators need none of it.
node scripts/generate-mcp.mjs && node scripts/generate-skills.mjs && node scripts/generate-hooks.mjs \
  || echo "agents: config generation incomplete; run 'pnpm generate' to retry"

sudo chown -R node:node /home/node 2>/dev/null

if [ -f "$HOME/.zshrc" ]; then
  sed -i 's/^ZSH_THEME=.*/ZSH_THEME=norm/' "$HOME/.zshrc"
fi
