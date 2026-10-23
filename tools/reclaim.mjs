#!/usr/bin/env node
// Finds space in a code folder that can be rebuilt, and says how to get each piece back.
//   node tools/reclaim.mjs [root] [--protect <path>]... [--json <file>]
//   node tools/reclaim.mjs [root] [--protect <path>]... --trash <path>...
// Scanning never changes anything. --trash moves the named paths to the macOS Trash
// (linked git worktrees go through `git worktree remove`, which refuses dirty ones).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const DAY = 86400e3;
const ACTIVE_DAYS = 7;
const BIG_FILE = 64 << 20;
// A folder holding a file named exactly INVALID(.txt|.md) is a run someone marked unusable.
export const isMarker = f => /^INVALID(\.(txt|md))?$/.test(path.basename(f));

const VENV = new Set([".venv", "venv", "env"]);
const OUTPUT = new Set(["build", "dist", ".next", ".nuxt", ".svelte-kit", ".turbo", ".parcel-cache", ".build", ".gradle", "DerivedData"]);
const LOCKS = [
  ["package-lock.json", "npm ci"], ["npm-shrinkwrap.json", "npm ci"],
  ["pnpm-lock.yaml", "pnpm install --frozen-lockfile"], ["yarn.lock", "yarn install --frozen-lockfile"],
  ["bun.lock", "bun install --frozen-lockfile"], ["bun.lockb", "bun install --frozen-lockfile"],
];

// What a candidate folder is, why it can go, and how to get it back.
// Returns null when the folder is not something this tool recognises as rebuildable.
export function classify({ name, siblings, scripts = {}, lock = null, ignored = false, inRepo = false, isVenv = false }) {
  if (name === "node_modules") {
    if (!siblings.has("package.json")) return { kind: "packages", why: "Package install with no package.json beside it", restore: null, status: "check" };
    if (!lock) return { kind: "packages", why: "Package install with no lockfile, so a reinstall may pick newer versions", restore: "npm install", status: "check" };
    return { kind: "packages", why: `Package install, pinned by ${lock.file}`, restore: lock.restore, status: "safe" };
  }
  if (name === "target") {
    if (!siblings.has("Cargo.toml")) return null;
    return { kind: "rust", why: "Rust compiler output", restore: "cargo build", status: "safe" };
  }
  if (VENV.has(name)) {
    if (!isVenv) return null;
    const restore = siblings.has("uv.lock") ? "uv sync"
      : siblings.has("poetry.lock") ? "poetry install"
      : siblings.has("requirements.txt") ? "pip install -r requirements.txt"
      : siblings.has("pyproject.toml") ? "pip install -e ." : null;
    return restore
      ? { kind: "python", why: "Python virtual environment", restore, status: "safe" }
      : { kind: "python", why: "Python virtual environment with no requirements file beside it", restore: null, status: "check" };
  }
  if (OUTPUT.has(name)) {
    if (inRepo && !ignored) return null;
    const [restore, sure] = producer(name, siblings, scripts);
    const why = inRepo ? "Gitignored build output" : "Looks like build output, but there is no git repo to confirm it";
    return { kind: "output", why, restore, status: inRepo && sure ? "safe" : "check" };
  }
  return null;
}

// [how to get it back, whether we are sure that is what made it]
function producer(name, siblings, scripts) {
  const xcode = [...siblings].some(n => n.endsWith(".xcodeproj") || n.endsWith(".xcworkspace"));
  if (name === ".gradle") return ["Gradle recreates it on the next build", true];
  if (name === "DerivedData" || (name === "build" && xcode)) return ["Xcode recreates it on the next build", true];
  if (name === ".build" && siblings.has("Package.swift")) return ["swift build", true];
  if ([".next", ".nuxt", ".svelte-kit", ".turbo", ".parcel-cache"].includes(name))
    return [scripts.build ? "npm run build (or the dev server)" : "The dev server recreates it", true];
  if (scripts.build) return ["npm run build", true];
  if (siblings.has("build.gradle") || siblings.has("build.gradle.kts")) return ["./gradlew build", true];
  if (name === "build" && siblings.has("CMakeLists.txt")) return ["cmake -B build && cmake --build build", true];
  if (name === "build" && siblings.has("meson.build")) return ["meson setup build && meson compile -C build", true];
  if (siblings.has("Makefile")) return ["make (probably; check the Makefile)", false];
  if (siblings.has("tools")) return ["One of the scripts in tools/ (check which)", false];
  return [null, false];
}

