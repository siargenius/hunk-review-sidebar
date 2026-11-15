import type { ExtensionDiffFile, ExtensionDiffHunk } from "hunkdiff/extension";

/**
 * Review-progress state for the session.
 *
 * Lives at module scope (survives soft reloads and pane unmounts) and is
 * bridged into React via `useSyncExternalStore`: every mutation replaces the
 * state object so subscribers see a new reference.
 *
 * Marks are keyed by identity, not by file id or hunk index — both renumber
 * on reload. A hunk key is path + `@@` header + old/new spans; a hunk-less
 * file (binary, skipped) gets a path-only file key.
 */

export interface ReviewStoreState {
 readonly reviewed: ReadonlySet<string>;
 readonly hideReviewedFiles: boolean;
 readonly showChanges: boolean;
 readonly showNotes: boolean;
}

const FILE_PREFIX = "file";
const HUNK_PREFIX = "hunk";

let state: ReviewStoreState = {
 reviewed: new Set<string>(),
 hideReviewedFiles: false,
 showChanges: true,
 showNotes: true,
};

/**
 * Hunk summaries from the most recent `changeset_loaded`, keyed by path.
 * Transform callbacks receive files without `hunks` (they are derived at the
 * read-only boundary), so "is this path fully reviewed" during a transform
 * has to be answered from the last event payload instead.
 */
let knownHunks: ReadonlyMap<string, readonly ExtensionDiffHunk[]> = new Map();

/** Files of the most recent `changeset_loaded`, for cross-file navigation. */
let latestFiles: readonly ExtensionDiffFile[] = [];

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
 listeners.add(listener);
 return () => {
  listeners.delete(listener);
 };
}

export function getState(): ReviewStoreState {
 return state;
}

export function toggleSection(section: "showChanges" | "showNotes"): void {
 setState({ ...state, [section]: !state[section] });
}

function setState(next: ReviewStoreState): void {
 state = next;
 for (const listener of listeners) listener();
}

export function hunkKey(path: string, hunk: ExtensionDiffHunk): string {
 const oldSpan = hunk.oldRange
  ? `${hunk.oldRange[0]}-${hunk.oldRange[1]}`
  : "?";
 const newSpan = hunk.newRange
  ? `${hunk.newRange[0]}-${hunk.newRange[1]}`
  : "?";
 return [HUNK_PREFIX, path, hunk.header, oldSpan, newSpan].join("\0");
}

export function fileKey(path: string): string {
 return [FILE_PREFIX, path].join("\0");
}

/** True for path-only file marks (as opposed to hunk marks). */
function isFileKey(key: string): boolean {
 return key.startsWith(`${FILE_PREFIX}\0`);
}

/** Read the path back out of a mark key. */
function keyPath(key: string): string {
 const rest = key.slice(key.indexOf("\0") + 1);
 return isFileKey(key) ? rest : rest.slice(0, rest.indexOf("\0"));
}

export function isHunkReviewed(path: string, hunk: ExtensionDiffHunk): boolean {
 return state.reviewed.has(hunkKey(path, hunk));
}

export interface FileProgress {
 readonly reviewed: number;
 readonly total: number;
 /** True when a hunk-less file was marked reviewed as a whole. */
 readonly fileReviewed: boolean;
}

/**
 * Hunk summaries for a file, falling back to the last `noteFiles` record for
 * surfaces handed files without `hunks` (transforms, some commands).
 */
export function hunksFor(
 file: ExtensionDiffFile,
): readonly ExtensionDiffHunk[] {
 return file.hunks ?? knownHunks.get(file.path) ?? [];
}

export function fileProgress(file: ExtensionDiffFile): FileProgress {
 const hunks = hunksFor(file);
 if (hunks.length === 0) {
  return {
   reviewed: 0,
   total: 0,
   fileReviewed: state.reviewed.has(fileKey(file.path)),
  };
 }
 let reviewed = 0;
 for (const hunk of hunks) {
  if (state.reviewed.has(hunkKey(file.path, hunk))) reviewed++;
 }
 return { reviewed, total: hunks.length, fileReviewed: false };
}

