import type {
  ExtensionCommand,
  ExtensionCommandContext,
  ExtensionCommandHandler,
  ExtensionLineHighlightTone,
  ExtensionPaneControls,
  HunkExtensionAPI,
} from "hunkdiff/extension";
import { hideFullyReviewedFiles } from "./src/hide.ts";
import { reviewedHunkMarks } from "./src/highlights.ts";
import { noteCommandControls } from "./src/host.ts";
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
 * Keep the review tree out of the way until there is progress to track. The
 * first mark opens it (closing the built-in file list so the two never
 * compete for sidebar width, and revealing a hidden sidebar); returning to
 * zero marks closes it and restores the built-in. `s` / View → Files only
 * ever toggles the built-in list — the tree's visibility is mark-driven only.
 */
function syncFilesPane(panes: ExtensionPaneControls): void {
  if (store.getState().reviewed.size > 0) {
    panes.close("hunk:files");
    panes.open("review");
  } else {
    panes.close("review");
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

  // Pane components receive no command controls of their own, so every
  // command registration goes through this wrapper to stash the handler's
  // controls — the pane's hide checkbox refreshes through them (host.ts).
  const command = (
    definition: ExtensionCommand,
    handler: ExtensionCommandHandler,
  ): void =>
    hunk.registerCommand(definition, (ctx) => {
      noteCommandControls(ctx.commands);
      return handler(ctx);
    });

  // The most recent (post-transform) changeset lives in the store — a
  // command's selection only names the current file, so walking across file
  // boundaries needs the visible list from the last load event.
  hunk.on("changeset_loaded", ({ changeset }, ctx) => {
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

  command(
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

  command(
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

  command({ id: "resetReview", title: "Clear all reviewed marks" }, (ctx) => {
    store.resetReviewed();
    syncFilesPane(ctx.panes);
    ctx.highlights.refresh(HIGHLIGHTER_ID);
    ctx.notify("Cleared all reviewed marks");
  });

  // --- Navigation ----------------------------------------------------------

  const goUnreviewed =
    (direction: 1 | -1) => (ctx: ExtensionCommandContext) => {
      const target = findUnreviewedHunk(
        store.getLatestFiles(),
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

  command(
    { id: "nextUnreviewed", title: "Next unreviewed hunk", key: ">" },
    goUnreviewed(1),
  );
  command(
    { id: "prevUnreviewed", title: "Previous unreviewed hunk", key: "<" },
    goUnreviewed(-1),
  );

  // --- Hiding reviewed files -------------------------------------------------

  // No command for the toggle itself: extension menu entries can't show a
  // live check state, so the Review pane carries a clickable "Hide reviewed
  // files" checkbox instead (see src/hide.ts). Only the transform remains
  // here, delegating to the shared hide logic.
  hunk.transformChangeset((changeset, ctx) =>
    hideFullyReviewedFiles(changeset, (message) => ctx.notify(message)),
  );

  // --- Presentation ----------------------------------------------------------

  // A standalone pane, deliberately NOT `replaces: "hunk:files"`: the host's
  // files-slot toggle falls back to the replacement key whenever nothing is
  // open, so a replacement stays reachable via `s` even with zero marks. As
  // our own pane, `s` never touches us — visibility is purely mark-driven
  // through syncFilesPane.
  hunk.registerPane({
    id: "review",
    title: "Review",
    component: ReviewedFilesPane,
  });

  hunk.registerLineHighlighter({
    id: HIGHLIGHTER_ID,
    highlight({ file }) {
      const reviewed = store
        .hunksFor(file)
        .filter((candidate) => store.isHunkReviewed(file.path, candidate));
      return reviewedHunkMarks(file, reviewed, tone);
    },
  });
}
