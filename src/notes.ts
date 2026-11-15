import type { AgentAnnotation, ExtensionDiffFile, ExtensionPaneActions } from "hunkdiff/extension";

/** Notes are supplied by Hunk with the visible file, including live edits. */
export function notesFor(file: ExtensionDiffFile): readonly AgentAnnotation[] {
  return file.agent?.annotations ?? [];
}

export function noteSource(note: AgentAnnotation): string {
  if (note.source === "user") return "you";
  return note.author || "agent";
}

export function noteText(note: AgentAnnotation): string {
  return [note.title, note.summary, note.rationale]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" — ");
}

/** Prefer the new-side anchor; deleted-line notes retain their old-side anchor. */
export function revealNote(
  file: ExtensionDiffFile,
  note: AgentAnnotation,
  actions: Pick<ExtensionPaneActions, "revealLine" | "selectFile">,
): void {
  if (note.newRange) actions.revealLine(file.id, "new", note.newRange[0]);
  else if (note.oldRange) actions.revealLine(file.id, "old", note.oldRange[0]);
  else actions.selectFile(file.id);
}
