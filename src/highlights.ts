import type {
  ExtensionDiffFile,
  ExtensionDiffHunk,
  ExtensionLineHighlight,
  ExtensionLineHighlightTone,
} from "hunkdiff/extension";

/**
 * Parse a file's unified diff into per-side line text lengths, addressed the
 * way line-highlight marks are: 1-based source line numbers on each side.
 * Mark ranges must be in bounds of the raw line text, so the highlighter
 * needs the real length of every line it paints.
 */
export function patchLineLengths(patch: string): {
  old: Map<number, number>;
  new: Map<number, number>;
} {
  const oldLengths = new Map<number, number>();
  const newLengths = new Map<number, number>();
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      if (!match) {
        inHunk = false;
        continue;
      }
      oldLine = Number.parseInt(match[1], 10);
      newLine = Number.parseInt(match[2], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    const marker = raw[0];
    const length = raw.length - 1;
    if (marker === " ") {
      oldLengths.set(oldLine++, length);
      newLengths.set(newLine++, length);
    } else if (marker === "-") {
      oldLengths.set(oldLine++, length);
    } else if (marker === "+") {
      newLengths.set(newLine++, length);
    } else if (marker === "\\") {
      // "\ No newline at end of file" — describes the previous line.
    } else {
      // Any other line ends the hunk body (next header, diff metadata).
      inHunk = false;
    }
  }
  return { old: oldLengths, new: newLengths };
}

/**
 * Full-line marks covering every line of every reviewed hunk, on both sides.
 * Context lines answer to either side's numbering, added lines exist only on
 * the new side, removed only on the old — so marking each side's span paints
 * exactly the hunk's rendered rows. Empty lines (length 0) have no cells to
 * paint and are skipped; a zero-length range would paint nothing anyway.
 */
export function reviewedHunkMarks(
  file: ExtensionDiffFile,
  reviewedHunks: readonly ExtensionDiffHunk[],
  tone: ExtensionLineHighlightTone,
): readonly ExtensionLineHighlight[] | null {
  if (reviewedHunks.length === 0) return null;
  const lengths = patchLineLengths(file.patch);
  const marks: ExtensionLineHighlight[] = [];
  const sides = [
    {
      side: "old" as const,
      map: lengths.old,
      span: (h: ExtensionDiffHunk) => h.oldRange,
    },
    {
      side: "new" as const,
      map: lengths.new,
      span: (h: ExtensionDiffHunk) => h.newRange,
    },
  ];
  for (const hunk of reviewedHunks) {
    for (const { side, map, span } of sides) {
      const range = span(hunk);
      if (!range) continue;
      for (let line = range[0]; line <= range[1]; line++) {
        const length = map.get(line);
        if (length !== undefined && length > 0) {
          marks.push({ side, line, range: [0, length], tone });
        }
      }
    }
  }
  return marks.length > 0 ? marks : null;
}
