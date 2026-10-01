---
name: worktree-close
description: >-
  Close a finished worktree: commit inside it, bring develop in and re-run the gate, merge
  agent/<name> into develop from the root, bring the root up to date (dependencies, migrations,
  Prisma client, AI-DLC) and tear the worktree down. Use it when the user says «cierra el
  worktree», «commitea, mergea y haz teardown», «fusiona a develop», or an AI-DLC intent's work is
  done and has to land. Covers the order that loses nothing, the races with other sessions working
  on the same repo, what the root needs after a merge, and checking that the teardown really
  removed everything.
---

# Close a worktree

Three steps, in this order, each one checked before the next: **commit** (inside the worktree),
**merge** (from the root), **teardown** (from the root). Creating and running a worktree is the
`worktree` skill. Pushing is not part of closing: it publishes, so it waits for the user's go-ahead.

## 0. Before the commit
- An AI-DLC intent run in this worktree is part of the change: its record under
  `aidlc/spaces/*/intents/<record>/` (state, audit shards, artifacts) and its row in
  `intents.json` are committed with the code. Close or park the workflow first, so the record that
  lands says where it stopped.
- Anything the user must keep that git ignores (a script's output, captures) is copied out now:
  teardown removes the tree.

## 1. Commit — inside the worktree
The repo's convention is gitmoji + commitlint: `:emoji: type(scope): description`, header ≤ 100
characters, `Co-Authored-By:` trailer last. Validate the message first, from stdin:
`pnpm exec commitlint < msg.txt` — a body line that opens with `word:` is read as a trailer and
fails `footer-leading-blank`, so open every paragraph with a plain word. Then `git add` with
explicit paths or `-A`, `git commit -F msg.txt > commit.log 2>&1` — never behind a pipe — and
`git show --stat HEAD` to see what went in. The pre-commit runs Biome on the staged files.

## 2. Bring develop in — inside the worktree
`git -C /var/www/html log --oneline -1 develop` against your branch's base. If develop moved:
1. `git log --oneline agent/<name>..develop` and `git diff --name-only <base> develop`: read every
   foreign commit that touches your files. The same fix can already be there, done by another
   session in a different file — then the merge does not conflict and leaves two copies running.
   Drop your duplicate before merging.
2. `git merge develop` **inside the worktree**. Conflicts are resolved here: the worktree guard
   blocks edits in the root, and the house pattern is two auditable commits — this one,
   `:twisted_rightwards_arrows: chore(<scope>): develop se incorpora antes de fusionar`, and the
   merge below. A conflict in `aidlc/spaces/*/intents/intents.json` is two intents registered in
   parallel: keep **every** row of both sides (each has its own `uuid`).
3. If develop brought dependencies or migrations: `pnpm install`, then
   `pnpm prisma:migrate:deploy` inside the worktree (its `.env` points at `nextjs_<name>`), and
   restart its app (`app down` + `app up`) before looking at anything in the browser: `predev`
   regenerates the Prisma client, and new code reading missing columns degrades silently.
4. The gate again, on the merged tree: `pnpm check && pnpm lint && pnpm build && pnpm test`.

With nothing committed yet, the clean way is `git stash push`, `git merge --ff-only develop`,
`git stash pop`. Never while a reviewer or a suite is reading the tree: the stash changes the
files under them.

## 3. Merge — from the root
```sh
git -C /var/www/html rev-parse -q --verify MERGE_HEAD     # must print nothing
git -C /var/www/html status --porcelain                    # a UU with no <<<<<<< is someone's resolution in flight
git -C /var/www/html merge-base --is-ancestor develop agent/<name> \
  && git -C /var/www/html merge --no-ff -F <msg> agent/<name>
git -C /var/www/html rev-parse 'HEAD^{tree}' 'agent/<name>^{tree}'   # equal: the root has the tree that passed the gate
```
Message: `:twisted_rightwards_arrows: chore(<scope>): agent/<name> se fusiona en develop` (`merge`
is not a commitlint type: a `merge(...)` subject aborts the merge half-way).
- A merge in progress that is not yours: neither complete it nor abort it. Stop and ask (when
  the harness has `ListAgents`, it says which sessions are alive).
- The ancestry check fails when develop moved after step 2: go back to step 2. Re-check
  `git log -1 develop` before each attempt, and re-run the gate on what yours depends on, not only
  on the files both sides share.
- Merge locally, not through a pull request: the checks above are what keep develop's tree equal
  to the one that passed the gate.

## 4. The root after the merge
The merge leaves new code on disk and old processes running, and nobody updates the root by
default:
- Dependencies: if `pnpm-lock.yaml` changed, `pnpm install` in the root. The root's `nextjs-app`
  reinstalls on its own when it restarts, but the devcontainer's tools read the root's
  `node_modules` now.
- Migrations: `pnpm prisma:migrate:deploy` in the root, reading the whole list — other sessions'
  pending migrations run too; name them in the report. Then `pnpm prisma:generate` if the schema
  changed, and `docker restart nextjs-app` so `next dev` serves the new client and dependencies
  (code changes alone hot-reload).
- AI-DLC: if `.aidlc-version` changed, `pnpm aidlc:setup` in the root, between workflows
  (`aidlc config` refuses to refresh while a workflow is active).

## 5. Teardown — from the root
Only after step 3 printed equal trees (`&&`, never `;`):
`.devcontainer/wt/teardown <name> --branch`. It refuses while a process lives in the tree — an
interrupted test run or a dev server left behind recreates files after the rm: stop it and run
again. Then it stops the app, drops `nextjs_<name>`, unregisters the worktree's AI-DLC pin, removes
tree and branch, and checks all of it. Exit 1 lists what was left and the recipe; read it, don't
assume. AI-DLC Bolt branches (`bolt-*`) created in the worktree are aidlc's: they are not deleted.

## Report
The merge commit, the migrations applied in the root (yours and others'), whether dependencies,
the Prisma client and the root's app were refreshed, and whether develop is pushed (usually not:
say so).
