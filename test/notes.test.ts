import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentAnnotation, ExtensionDiffFile } from "hunkdiff/extension";
import type { ThreadNote } from "../src/notes.ts";
import { notesFor, noteSource, threadsFor, revealNote } from "../src/notes.ts";

const user: AgentAnnotation = { id: "user:1", summary: "Check this branch", source: "user", newRange: [12, 14] };
const agent: AgentAnnotation = { id: "agent:1", summary: "Missing guard", rationale: "An empty list reaches this branch.", oldRange: [8, 8], author: "Codex" };
function file(notes: ThreadNote[] = []): ExtensionDiffFile {
  return { id: "renumbered-7", path: "src/a.ts", patch: "", metadata: null,
    stats: { additions: 2, deletions: 1 }, agent: { path: "src/a.ts", annotations: notes } };
}

test("user, agent, and sidecar notes retain their order and source labels", () => {
  const f = file([user, agent]);
  assert.deepEqual(notesFor(f), [user, agent]);
  assert.equal(noteSource(user), "You");
  assert.equal(noteSource(agent), "Codex");
  assert.equal(noteSource({ summary: "Sidecar" }), "Agent");
});

test("new pane props replace edited and removed notes without cached copies", () => {
  assert.equal(notesFor(file([user])).length, 1);
  assert.equal(notesFor(file([{ ...user, summary: "Updated" }]))[0]?.summary, "Updated");
  assert.deepEqual(notesFor(file()), []);
  assert.deepEqual(notesFor({ ...file(), agent: null }), []);
});

test("note clicks use the current runtime id and the correct diff side", () => {
  const calls: unknown[][] = [];
  const actions = {
    revealLine: (...args: unknown[]) => { calls.push(args); },
    selectFile: (...args: unknown[]) => { calls.push(args); },
  };
  revealNote(file(), user, actions);
  revealNote(file(), agent, actions);
  revealNote(file(), { summary: "File note" }, actions);
  assert.deepEqual(calls, [
    ["renumbered-7", "new", 12], ["renumbered-7", "old", 8], ["renumbered-7"],
  ]);
});


test("separate threads at the same line retain their own latest author", () => {
  const f = file([
    { ...user, id: "root", createdAt: "2026-11-15T10:00:00Z" },
    { ...user, id: "other", createdAt: "2026-11-15T10:01:00Z" },
    { ...agent, id: "reply", parentId: "root", createdAt: "2026-11-15T10:02:00Z" },
    { ...user, id: "last", parentId: "reply", createdAt: "2026-11-15T10:03:00Z" },
  ]);
  f.hunks = [{ index: 2, header: "@@", newRange: [10, 20] }];
  const threads = threadsFor(f);
  assert.equal(threads.length, 2);
  assert.equal(threads[0]?.count, 3);
  assert.equal(threads[0]?.latest.id, "last");
  assert.equal(noteSource(threads[0]!.latest), "You");
  assert.equal(threads[0]?.hunkIndex, 2);
  assert.equal(threads[1]?.count, 1);
});

test("latest author follows creation time even if reply order differs", () => {
  const threads = threadsFor(file([
    { ...user, id: "last", parentId: "root", createdAt: "2026-11-15T12:00:00Z" },
    { ...agent, id: "root", createdAt: "2026-11-15T10:00:00Z", updatedAt: "2026-11-15T13:00:00Z" },
  ]));
  assert.equal(threads.length, 1);
  assert.equal(threads[0]?.root.id, "root");
  assert.equal(threads[0]?.latest.id, "last");
});

test("unanchored notes, deleted-line threads, and sidecars keep independent rows", () => {
  const f = file([agent, { summary: "No range" }, { summary: "Another" }]);
  f.hunks = [{ index: 0, header: "@@", oldRange: [5, 10] }];
  assert.deepEqual(threadsFor(f).map(t => t.hunkIndex), [0, null, null]);
});

test("remaining replies share a missing root, and cyclic metadata terminates", () => {
  assert.equal(threadsFor(file([
    { ...user, id: "a", parentId: "missing" },
    { ...agent, id: "b", parentId: "missing" },
  ]))[0]?.count, 2);
  assert.ok(threadsFor(file([
    { ...user, id: "a", parentId: "b" }, { ...agent, id: "b", parentId: "a" },
  ])).length > 0);
});


test("hunk labels contain only range metadata", async () => {
  const { hunkLabel } = await import("../src/hunk-label.ts");
  assert.equal(hunkLabel("@@ -10,6 +10,8 @@ function render() {"), "@@ -10,6 +10,8 @@");
  assert.equal(hunkLabel("@@ -0,0 +1,28 @@"), "@@ -0,0 +1,28 @@");
  assert.equal(hunkLabel("@@@ -1,2 -3,4 +5,6 @@@ context"), "@@@ -1,2 -3,4 +5,6 @@@");
  assert.equal(hunkLabel("function render()"), "@@");
});
