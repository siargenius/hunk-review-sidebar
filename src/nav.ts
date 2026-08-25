import type { ExtensionDiffFile, ExtensionDiffHunk } from "hunkdiff/extension";

export interface NavTarget {
  readonly fileId: string;
  readonly hunkIndex: number;
}

export interface NavPosition {
  readonly fileId: string | null;
  readonly hunkIndex: number | null;
}

interface FlatHunk {
  readonly fileId: string;
  readonly hunkIndex: number;
  readonly reviewed: boolean;
}

/**
 * Find the next (direction 1) or previous (direction -1) unreviewed hunk in
 * review-stream order, crossing file boundaries and wrapping at the ends.
 * Returns null when there are no hunks at all or every hunk is reviewed.
 *
 * Pure and exported for tests; the command handlers feed it the latest
 * changeset file list and the selection snapshot.
 */
export function findUnreviewedHunk(
  files: readonly ExtensionDiffFile[],
  current: NavPosition,
  direction: 1 | -1,
  isReviewed: (path: string, hunk: ExtensionDiffHunk) => boolean,
): NavTarget | null {
  const flat: FlatHunk[] = [];
  for (const file of files) {
    for (const hunk of file.hunks ?? []) {
      flat.push({
        fileId: file.id,
        hunkIndex: hunk.index,
        reviewed: isReviewed(file.path, hunk),
      });
    }
  }
  if (flat.length === 0 || !flat.some((entry) => !entry.reviewed)) return null;

  let start: number | undefined;
  if (current.fileId !== null && current.hunkIndex !== null) {
    const found = flat.findIndex(
      (entry) =>
        entry.fileId === current.fileId &&
        entry.hunkIndex === current.hunkIndex,
    );
    if (found >= 0) start = found;
  }
  // No usable current position: begin just outside the list so the first
  // step lands on the first (or last) entry.
  if (start === undefined) start = direction === 1 ? -1 : flat.length;

  for (let step = 1; step <= flat.length; step++) {
    const index =
      (((start + step * direction) % flat.length) + flat.length) % flat.length;
    const entry = flat[index];
    if (!entry.reviewed)
      return { fileId: entry.fileId, hunkIndex: entry.hunkIndex };
  }
  return null;
}