// Parses `git worktree list --porcelain`, dropping the main checkout.
export function parseWorktrees(text) {
  return text.trim().split(/\n\n+/).slice(1).map(block => {
    const wt = {};
    for (const line of block.split("\n")) {
      const [k, ...rest] = line.split(" ");
      const v = rest.join(" ");
      if (k === "worktree") wt.path = v;
      else if (k === "HEAD") wt.head = v;
      else if (k === "branch") wt.branch = v.replace(/^refs\/heads\//, "");
      else if (k === "detached") wt.branch = null;
    }
    return wt;
  }).filter(wt => wt.path);
}

// Rows inside another row are shown under it and left out of the totals.
// Nothing nests under a worktree: its node_modules can go even when the checkout must stay.
export function nest(rows) {
  const byLen = [...rows].sort((a, b) => a.path.length - b.path.length);
  for (const r of byLen) {
    const parent = byLen.find(p => p !== r && !p.inside && p.kind !== "worktree" && (r.path + "/").startsWith(p.path + "/") && r.path !== p.path);
    if (parent) r.inside = parent.path;
  }
  return rows;
}

async function git(dir, ...args) {
  try { return (await exec("git", ["-C", dir, ...args], { maxBuffer: 64 << 20 })).stdout; }
  catch (e) { return e.code === 1 ? null : undefined; }
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

async function du(p) {
  try { return Number((await exec("du", ["-sk", p])).stdout.split("\t")[0]) * 1024; } catch { return 0; }
}

function findLock(dir, root) {
  for (let d = dir; d.startsWith(root); d = path.dirname(d)) {
    for (const [file, restore] of LOCKS) if (fs.existsSync(path.join(d, file)))
      return { file: d === dir ? file : path.relative(dir, path.join(d, file)), restore: d === dir ? restore : `${restore} (in ${path.relative(root, d) || "."})` };
    if (d === root) break;
  }
  return null;
}

function readScripts(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts || {}; } catch { return {}; }
}

function walk(root) {
  const candidates = [], repos = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    const names = new Set(ents.map(e => e.name));
    if (ents.some(e => e.name === ".git" && e.isDirectory())) repos.push(dir);
    for (const e of ents) {
      if (!e.isDirectory() || e.name === ".git") continue;
      const p = path.join(dir, e.name);
      const isVenv = VENV.has(e.name) && fs.existsSync(path.join(p, "pyvenv.cfg"));
      const known = e.name === "node_modules" || (e.name === "target" && names.has("Cargo.toml")) || isVenv || OUTPUT.has(e.name);
      if (known) candidates.push({ path: p, parent: dir, name: e.name, siblings: names, isVenv });
      else stack.push(p);
    }
  }
  return { candidates, repos };
}

async function bigFiles(root) {
  const args = [root, "(", "-name", "node_modules", "-o", "-name", ".git", ")", "-prune", "-o", "-type", "f",
    "(", "-size", `+${BIG_FILE / 1024}k`, "-o", "-name", "INVALID", "-o", "-name", "INVALID.txt", "-o", "-name", "INVALID.md", ")", "-print0"];
  const { stdout } = await exec("find", args, { maxBuffer: 256 << 20 }).catch(e => ({ stdout: e.stdout || "" }));
  return stdout.split("\0").filter(Boolean);
}