export function isFileFullyReviewed(file: ExtensionDiffFile): boolean {
 const progress = fileProgress(file);
 if (progress.total === 0) return progress.fileReviewed;
 return progress.reviewed === progress.total;
}

/**
 * Full-review check usable where only a path is known (changeset transforms,
 * where files carry no `hunks`). Falls back to the last `noteFiles` record.
 */
export function isPathFullyReviewed(path: string): boolean {
 const hunks = knownHunks.get(path);
 if (!hunks || hunks.length === 0) return state.reviewed.has(fileKey(path));
 return hunks.every((hunk) => state.reviewed.has(hunkKey(path, hunk)));
}

/** Toggle one hunk's mark. Returns the new reviewed flag. */
export function toggleHunk(path: string, hunk: ExtensionDiffHunk): boolean {
 const key = hunkKey(path, hunk);
 const next = new Set(state.reviewed);
 const nowReviewed = !next.has(key);
 if (nowReviewed) next.add(key);
 else next.delete(key);
 setState({ ...state, reviewed: next });
 return nowReviewed;
}

/**
 * Toggle a whole file: unmark everything when fully reviewed, mark everything
 * otherwise. Hunk-less files toggle their path-only file key. Returns the new
 * reviewed flag.
 */
export function toggleFile(file: ExtensionDiffFile): boolean {
 const hunks = hunksFor(file);
 const next = new Set(state.reviewed);
 const fullyReviewed = isFileFullyReviewed(file);
 if (hunks.length === 0) {
  const key = fileKey(file.path);
  if (fullyReviewed) next.delete(key);
  else next.add(key);
 } else {
  for (const hunk of hunks) {
   const key = hunkKey(file.path, hunk);
   if (fullyReviewed) next.delete(key);
   else next.add(key);
  }
 }
 setState({ ...state, reviewed: next });
 return !fullyReviewed;
}

export function resetReviewed(): void {
 if (state.reviewed.size === 0) return;
 setState({ ...state, reviewed: new Set<string>() });
}

export function setHideReviewedFiles(hide: boolean): void {
 if (state.hideReviewedFiles === hide) return;
 setState({ ...state, hideReviewedFiles: hide });
}

/** Record the file list of a freshly loaded changeset. */
export function noteFiles(files: readonly ExtensionDiffFile[]): void {
 latestFiles = files;
 knownHunks = new Map(files.map((file) => [file.path, file.hunks ?? []]));
}

/** Files of the most recent `changeset_loaded` (post-transform). */
export function getLatestFiles(): readonly ExtensionDiffFile[] {
 return latestFiles;
}

/**
 * Drop marks that no longer match the loaded changeset. Marks for a present
 * path must match a live hunk key. Marks for an absent path are kept while
 * `hideReviewedFiles` is on (the file may merely be filtered out by our own
 * transform) and dropped otherwise. Returns the number of dropped marks.
 */
export function reconcile(files: readonly ExtensionDiffFile[]): number {
 const liveKeysByPath = new Map<string, Set<string>>();
 for (const file of files) {
  const keys = new Set<string>();
  for (const hunk of file.hunks ?? []) keys.add(hunkKey(file.path, hunk));
  liveKeysByPath.set(file.path, keys);
 }
 let dropped = 0;
 const next = new Set<string>();
 for (const key of state.reviewed) {
  const live = liveKeysByPath.get(keyPath(key));
  // Absent path: keep while our own transform may be filtering the file out.
  const keep = live ? isFileKey(key) || live.has(key) : state.hideReviewedFiles;
  if (keep) next.add(key);
  else dropped++;
 }
 if (dropped > 0) setState({ ...state, reviewed: next });
 return dropped;
}

/** Aggregate progress across a file list, for summary rows and toasts. */
export function totalProgress(files: readonly ExtensionDiffFile[]): {
 reviewed: number;
 total: number;
} {
 let reviewed = 0;
 let total = 0;
 for (const file of files) {
  const progress = fileProgress(file);
  if (progress.total === 0) {
   total++;
   if (progress.fileReviewed) reviewed++;
  } else {
   total += progress.total;
   reviewed += progress.reviewed;
  }
 }
 return { reviewed, total };
}
