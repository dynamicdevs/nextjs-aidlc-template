#!/usr/bin/env node
/**
 * The changelog entry of a release, written from the same file as the merge that makes it.
 *
 * A release is `git merge --no-ff -F <message>` of develop into main, and its message already is
 * the release note: the subject says what changes, the body says it for whoever uses and runs the
 * project. CHANGELOG.md is not a second place to write the same thing: it is copied, by this
 * script, from the message file.
 *
 *   node <root>/scripts/changelog-release.mjs <message> [--fecha AAAA-MM-DD] [--base develop]
 *
 * Builds ONE commit on top of develop that adds the section to CHANGELOG.md, without checking out
 * anything (develop is checked out in the root, which is not edited by hand), and prints the next
 * steps: merge THAT commit into main with the same message, then fast-forward develop to it. The
 * tree main ends up with is then the tree of that commit, and develop carries the entry as well.
 * Run it again with the same message and it rewrites the section in place instead of adding a
 * second one, so a message corrected after the fact only needs a second run. A `## [Unreleased]`
 * section left from the Keep a Changelog days is replaced by the entry: its notes belong in the
 * release message (skill `release`).
 *
 *   node scripts/changelog-release.mjs --comprobar <message>
 *
 * The commit-msg hook's half. Silent for anything that is not `:rocket: chore(release): …`; for a
 * release, fails unless the CHANGELOG.md being committed (the index, which during a merge is the
 * merged tree) has a section with that subject whose text is the body of that message.
 *
 * What goes into the section: the body, minus the trailer paragraph (Co-Authored-By and the like),
 * minus the lines git itself treats as comments (`#`, and everything under a scissors line) —
 * commit-msg sees the message before git strips them. The date is the machine's, the same clock git
 * stamps the merge with.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE = /^:rocket: chore\(release\): (.+)$/;
const TRAILER = /^[A-Za-z][A-Za-z0-9-]*: \S/;
const SCISSORS = /^# -+ >8 -+$/;
const HEADING = /^## /;
const UNRELEASED = /^## \[Unreleased\]\s*$/i;

export function parseMessage(raw) {
  const lines = [];
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (SCISSORS.test(line)) break;
    if (!line.startsWith("#")) lines.push(line.replace(/\s+$/, ""));
  }
  const subject = lines.shift() ?? "";
  const match = subject.match(RELEASE);

  const paragraphs = lines
    .join("\n")
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean);
  const last = paragraphs.at(-1)?.split("\n") ?? [];
  const trailers =
    last.length > 0 && last.every((line) => TRAILER.test(line)) ? paragraphs.pop() : "";

  return {
    subject,
    title: match ? match[1].trim() : null,
    body: paragraphs.join("\n\n"),
    trailers,
  };
}

export function section(date, title, body) {
  return `## ${date} — ${title}\n\n${body}\n`;
}

/** The [start, end) line range of the section titled `title`, or null. */
function findSection(lines, title) {
  const heading = new RegExp(
    `^## \\d{4}-\\d{2}-\\d{2} — ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
  );
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) return null;
  const next = lines.findIndex((line, i) => i > start && HEADING.test(line));
  return [start, next === -1 ? lines.length : next];
}

export function sectionBody(changelog, title) {
  const lines = changelog.split("\n");
  const range = findSection(lines, title);
  return range
    ? lines
        .slice(range[0] + 1, range[1])
        .join("\n")
        .trim()
    : null;
}

/** CHANGELOG.md with the section in place: replacing the one with the same title, or first. */
export function withSection(changelog, date, title, body) {
  const lines = changelog.split("\n");
  const entry = section(date, title, body).split("\n");
  const range = findSection(lines, title);
  if (range) {
    lines.splice(range[0], range[1] - range[0], ...entry);
    return lines.join("\n");
  }
  const first = lines.findIndex((line) => HEADING.test(line));
  if (first === -1)
    throw new Error("CHANGELOG.md no tiene ninguna sección «## »: no sé dónde va la entrada.");
  if (UNRELEASED.test(lines[first])) {
    const next = lines.findIndex((line, i) => i > first && HEADING.test(line));
    lines.splice(first, (next === -1 ? lines.length : next) - first, ...entry);
  } else {
    lines.splice(first, 0, ...entry);
  }
  return lines.join("\n");
}

const git = (args, options = {}) =>
  execFileSync("git", args, { encoding: "utf8", ...options }).trim();

/** The main checkout: the first entry of `git worktree list`, whichever worktree runs this. */
function mainCheckout() {
  try {
    return git(["worktree", "list", "--porcelain"]).match(/^worktree (.+)$/m)?.[1] ?? ".";
  } catch {
    return ".";
  }
}

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function check(file) {
  const { subject, title, body } = parseMessage(readFileSync(file, "utf8"));
  if (!title) return;

  const again = [
    "Si esto era la fusión a main: git merge --abort. Después, con el mismo fichero del mensaje,",
    `  node ${mainCheckout()}/scripts/changelog-release.mjs <mensaje>`,
    "y fusiona en main el commit que imprime, no develop (skill `release`).",
  ].join("\n");
  if (!body)
    fail(
      `La release «${subject}» no tiene cuerpo: el cuerpo es su entrada del CHANGELOG. Di qué cambia para quien usa el proyecto.`,
    );

  let changelog;
  try {
    changelog = git(["show", ":CHANGELOG.md"], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    changelog = readFileSync("CHANGELOG.md", "utf8");
  }
  const written = sectionBody(changelog, title);
  if (written === null)
    fail(`CHANGELOG.md no tiene la entrada de esta release («${title}»).\n${again}`);
  if (written !== body)
    fail(
      `La entrada de CHANGELOG.md para «${title}» no es el cuerpo de este mensaje (¿se editó el mensaje después?).\n${again}`,
    );
}

function write(file, date, base) {
  const { title, body, trailers } = parseMessage(readFileSync(file, "utf8"));
  if (!title)
    fail("El asunto no es el de una release: tiene que empezar por «:rocket: chore(release): ».");
  if (!body)
    fail(
      "El mensaje no tiene cuerpo: el cuerpo es la entrada del CHANGELOG. Di qué cambia para quien usa el proyecto.",
    );

  const parent = git(["rev-parse", "--verify", `${base}^{commit}`]);
  const before = git(["show", `${parent}:CHANGELOG.md`]);
  const after = withSection(before, date, title, body);

  let commit = parent;
  if (after.trim() !== before.trim()) {
    const blob = git(["hash-object", "-w", "--stdin"], { input: `${after.trimEnd()}\n` });
    const scratch = mkdtempSync(join(tmpdir(), "changelog-release-"));
    try {
      const env = { ...process.env, GIT_INDEX_FILE: join(scratch, "index") };
      git(["read-tree", parent], { env });
      git(["update-index", "--add", "--cacheinfo", `100644,${blob},CHANGELOG.md`], { env });
      const tree = git(["write-tree"], { env });
      const message = [
        `:memo: docs(changelog): ${title}`,
        "La entrada de la release, copiada del mensaje de su fusión.",
        trailers,
      ]
        .filter(Boolean)
        .join("\n\n");
      commit = git(["commit-tree", tree, "-p", parent, "-F", "-"], { input: `${message}\n` });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }

  const developAt = git(["worktree", "list", "--porcelain"])
    .split("\n\n")
    .find((block) => block.split("\n").includes(`branch refs/heads/${base}`))
    ?.match(/^worktree (.+)$/m)?.[1];

  process.stdout.write(
    [
      commit === parent
        ? `La entrada ya estaba en ${base} tal cual: no hay commit nuevo.`
        : `Entrada escrita en el commit ${commit} (${base} + CHANGELOG.md).`,
      "",
      "Siguientes pasos, en el worktree release (main):",
      `  git merge --no-ff -F ${file} ${commit}`,
      `  git rev-parse 'HEAD^{tree}' '${commit}^{tree}'    # los dos iguales`,
      `  git -C ${developAt ?? `<checkout de ${base}>`} merge --ff-only ${commit}`,
      "",
      `Si ${base} se movió entretanto, el --ff-only se niega: entonces merge --no-ff del mismo commit.`,
      "",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i === -1 ? fallback : args.splice(i, 2)[1];
  };
  const checking = args.includes("--comprobar");
  if (checking) args.splice(args.indexOf("--comprobar"), 1);
  const date = option("--fecha", today());
  const base = option("--base", "develop");
  const [file] = args;

  if (!file)
    fail(
      "Uso: node scripts/changelog-release.mjs [--comprobar] <fichero del mensaje> [--fecha AAAA-MM-DD] [--base develop]",
    );
  if (checking) check(file);
  else write(file, date, base);
}
