import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionDiffFile, ExtensionDiffHunk } from "hunkdiff/extension";
import {
  patchLineLengths,
  resolveReviewedTone,
  reviewedHunkMarks,
} from "../src/highlights.ts";

const PATCH = `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1,4 +1,5 @@ function main() {
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
 const e = 6;
@@ -20,3 +21,2 @@ other() {
 x
-y
 z
\\ No newline at end of file
`;

function file(patch: string): ExtensionDiffFile {
  return {
    id: "id-a.ts",
    path: "a.ts",
    patch,
    stats: { additions: 2, deletions: 2 },
    metadata: null,
    agent: null,
    hunks: [],
  };
}

test("patchLineLengths numbers both sides from hunk headers", () => {
  const { old: oldMap, new: newMap } = patchLineLengths(PATCH);
  // First hunk: context line 1 on both sides, removed old:2, added new:2-3,
  // context old:3-4 / new:4-5.
  assert.equal(newMap.get(1), "const a = 1;".length);
  assert.equal(oldMap.get(2), "const b = 2;".length);
  assert.equal(oldMap.has(2), true);
  assert.equal(newMap.get(2), "const b = 3;".length);
  assert.equal(newMap.get(3), "const c = 4;".length);
  assert.equal(newMap.get(5), "const e = 6;".length);
  // Second hunk picks up numbering from its own header.
  assert.equal(oldMap.get(20), "x".length);
  assert.equal(oldMap.get(21), "y".length);
  assert.equal(newMap.get(21), "z".length);
  // The "\ No newline" marker consumed no line numbers.
  assert.equal(oldMap.get(22), "z".length);
  assert.equal(oldMap.has(23), false);
  assert.equal(newMap.has(23), false);
});

test("reviewedHunkMarks paints full-line ranges on both sides", () => {
  const hunk0: ExtensionDiffHunk = {
    index: 0,
    header: "@@ -1,4 +1,5 @@",
    oldRange: [1, 4],
    newRange: [1, 5],
  };
  const marks = reviewedHunkMarks(file(PATCH), [hunk0], "info");
  assert.ok(marks);
  // Old side: 4 lines, new side: 5 lines — every one painted full width.
  assert.equal(marks.length, 9);
  const removed = marks.find((mark) => mark.side === "old" && mark.line === 2);
  assert.deepEqual(removed?.range, [0, "const b = 2;".length]);
  const added = marks.find((mark) => mark.side === "new" && mark.line === 3);
  assert.deepEqual(added?.range, [0, "const c = 4;".length]);
  assert.ok(marks.every((mark) => mark.tone === "info"));
});

test("reviewedHunkMarks returns null with nothing reviewed", () => {
  assert.equal(reviewedHunkMarks(file(PATCH), [], "info"), null);
});

test("resolveReviewedTone prefers dim on hosts that support it", () => {
  assert.equal(resolveReviewedTone(undefined, true), "dim");
  assert.equal(resolveReviewedTone(undefined, false), "info");
});

test("resolveReviewedTone honors an explicit classic tone on any host", () => {
  assert.equal(resolveReviewedTone("warning", true), "warning");
  assert.equal(resolveReviewedTone("warning", false), "warning");
});

test("resolveReviewedTone degrades a configured dim on old hosts", () => {
  assert.equal(resolveReviewedTone("dim", true), "dim");
  assert.equal(resolveReviewedTone("dim", false), "info");
});

test("resolveReviewedTone falls back on unknown config values", () => {
  assert.equal(resolveReviewedTone("bogus", true), "dim");
  assert.equal(resolveReviewedTone("bogus", false), "info");
});
