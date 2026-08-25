import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { ExtensionDiffFile, ExtensionDiffHunk } from "hunkdiff/extension";
import {
  fileKey,
  fileProgress,
  getState,
  hunkKey,
  isFileFullyReviewed,
  isPathFullyReviewed,
  noteFiles,
  reconcile,
  resetReviewed,
  setHideReviewedFiles,
  subscribe,
  toggleFile,
  toggleHunk,
  totalProgress,
} from "../src/store.ts";

function hunk(
  index: number,
  header = `@@ -${index * 10},5 +${index * 10},5 @@`,
): ExtensionDiffHunk {
  return {
    index,
    header,
    oldRange: [index * 10, index * 10 + 4],
    newRange: [index * 10, index * 10 + 4],
  };
}

function file(path: string, hunks: ExtensionDiffHunk[]): ExtensionDiffFile {
  return {
    id: `id-${path}`,
    path,
    patch: "",
    stats: { additions: 1, deletions: 1 },
    metadata: null,
    agent: null,
    hunks,
  };
}

beforeEach(() => {
  resetReviewed();
  setHideReviewedFiles(false);
  noteFiles([]);
});

test("toggleHunk toggles a mark on and off", () => {
  assert.equal(toggleHunk("a.ts", hunk(0)), true);
  assert.equal(getState().reviewed.has(hunkKey("a.ts", hunk(0))), true);
  assert.equal(toggleHunk("a.ts", hunk(0)), false);
  assert.equal(getState().reviewed.size, 0);
});

test("fileProgress counts reviewed hunks", () => {
  const f = file("a.ts", [hunk(0), hunk(1), hunk(2)]);
  toggleHunk("a.ts", hunk(0));
  toggleHunk("a.ts", hunk(2));
  assert.deepEqual(fileProgress(f), {
    reviewed: 2,
    total: 3,
    fileReviewed: false,
  });
  assert.equal(isFileFullyReviewed(f), false);
  toggleHunk("a.ts", hunk(1));
  assert.equal(isFileFullyReviewed(f), true);
});

test("toggleFile marks all hunks, then unmarks all when fully reviewed", () => {
  const f = file("a.ts", [hunk(0), hunk(1)]);
  assert.equal(toggleFile(f), true);
  assert.equal(isFileFullyReviewed(f), true);
  assert.equal(toggleFile(f), false);
  assert.equal(getState().reviewed.size, 0);
});

test("toggleFile partially reviewed file completes it", () => {
  const f = file("a.ts", [hunk(0), hunk(1)]);
  toggleHunk("a.ts", hunk(0));
  assert.equal(toggleFile(f), true);
  assert.equal(isFileFullyReviewed(f), true);
});

test("hunk-less files use the path-only file key", () => {
  const f = file("logo.png", []);
  assert.equal(isFileFullyReviewed(f), false);
  assert.equal(toggleFile(f), true);
  assert.equal(getState().reviewed.has(fileKey("logo.png")), true);
  assert.equal(isFileFullyReviewed(f), true);
  assert.equal(toggleFile(f), false);
  assert.equal(isFileFullyReviewed(f), false);
});

test("hunk identity survives renumbering", () => {
  const before = [hunk(0), hunk(1)];
  toggleHunk("a.ts", before[1]);
  // Reload drops a file earlier in the changeset: indexes shift, spans don't.
  const after = [
    { ...hunk(0), index: 0 },
    { ...hunk(1), index: 0 }, // the marked hunk, now at index 0
  ];
  noteFiles([file("a.ts", after)]);
  const dropped = reconcile([file("a.ts", after)]);
  assert.equal(dropped, 0);
  assert.equal(getState().reviewed.has(hunkKey("a.ts", after[1])), true);
});

test("reconcile drops marks whose hunk disappeared from a present file", () => {
  const f = file("a.ts", [hunk(0), hunk(1)]);
  toggleFile(f);
  noteFiles([file("a.ts", [hunk(0)])]);
  const dropped = reconcile([file("a.ts", [hunk(0)])]);
  assert.equal(dropped, 1);
  assert.equal(getState().reviewed.size, 1);
});

test("reconcile keeps absent-path marks while hiding, drops them when not", () => {
  const f = file("a.ts", [hunk(0)]);
  toggleFile(f);
  setHideReviewedFiles(true);
  assert.equal(reconcile([]), 0);
  setHideReviewedFiles(false);
  assert.equal(reconcile([]), 1);
});

test("isPathFullyReviewed answers from noted files (transform path)", () => {
  const f = file("a.ts", [hunk(0), hunk(1)]);
  noteFiles([f]);
  assert.equal(isPathFullyReviewed("a.ts"), false);
  toggleFile(f);
  assert.equal(isPathFullyReviewed("a.ts"), true);
  assert.equal(isPathFullyReviewed("unknown.ts"), false);
});

test("totalProgress counts hunk-less files as one unit", () => {
  const files = [file("a.ts", [hunk(0), hunk(1)]), file("logo.png", [])];
  assert.deepEqual(totalProgress(files), { reviewed: 0, total: 3 });
  toggleHunk("a.ts", hunk(0));
  toggleFile(files[1]);
  assert.deepEqual(totalProgress(files), { reviewed: 2, total: 3 });
});

test("subscribers are notified on change with a fresh state reference", () => {
  let calls = 0;
  let lastState: unknown = null;
  const unsubscribe = subscribe(() => {
    calls++;
    lastState = getState();
  });
  const before = getState();
  toggleHunk("a.ts", hunk(0));
  assert.equal(calls, 1);
  assert.notEqual(lastState, before);
  unsubscribe();
  toggleHunk("a.ts", hunk(1));
  assert.equal(calls, 1);
});