async function activity(dir, root, cache) {
  let repo = null;
  for (let d = dir; d.startsWith(root); d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) { repo = d; break; }
    if (d === root) break;
  }
  const key = repo || dir;
  if (cache.has(key)) return cache.get(key);
  let t = 0;
  if (repo) {
    const ct = await git(repo, "log", "-1", "--format=%ct");
    if (ct) t = Number(ct) * 1000;
    try { t = Math.max(t, fs.statSync(path.join(repo, ".git", "index")).mtimeMs); } catch {}
  } else {
    try { for (const n of fs.readdirSync(dir)) { try { t = Math.max(t, fs.statSync(path.join(dir, n)).mtimeMs); } catch {} } } catch {}
  }
  cache.set(key, t);
  return t;
}

export async function scan(root, protect = []) {
  root = path.resolve(root);
  const isProtected = p => protect.some(x => (p + "/").startsWith(x + "/"));
  const { candidates, repos } = walk(root);
  const rows = [];

  await pool(candidates, 8, async c => {
    const ign = await git(c.parent, "check-ignore", "-q", c.name);
    const inRepo = ign !== undefined;
    const verdict = classify({
      name: c.name, siblings: c.siblings, isVenv: c.isVenv, inRepo, ignored: ign === "",
      scripts: readScripts(c.parent), lock: c.name === "node_modules" ? findLock(c.parent, root) : null,
    });
    if (verdict) rows.push({ path: c.path, project: c.parent, ...verdict });
  });

  const files = await bigFiles(root);
  for (const f of files.filter(isMarker)) {
    let note = "";
    try { note = fs.readFileSync(f, "utf8").trim().split(/(?<=\.)\s/)[0].slice(0, 200); } catch {}
    rows.push({ path: path.dirname(f), project: path.dirname(path.dirname(f)), kind: "invalid",
      why: `Marked invalid by ${path.basename(f)}: “${note}”`, restore: "Rerun it", status: "check" });
  }
  const bySize = new Map();
  for (const f of files.filter(f => !isMarker(f))) {
    const s = fs.statSync(f).size; bySize.set(s, [...(bySize.get(s) || []), f]);
  }
  for (const [size, group] of bySize) {
    if (group.length < 2) continue;
    const sums = await pool(group, 4, async f => (await exec("shasum", [f])).stdout.slice(0, 40));
    const same = new Map();
    group.forEach((f, i) => same.set(sums[i], [...(same.get(sums[i]) || []), f]));
    for (const copies of same.values()) if (copies.length > 1)
      rows.push({ path: copies[1], project: path.dirname(copies[1]), kind: "copies", size: size * (copies.length - 1), copies,
        why: `${copies.length} identical copies of a ${fmt(size)} file`, restore: `Keep ${path.relative(root, copies[0])}`, status: "check" });
  }

  await pool(repos, 8, async repo => {
    const list = await git(repo, "worktree", "list", "--porcelain");
    if (!list) return;
    const base = (await git(repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"))?.trim()
      || ((await git(repo, "rev-parse", "--verify", "-q", "main")) !== null ? "main" : "master");
    for (const wt of parseWorktrees(list)) {
      if (!wt.path.startsWith(root + "/") || !fs.existsSync(wt.path)) continue;
      const dirty = (await git(wt.path, "status", "--porcelain"))?.split("\n").filter(Boolean).length ?? 0;
      const merged = (await git(repo, "merge-base", "--is-ancestor", wt.head, base)) !== null;
      const why = dirty ? `Git worktree with ${dirty} uncommitted change${dirty > 1 ? "s" : ""}`
        : merged ? `Git worktree, clean, already in ${base}` : `Git worktree, clean, but has commits not in ${base}`;
      rows.push({ path: wt.path, project: repo, kind: "worktree", why, status: !dirty && merged ? "safe" : "check",
        restore: `git worktree add ${path.relative(repo, wt.path)} ${wt.branch || wt.head.slice(0, 7)}`, protectedBy: isProtected(repo) ? repo : null });
    }
  });

  const cache = new Map();
  await pool(rows, 8, async r => {
    if (r.size === undefined) r.size = await du(r.path);
    r.lastActive = await activity(r.project, root, cache);
    r.active = Date.now() - r.lastActive < ACTIVE_DAYS * DAY;
    if (isProtected(r.path) || r.protectedBy) r.status = "protected";
  });
  // A worktree's size is the checkout itself, not the installs and builds listed on their own rows.
  for (const w of rows.filter(r => r.kind === "worktree"))
    for (const r of rows) if (r !== w && !r.inside && (r.path + "/").startsWith(w.path + "/")) w.size -= r.size;
  return { root, scannedAt: new Date().toISOString(), protect, rows: nest(rows) };
}

export function fmt(b) {
  return b < 1e3 ? `${b} B` : b < 1e6 ? `${(b / 1e3).toFixed(1)} KB` : b < 1e9 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e9).toFixed(2)} GB`;
}

const ORDER = { safe: 0, check: 1, protected: 2 };
export function sortRows(rows) {
  return [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.active - b.active || b.size - a.size);
}

function print({ root, rows }) {
  const top = rows.filter(r => !r.inside);
  const rel = p => path.relative(root, p) || ".";
  for (const status of ["safe", "check", "protected"]) {
    const group = sortRows(top.filter(r => r.status === status));
    if (!group.length) continue;
    const total = group.reduce((a, r) => a + r.size, 0);
    console.log(`\n${status.toUpperCase()}  ${fmt(total)} in ${group.length} places`);
    for (const r of group) {
      console.log(`  ${fmt(r.size).padStart(9)}  ${rel(r.path)}`);
      const when = r.active ? ` · touched ${Math.max(0, Math.round((Date.now() - r.lastActive) / DAY))}d ago` : "";
      console.log(`             ${r.why}${r.restore ? ` · back with: ${r.restore}` : ""}${when}`);
      for (const k of rows.filter(x => x.inside === r.path)) console.log(`             └ ${fmt(k.size)} ${rel(k.path)}: ${k.why}`);
    }
  }
}

async function trash(root, targets, protect) {
  for (const t of targets) {
    const p = path.resolve(root, t);
    if (!(p + "/").startsWith(root + "/") || p === root) { console.log(`skip ${t}: outside ${root}`); continue; }
    if (protect.some(x => (p + "/").startsWith(x + "/"))) { console.log(`skip ${t}: protected`); continue; }
    if (!fs.existsSync(p)) { console.log(`skip ${t}: not found`); continue; }
    try {
      if (fs.statSync(path.join(p, ".git"), { throwIfNoEntry: false })?.isFile()) await exec("git", ["-C", p, "worktree", "remove", p]);
      else await exec("/usr/bin/trash", [p]);
      console.log(`moved ${t}`);
    } catch (e) { console.log(`failed ${t}: ${(e.stderr || e.message).trim()}`); }
  }
}

async function main(argv) {
  let root = process.cwd(), json = null; const protect = [], targets = []; let mode = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--protect") protect.push(argv[++i]);
    else if (a === "--json") json = argv[++i];
    else if (a === "--trash") mode = "trash";
    else if (mode === "trash") targets.push(a);
    else root = a.replace(/^~(?=$|\/)/, os.homedir());
  }
  root = path.resolve(root);
  const prot = protect.map(p => path.resolve(root, p.replace(/^~(?=$|\/)/, os.homedir())));
  if (mode === "trash") return trash(root, targets, prot);
  const t0 = Date.now();
  const report = await scan(root, prot);
  if (json) fs.writeFileSync(json, JSON.stringify(report, null, 1));
  print(report);
  console.log(`\nScanned ${root} in ${((Date.now() - t0) / 1000).toFixed(0)}s. Nothing was changed.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
