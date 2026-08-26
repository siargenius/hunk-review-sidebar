import type { ExtensionChangeset } from "hunkdiff/extension";
import { executeHostCommand } from "./host.ts";
import {
 getState,
 isPathFullyReviewed,
 setHideReviewedFiles,
} from "./store.ts";

type Notify = (message: string) => void;

/**
 * Hiding fully-reviewed files, shared by the changeset transform below and
 * the Review pane's checkbox row. There is deliberately no command for the
 * toggle: extension menu entries can't show a live check state (the host
 * renders `[x]` only for its own built-in menu specs, and command titles
 * are frozen at registration), so the pane's clickable checkbox is the one
 * place the mode is both shown and flipped.
 */

// Transforms re-run on every refresh, so only toast when the hidden count
// actually changes — otherwise the same notice repeats endlessly.
let lastHidden = 0;

/** Changeset transform dropping fully-reviewed files while hiding is on. */
export function hideFullyReviewedFiles(
 changeset: ExtensionChangeset,
 notify: Notify,
): ExtensionChangeset {
 if (!getState().hideReviewedFiles) return changeset;
 const kept = changeset.files.filter((file) => !isPathFullyReviewed(file.path));
 const hidden = changeset.files.length - kept.length;
 const changed = hidden !== lastHidden;
 lastHidden = hidden;
 if (hidden === 0) return changeset;
 if (kept.length === 0) {
  if (changed) notify("All files reviewed — nothing hidden");
  return changeset;
 }
 if (changed)
  notify(`Hid ${hidden} reviewed ${hidden === 1 ? "file" : "files"}`);
 return { ...changeset, files: kept };
}

/**
 * Flip the mode from the pane's checkbox row: store the new flag, re-arm
 * the transform's toast for the new mode, and refresh so the transform
 * re-runs. The pane's own store subscription redraws the checkbox.
 */
export function toggleHideReviewedFiles(notify: Notify): void {
 const hide = !getState().hideReviewedFiles;
 setHideReviewedFiles(hide);
 lastHidden = 0;
 notify(hide ? "Hiding fully-reviewed files" : "Showing reviewed files");
 executeHostCommand("hunk.app.refresh");
}
