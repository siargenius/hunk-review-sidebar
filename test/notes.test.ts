import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentAnnotation, ExtensionDiffFile } from "hunkdiff/extension";
import { notesFor, noteSource, noteText, revealNote } from "../src/notes.ts";

const user: AgentAnnotation = { id: "user:1", summary: "Check this branch", source: "user", newRange: [12, 14] };
const agent: AgentAnnotation = { id: "agent:1", summary: "Missing guard", rationale: "An empty list reaches this branch.", oldRange: [8, 8], author: "Codex" };
function file(notes: AgentAnnotation[] = []): ExtensionDiffFile {
  return { id: "renumbered-7", path: "src/a.ts", patch: "", metadata: null,
    stats: { additions: 2, deletions: 1 }, agent: { path: "src/a.ts", annotations: notes } };
}

test("user, agent, and sidecar notes retain their order and source labels", () => {
  const f = file([user, agent]);
  assert.deepEqual(notesFor(f), [user, agent]);
  assert.equal(noteSource(user), "you");
  assert.equal(noteSource(agent), "Codex");
  assert.equal(noteSource({ summary: "Sidecar" }), "agent");
  assert.equal(noteText(agent), "Missing guard — An empty list reaches this branch.");
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
