import type { ExtensionReviewReloadControls } from "hunkdiff/extension";

// Lifecycle events replace these controls whenever the review generation changes.
let review: ExtensionReviewReloadControls | null = null;

export function noteReloadControls(next: ExtensionReviewReloadControls): void {
  review = next;
}

export async function refreshReview(): Promise<boolean> {
  return review ? (await review.requestReload()).ok : false;
}
