import test from "node:test";
import assert from "node:assert/strict";
import { classify, parseWorktrees, nest, sortRows, isMarker } from "../tools/reclaim.mjs";

const set = (...n) => new Set(n);

test("node_modules is safe only with a package.json and a lockfile", () => {
  assert.equal(classify({ name: "node_modules", siblings: set("package.json"), lock: { file: "package-lock.json", restore: "npm ci" } }).status, "safe");
  assert.equal(classify({ name: "node_modules", siblings: set("package.json") }).status, "check");
  assert.equal(classify({ name: "node_modules", siblings: set() }).restore, null);
});

test("target counts only beside Cargo.toml", () => {
  assert.equal(classify({ name: "target", siblings: set("Cargo.toml") }).restore, "cargo build");
  assert.equal(classify({ name: "target", siblings: set("package.json") }), null);
});

test("a venv needs pyvenv.cfg and something to rebuild it from", () => {
  assert.equal(classify({ name: ".venv", siblings: set("uv.lock"), isVenv: true }).restore, "uv sync");
  assert.equal(classify({ name: ".venv", siblings: set(), isVenv: true }).status, "check");
  assert.equal(classify({ name: "env", siblings: set("requirements.txt"), isVenv: false }), null);
});

test("build output must be gitignored, and safe only with a known producer", () => {
  assert.equal(classify({ name: "dist", siblings: set(), inRepo: true, ignored: false }), null);
  assert.equal(classify({ name: "dist", siblings: set(), scripts: { build: "vite build" }, inRepo: true, ignored: true }).status, "safe");
  assert.equal(classify({ name: "build", siblings: set(), inRepo: true, ignored: true }).status, "check");
  assert.equal(classify({ name: "build", siblings: set("CMakeLists.txt"), inRepo: false }).status, "check");
});

test("worktree porcelain drops the main checkout", () => {
  const text = "worktree /r\nHEAD aaa\nbranch refs/heads/main\n\nworktree /r/wt\nHEAD bbb\nbranch refs/heads/fix\n\nworktree /r/d\nHEAD ccc\ndetached\n";
  assert.deepEqual(parseWorktrees(text), [{ path: "/r/wt", head: "bbb", branch: "fix" }, { path: "/r/d", head: "ccc", branch: null }]);
});

test("rows inside another row nest under it", () => {
  const rows = nest([{ path: "/a/build" }, { path: "/a/build/run/x.sqlite" }, { path: "/a/buildings" }]);
  assert.equal(rows[1].inside, "/a/build");
  assert.equal(rows[2].inside, undefined);
});

test("safe idle rows sort first, biggest first", () => {
  const rows = sortRows([
    { path: "c", status: "check", active: false, size: 9 },
    { path: "s1", status: "safe", active: true, size: 8 },
    { path: "s2", status: "safe", active: false, size: 2 },
    { path: "s3", status: "safe", active: false, size: 5 },
  ]);
  assert.deepEqual(rows.map(r => r.path), ["s3", "s2", "s1", "c"]);
});

test("only a file named INVALID marks a run", () => {
  assert.ok(isMarker("/runs/a/INVALID.txt"));
  assert.ok(isMarker("/runs/a/INVALID"));
  assert.ok(!isMarker("/torch/invalid_arguments.h"));
  assert.ok(!isMarker("/data/INVALID_pointer.sav"));
});

test("Xcode build folders are known; Makefile guesses stay a check", () => {
  assert.equal(classify({ name: "build", siblings: set("App.xcodeproj"), inRepo: true, ignored: true }).status, "safe");
  const make = classify({ name: "build", siblings: set("Makefile"), inRepo: true, ignored: true });
  assert.equal(make.status, "check");
  assert.match(make.restore, /make/);
});

test("nothing nests under a worktree", () => {
  const rows = nest([{ path: "/w", kind: "worktree" }, { path: "/w/node_modules", kind: "packages" }]);
  assert.equal(rows[1].inside, undefined);
});
