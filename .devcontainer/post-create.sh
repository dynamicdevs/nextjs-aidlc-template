#!/usr/bin/env bash
set -e

PNPM_STORE="/home/node/.local/share/pnpm/store"

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

sudo chown -R node:node /home/node 2>/dev/null

if [ -f "$HOME/.zshrc" ]; then
  sed -i 's/^ZSH_THEME=.*/ZSH_THEME=norm/' "$HOME/.zshrc"
fi
