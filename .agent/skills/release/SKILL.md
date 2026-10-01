---
name: release
description: >-
  Release develop to production: merge develop into main and push both branches. Use it when the
  user asks to release, ship or deploy to production («liberar», «sacar una release», «subir a
  producción», «pasar develop a main»). Covers writing the release message, which IS the
  CHANGELOG.md entry, the changelog script and its commit-msg check, the gate, the tree check, and
  the push.
---

# Release to production

A release is `develop` merged into `main` with `--no-ff` and a `:rocket: chore(release): …`
message. `main` is what gets deployed — whatever CI/CD the project adds keys on that branch —
so **merging into `main` and pushing are outward-facing: ask the user before each one**, even if
an earlier release was approved.

## 0. The `release` worktree
`main` lives in its own worktree, `.worktrees/release`; the root stays on `develop` and is not
touched. Create it once, from the host path like `wt/new` does, so the host opens it too:

```sh
git -C "${HOST_WORKSPACE_PATH:-/var/www/html}" worktree add .worktrees/release main
cp /var/www/html/.env .worktrees/release/.env   # or .env.example: `pnpm build` needs DIRECT_URL
(cd .worktrees/release && pnpm install)
```

It has no slot and no database of its own (`wt/status` shows it as shared), and `wt/new` /
`wt/teardown` refuse the name `release`. To remove it: `git worktree remove .worktrees/release`.

## 1. See what is going out

```sh
git -C /var/www/html log --first-parent --oneline main..develop
git -C /var/www/html diff --stat main develop -- prisma/migrations .env.example .aidlc-version package.json
```

Read the merges, not just their subjects. Note the migrations, any new environment variable
(`.env.example`), an AI-DLC version bump (`.aidlc-version`) and dependency majors: they are what
somebody has to act on after the deploy.

## 2. Write the message: it is the CHANGELOG entry

The body is copied verbatim into `CHANGELOG.md` (minus trailers), so it is written once, for whoever
uses and runs the project:

1. **What changes for the user**, first and in plain words, ordered by what hurt most. Not the
   code, not the commit list.
2. **What was broken**, briefly, when that is why it matters.
3. **Operator notes**: every migration and what it does (with its lock, if it rewrites a table),
   new environment variables, an `.aidlc-version` bump (`pnpm aidlc:setup` between workflows). If
   there are none, say so: «Sin migraciones ni variables nuevas.»
4. **The gate that ran on this tree** and the reviews.
5. **What it does not bring**, and how to verify it after the deploy, when that is not obvious.

The subject says what changes for the user, not «develop llega a main». Header ≤ 100 characters.
Every paragraph opens with a plain word: a body line that starts with `word:` is read as a trailer
and fails `footer-leading-blank`. Validate before anything else: `pnpm exec commitlint < <file>`.

If `CHANGELOG.md` still has a `## [Unreleased]` section (from before this process), fold its notes
into the message: the script replaces that section with the release entry.

## 3. Merge through the changelog script

From the `release` worktree, with the root's copy of the script (main's copy is the previous
release's):

```sh
node /var/www/html/scripts/changelog-release.mjs <file>
```

It builds one commit on top of `develop` that adds the section to `CHANGELOG.md`, touching no
checkout, and prints the three commands that follow: merge **that commit** into `main` with the
same `<file>`, compare the trees, fast-forward `develop` to it. Run them as printed.

- The `commit-msg` hook rejects a release whose `CHANGELOG.md` lacks the section or has a different
  body. That is what happens if you merge `develop` directly, or edit `<file>` after running the
  script: `git merge --abort`, rerun the script (it rewrites the section in place) and merge the new
  commit.
- If `develop` moved since the script ran, the `--ff-only` refuses: `merge --no-ff` the same commit.
- Never edit `CHANGELOG.md` by hand, and never `--no-verify` the merge.

Then the gate, in the `release` worktree, on the tree `main` now has:
`pnpm install && pnpm check && pnpm lint && pnpm build && pnpm test`. A red gate means no push:
fix it on develop and release again.

## 4. Push, and check it landed

With the user's go-ahead: `git push origin develop main` in one command, in the foreground. Pushing
`develop` also publishes whatever other sessions merged into it and left unpushed — say so when
asking. Then confirm the remote moved, because a push can exit 0 and leave it where it was:

```sh
git ls-remote origin refs/heads/main refs/heads/develop
```

Both hashes must be the local ones.

## Expected output
`main` at the release merge, its tree equal to the printed commit's, `CHANGELOG.md` with the new
section on both branches, both pushed and confirmed with `ls-remote`, and the operator notes of
step 2 handed to the user as a checklist for after the deploy.
