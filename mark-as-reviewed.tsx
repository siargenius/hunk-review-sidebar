import { installReviewBridge } from "./src/review-progress-bridge.ts";
import type {
  ExtensionCommandContext,
  HunkExtensionAPI,
} from "hunkdiff/extension";
import { hideFullyReviewedFiles } from "./src/hide.ts";
import { resolveReviewedTone, reviewedHunkMarks } from "./src/highlights.ts";
import { noteReloadControls } from "./src/host.ts";
import { findUnreviewedHunk } from "./src/nav.ts";
import { ReviewedFilesPane } from "./src/pane.tsx";
import * as store from "./src/store.ts";

const HIGHLIGHTER_ID = "reviewed";

// modem-dev/hunk#909 added the "dim" line-highlight tone at extension
// apiVersion 11 (hunkdiff ≥ 0.21). The published type package still types
// apiVersion as a literal, hence the numeric cast.
const DIM_TONE_API_VERSION = 11;

export default function (hunk: HunkExtensionAPI) {
  const tone = resolveReviewedTone(
    hunk.config.reviewedTone,
    (hunk.apiVersion as number) >= DIM_TONE_API_VERSION,
  );
  store.setHideReviewedFiles(hunk.config.hideReviewedFiles === true);

  const command = hunk.registerCommand.bind(hunk);

  // The most recent (post-transform) changeset lives in the store — a
  // command's selection only names the current file, so walking across file
  // boundaries needs the visible list from the last load event.
  hunk.on("changeset_loaded", ({ changeset }, ctx) => {
    noteReloadControls(ctx.review);
    store.noteFiles(changeset.files);
    const dropped = store.reconcile(changeset.files);
    if (dropped > 0) {
      ctx.notify(
        `${dropped} reviewed ${dropped === 1 ? "mark" : "marks"} no longer match the diff`,
        "warning",
      );
    }
  });
  hunk.on("session_reload", (_event, ctx) => noteReloadControls(ctx.review));

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

  hunk.registerPane({
    id: "review",
    title: "Review",
    replaces: "hunk:files",
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
  if (hunk.config.progressBridge === true) installReviewBridge(hunk, store);

}
