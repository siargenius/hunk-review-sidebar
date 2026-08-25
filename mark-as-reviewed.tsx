import type {
  ExtensionCommandContext,
  ExtensionDiffFile,
  ExtensionLineHighlightTone,
  ExtensionPaneControls,
  HunkExtensionAPI,
} from "hunkdiff/extension";
import { reviewedHunkMarks } from "./src/highlights.ts";
import { findUnreviewedHunk } from "./src/nav.ts";
import { ReviewedFilesPane } from "./src/pane.tsx";
import * as store from "./src/store.ts";

const TONES: readonly ExtensionLineHighlightTone[] = [
  "match",
  "current",
  "info",
  "warning",
  "error",
];
const HIGHLIGHTER_ID = "reviewed";

/**
 * Keep the file-tree pane out of the way until there is progress to track.
 * Our pane replaces the `hunk:files` slot whenever it is open, so the swap is
 * just open/close: the first mark opens ours (revealing a hidden sidebar
 * too), and returning to zero marks hands the slot back to the built-in.
 */
function syncFilesPane(panes: ExtensionPaneControls): void {
  if (store.getState().reviewed.size > 0) {
    panes.open("files");
  } else {
    panes.close("files");
    panes.open("hunk:files");
  }
}

export default function (hunk: HunkExtensionAPI) {
  const configuredTone = hunk.config.reviewedTone;
  const tone: ExtensionLineHighlightTone = TONES.includes(
    configuredTone as ExtensionLineHighlightTone,
  )
    ? (configuredTone as ExtensionLineHighlightTone)
    : "info";
  store.setHideReviewedFiles(hunk.config.hideReviewedFiles === true);

  // The most recent (post-transform) changeset's files, for the navigation
  // commands — a command's selection only names the current file, so walking
  // across file boundaries needs the visible list from the last load event.
  let latestFiles: readonly ExtensionDiffFile[] = [];

  hunk.on("changeset_loaded", ({ changeset }, ctx) => {
    latestFiles = changeset.files;
    store.noteFiles(changeset.files);
    const dropped = store.reconcile(changeset.files);
    if (dropped > 0) {
      ctx.notify(
        `${dropped} reviewed ${dropped === 1 ? "mark" : "marks"} no longer match the diff`,
        "warning",
      );
    }
    // Marks survive soft reloads, so this also restores the tree after one.
    syncFilesPane(ctx.panes);
  });

  // --- Marking -----------------------------------------------------------

  hunk.registerCommand(
    { id: "toggleHunk", title: "Toggle hunk reviewed", key: "x" },
    (ctx) => {
      const { file, hunkIndex } = ctx.selection;
      const hunk0 = file?.hunks?.find(
        (candidate) => candidate.index === hunkIndex,
      );
      if (!file || !hunk0) {
        ctx.notify("No hunk selected", "warning");
        return;
      }
      const reviewed = store.toggleHunk(file.path, hunk0);
      syncFilesPane(ctx.panes);
      ctx.highlights.refresh(HIGHLIGHTER_ID, { fileId: file.id });
      const progress = store.fileProgress(file);
      ctx.notify(
        `${reviewed ? "Hunk reviewed" : "Hunk unreviewed"} (${progress.reviewed}/${progress.total} in ${file.path})`,
      );
    },
  );

  hunk.registerCommand(
    { id: "toggleFile", title: "Toggle file reviewed", key: "X" },
    (ctx) => {
      const { file } = ctx.selection;
      if (!file) {
        ctx.notify("No file selected", "warning");
        return;
      }
      const reviewed = store.toggleFile(file);
      syncFilesPane(ctx.panes);
      ctx.highlights.refresh(HIGHLIGHTER_ID, { fileId: file.id });
      ctx.notify(
        reviewed
          ? `File reviewed: ${file.path}`
          : `File unreviewed: ${file.path}`,
      );
    },
  );

  hunk.registerCommand(
    { id: "resetReview", title: "Clear all reviewed marks" },
    (ctx) => {
      store.resetReviewed();
      syncFilesPane(ctx.panes);
      ctx.highlights.refresh(HIGHLIGHTER_ID);
      ctx.notify("Cleared all reviewed marks");
    },
  );

  // --- Navigation ----------------------------------------------------------

  const goUnreviewed =
    (direction: 1 | -1) => (ctx: ExtensionCommandContext) => {
      const target = findUnreviewedHunk(
        latestFiles,
        {
          fileId: ctx.selection.file?.id ?? null,
          hunkIndex: ctx.selection.hunkIndex,
        },
        direction,
        store.isHunkReviewed,
      );
      if (!target) {
        ctx.notify("All hunks reviewed 🎉");
        return;
      }
      ctx.navigation.selectHunk(target.fileId, target.hunkIndex);
    };

  hunk.registerCommand(
    { id: "nextUnreviewed", title: "Next unreviewed hunk", key: ">" },
    goUnreviewed(1),
  );
  hunk.registerCommand(
    { id: "prevUnreviewed", title: "Previous unreviewed hunk", key: "<" },
    goUnreviewed(-1),
  );

  // --- Hiding reviewed files -------------------------------------------------

  hunk.transformChangeset((changeset, ctx) => {
    if (!store.getState().hideReviewedFiles) return changeset;
    const kept = changeset.files.filter(
      (file) => !store.isPathFullyReviewed(file.path),
    );
    const hidden = changeset.files.length - kept.length;
    if (hidden === 0) return changeset;
    if (kept.length === 0) {
      ctx.notify("All files reviewed — nothing hidden");
      return changeset;
    }
    ctx.notify(`Hid ${hidden} reviewed ${hidden === 1 ? "file" : "files"}`);
    return { ...changeset, files: kept };
  });

  hunk.registerCommand(
    // State-neutral title: command titles are fixed at registration, so the
    // menu entry can't flip to "Show reviewed files" while hiding is active —
    // the files pane header carries that state instead.
    { id: "toggleHideReviewed", title: "Toggle reviewed files visibility" },
    (ctx) => {
      const hide = !store.getState().hideReviewedFiles;
      store.setHideReviewedFiles(hide);
      ctx.notify(
        hide ? "Hiding fully-reviewed files" : "Showing reviewed files",
      );
      ctx.commands.execute("hunk.app.refresh");
    },
  );

  // --- Presentation ----------------------------------------------------------

  hunk.registerPane({
    id: "files",
    title: "Files",
    replaces: "hunk:files",
    component: ReviewedFilesPane,
  });

  hunk.registerLineHighlighter({
    id: HIGHLIGHTER_ID,
    highlight({ file }) {
      const hunks = file.hunks ?? store.knownHunksFor(file.path);
      const reviewed = hunks.filter((candidate) =>
        store.isHunkReviewed(file.path, candidate),
      );
      return reviewedHunkMarks(file, reviewed, tone);
    },
  });
}
