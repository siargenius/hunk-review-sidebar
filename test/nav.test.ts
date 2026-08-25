import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionDiffFile, ExtensionDiffHunk } from "hunkdiff/extension";
import { findUnreviewedHunk } from "../src/nav.ts";

function hunk(index: number): ExtensionDiffHunk {
  return {
    index,
    header: `@@ h${index} @@`,
    oldRange: [1, 2],
    newRange: [1, 2],
  };
}

function file(path: string, hunkCount: number): ExtensionDiffFile {
  return {
    id: `id-${path}`,
    path,
    patch: "",
    stats: { additions: 1, deletions: 1 },
    metadata: null,
    agent: null,
    hunks: Array.from({ length: hunkCount }, (_, index) => hunk(index)),
  };
}

// Two files: a.ts has hunks 0,1 — b.ts has hunks 0,1.
const files = [file("a.ts", 2), file("b.ts", 2)];
const nobody = () => false;
const reviewedSet = (paths: string[]) => {
  const set = new Set(paths);
  return (path: string, h: ExtensionDiffHunk) => set.has(`${path}#${h.index}`);
};

test("next from a position skips reviewed hunks and crosses files", () => {
  const isReviewed = reviewedSet(["a.ts#1", "b.ts#0"]);
  const target = findUnreviewedHunk(
    files,
    { fileId: "id-a.ts", hunkIndex: 0 },
    1,
    isReviewed,
  );
  assert.deepEqual(target, { fileId: "id-b.ts", hunkIndex: 1 });
});

test("next wraps around to the beginning", () => {
  const isReviewed = reviewedSet(["b.ts#0"]);
  const target = findUnreviewedHunk(
    files,
    { fileId: "id-b.ts", hunkIndex: 1 },
    1,
    isReviewed,
  );
  assert.deepEqual(target, { fileId: "id-a.ts", hunkIndex: 0 });
});

test("previous walks backward across files", () => {
  const target = findUnreviewedHunk(
    files,
    { fileId: "id-b.ts", hunkIndex: 0 },
    -1,
    nobody,
  );
  assert.deepEqual(target, { fileId: "id-a.ts", hunkIndex: 1 });
});

test("previous wraps to the end", () => {
  const isReviewed = reviewedSet(["a.ts#1"]);
  const target = findUnreviewedHunk(
    files,
    { fileId: "id-a.ts", hunkIndex: 0 },
    -1,
    isReviewed,
  );
  assert.deepEqual(target, { fileId: "id-b.ts", hunkIndex: 1 });
});

test("no current position: next starts at the first hunk, previous at the last", () => {
  assert.deepEqual(
    findUnreviewedHunk(files, { fileId: null, hunkIndex: null }, 1, nobody),
    {
      fileId: "id-a.ts",
      hunkIndex: 0,
    },
  );
  assert.deepEqual(
    findUnreviewedHunk(files, { fileId: null, hunkIndex: null }, -1, nobody),
    {
      fileId: "id-b.ts",
      hunkIndex: 1,
    },
  );
});

test("current position on a reviewed hunk still finds the next unreviewed", () => {
  const isReviewed = reviewedSet(["a.ts#0"]);
  const target = findUnreviewedHunk(
    files,
    { fileId: "id-a.ts", hunkIndex: 0 },
    1,
    isReviewed,
  );
  assert.deepEqual(target, { fileId: "id-a.ts", hunkIndex: 1 });
});

test("everything reviewed returns null", () => {
  const isReviewed = reviewedSet(["a.ts#0", "a.ts#1", "b.ts#0", "b.ts#1"]);
  assert.equal(
    findUnreviewedHunk(
      files,
      { fileId: "id-a.ts", hunkIndex: 0 },
      1,
      isReviewed,
    ),
    null,
  );
});

test("no hunks at all returns null", () => {
  assert.equal(
    findUnreviewedHunk(
      [file("empty.ts", 0)],
      { fileId: null, hunkIndex: null },
      1,
      nobody,
    ),
    null,
  );
});

test("current position missing from the list falls back to an edge", () => {
  const target = findUnreviewedHunk(
    files,
    { fileId: "id-gone.ts", hunkIndex: 3 },
    1,
    nobody,
  );
  assert.deepEqual(target, { fileId: "id-a.ts", hunkIndex: 0 });
});
