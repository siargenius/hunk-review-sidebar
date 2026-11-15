import type { AgentAnnotation, ExtensionDiffFile, ExtensionPaneActions } from "hunkdiff/extension";

// Hunk 0.24 attaches reply identities to saved annotations. Sidecars may omit them.
export interface ThreadNote extends AgentAnnotation {
  readonly parentId?: string;
}

export interface NoteThread {
  readonly id: string;
  readonly root: ThreadNote;
  readonly latest: ThreadNote;
  readonly count: number;
  readonly hunkIndex: number | null;
}

export function notesFor(file: ExtensionDiffFile): readonly ThreadNote[] {
  return file.agent?.annotations ?? [];
}

export function noteSource(note: AgentAnnotation): string {
  if (note.source === "user") return "You";
  return note.author || "Agent";
}

function timestamp(note: ThreadNote): number {
  const value = Date.parse(note.createdAt ?? note.updatedAt ?? "");
  return Number.isFinite(value) ? value : 0;
}

function hunkFor(file: ExtensionDiffFile, note: ThreadNote): number | null {
  for (const hunk of file.hunks ?? []) {
    for (const side of ["newRange", "oldRange"] as const) {
      const range = note[side];
      const span = hunk[side];
      if (range && span && range[0] <= span[1] && range[1] >= span[0]) return hunk.index;
    }
  }
  return null;
}

/** Group by explicit reply identity, never by line (separate threads can share an anchor). */
export function threadsFor(file: ExtensionDiffFile): readonly NoteThread[] {
  const notes = notesFor(file);
  const byId = new Map(notes.flatMap(note => note.id ? [[note.id, note] as const] : []));
  const groups = new Map<string, ThreadNote[]>();
  notes.forEach((note, index) => {
    let root = note;
    const visited = new Set<string>();
    while (root.parentId && byId.has(root.parentId) && !visited.has(root.parentId)) {
      visited.add(root.parentId);
      root = byId.get(root.parentId)!;
    }
    // A missing parent still gives its remaining replies a shared thread identity.
    const id = root.parentId && !byId.has(root.parentId) ? root.parentId : root.id ?? `sidecar:${index}`;
    const group = groups.get(id) ?? [];
    group.push(note);
    groups.set(id, group);
  });
  return [...groups].map(([id, group]) => {
    const root = byId.get(id) ?? group[0]!;
    const latest = group.reduce((last, note) => timestamp(note) >= timestamp(last) ? note : last);
    return { id, root, latest, count: group.length, hunkIndex: hunkFor(file, root) };
  });
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
