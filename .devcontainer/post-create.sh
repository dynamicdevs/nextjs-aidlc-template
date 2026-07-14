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

pnpm add -g @johnlindquist/worktree \
  --store-dir "$PNPM_STORE"

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

if command -v claude >/dev/null 2>&1; then
  pnpm exec claudecode-aidlc setup
fi

if command -v opencode >/dev/null 2>&1; then
  pnpm exec opencode-aidlc setup --nested
fi

if command -v codex >/dev/null 2>&1; then
  pnpm exec codex-aidlc-plugin setup --nested
fi

sudo chown -R node:node /home/node 2>/dev/null

if [ -f "$HOME/.zshrc" ]; then
  sed -i 's/^ZSH_THEME=.*/ZSH_THEME=norm/' "$HOME/.zshrc"
fi
