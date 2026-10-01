---
name: worktree
description: >-
  Create and manage isolated git worktrees to run AI agents in parallel in this project
  without them stepping on each other's code or database. Use it when the user wants to work
  in parallel, isolate a task or feature in its own environment, or mentions "worktree",
  "parallel agents", "isolate this". Covers creating the worktree (with its own Postgres
  database and ports), starting/stopping its app, and tearing it down. Tooling lives in
  .devcontainer/wt/; full docs in README.md, section "Worktrees para agentes en paralelo".
---

# Worktrees for parallel agents

Tooling in `.devcontainer/wt/`. Full docs: `README.md` § "Worktrees para agentes en paralelo".
There is **a single devcontainer** plus, per worktree, its own `nextjs-app` container (`next dev`
with the Node inspector) from the same image and the same compose file as the root's. Postgres is
shared and isolated by database (`nextjs_<name>`).

## Before you start
- **Check nobody is already building it.** `git branch --list 'agent/*'` and, for AI-DLC work, the
  intents registered in develop (`aidlc/spaces/*/intents/intents.json`). A branch is invisible from
  inside another worktree, so two sessions can build the same thing and only find out at merge
  time. The check costs ten seconds.
- The root stack must be up (`docker compose up -d`). **Never** run `docker compose down`: the
  devcontainer lives in that same compose.
- The root checkout sits on `develop`, the integration branch; `main` is what a release ships. A
  project without `develop` yet creates it once: `git -C /var/www/html switch -c develop`.
- The root tree may be dirty: `new` uses `git worktree add`, which does not care, and the
  `agent/<name>` branch starts from the root's `HEAD` without the uncommitted changes. `new`
  refuses before creating anything if `.worktrees/<name>` or the branch already exists.
- Run `.devcontainer/wt/status` first: it shows the fleet and any leftovers from a previous
  session (orphan database, orphan container, stale git registration, slot collision).

## Commands
- **Create**: `.devcontainer/wt/new <name>` — worktree + `agent/<name>` branch + `pnpm install` +
  database + `.env` + AI-DLC. `--seed` also applies the migrations and runs the seed on its
  database; `--no-aidlc` skips AI-DLC.
- **App**: `.devcontainer/wt/app up <name>` → `http://localhost:<APP_PORT>` (published on the HOST,
  not inside the devcontainer; from the devcontainer it is `nextjs-wt-<name>-app:3000`), debugger
  on `<DEBUG_PORT>`. `app logs <name>` follows it; `app down <name>` stops it — **it does not drop
  the database**.
- **List**: `git worktree list` (host paths), or `status` below.
- **Check**: `.devcontainer/wt/status` — fleet (slot, port, database, container), AI-DLC bolts and
  leftovers. Read-only; degrades to `n/a` instead of failing when the root stack is down.
- **Tear down**: `.devcontainer/wt/teardown <name> [--branch]` — refuses while a process still runs
  inside the tree; stops the app, drops its database, unregisters its AI-DLC pin, removes the
  worktree (`--branch` also the branch) and then checks each of those, exiting 1 with what is left.
  It destroys uncommitted work without asking: closing a finished worktree is the `worktree-close`
  skill (commit, merge, update the root, then teardown).

### Only these commands
There is no registry file: the slot lives in each `.worktrees/<name>/.env` (`WT_SLOT`), while the
database, the container and git's entry live outside that scan. So the wrong tool leaks silently
in both directions, and `wt/status` is what surfaces it afterwards.
- **Never** a bare `git worktree remove`, `herdr worktree remove` or a manual `rm -rf`: they leave
  the `nextjs_<name>` database and the worktree's container behind and free the slot. `teardown`
  is the only safe removal.
- **Never** `herdr worktree create`, Claude Code's own worktrees or a bare `git worktree add`:
  `isolate` never runs — no `.env`, no database, no ports — and a bare add from `/var/www/html`
  registers the container path, which the host cannot open (`status` flags it). The one deliberate
  exception is the `release` worktree, main's tree (skill `release`). herdr also defaults to
  `~/.herdr/worktrees`, outside the repo bind mount and invisible from the host. Create with
  `wt/new`, then attach a herdr pane with `herdr worktree open --branch agent/<name>` (that one
  only opens).
- AI-DLC's Construction creates its own Bolt worktrees under `.aidlc/worktrees/bolt-*` (branches
  `bolt-*`). They belong to `aidlc`; `status` lists them apart and nothing here touches them.

## Per-worktree isolation
- Code: `.worktrees/<name>` + `agent/<name>` branch.
- Postgres: `nextjs_<name>` (a real CREATE DATABASE on the shared server). `DATABASE_URL` and
  `DIRECT_URL` in the worktree's `.env` point there; only the database name differs from the root's.
- Ports: `APP_PORT=3000+100*slot`, `DEBUG_PORT=9229+100*slot`.
- Container: `nextjs-wt-<name>-app` (compose project `nextjs-wt-<name>`), joined to the root network.
- AI tools: `pnpm install` regenerates the MCP, skills and hooks wiring inside the worktree, and
  `new` runs `pnpm aidlc:setup` there, so `/aidlc` works in it. An AI-DLC intent started in the
  worktree records itself under its `aidlc/` and travels with the branch.

## Launching parallel agents
1. Create one worktree per task: `.devcontainer/wt/new task-a`, `.devcontainer/wt/new task-b`, …
2. Launch each agent with its working directory set to `.worktrees/<name>` (in herdr: one pane per
   worktree, `herdr worktree open --branch agent/<name>`).
3. When each one finishes: close it with the `worktree-close` skill. Merge locally, from the root.

## Reminders
- `node_modules` is real per worktree (`pnpm install`, hardlinked from the shared store), not a
  symlink: the worktree's container mounts only the worktree.
- `down` ≠ delete: the database persists until `teardown`.
- After a merge that changes `prisma/schema.prisma`, the worktree's app regenerates the client on
  its next start (`predev`): `app down` + `app up`.
- Worktrees are host-portable: links use absolute HOST paths (`$HOST_WORKSPACE_PATH`, mirror-mounted
  in `devcontainer.json`), so they open from the host too (GitKraken, lazygit in WSL), not only
  inside the devcontainer. The mirror mount needs the repo on a Linux, macOS or WSL path.
