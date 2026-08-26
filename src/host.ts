import type { ExtensionCommandControls } from "hunkdiff/extension";

/**
 * The most recent command handler's host-command controls, stashed for
 * surfaces that receive none of their own — pane components get only
 * navigation and notify in their props. The controls object is
 * session-scoped: the host resolves commands through a live ref and the
 * capability lease outlives the handler call, so the latest stash can keep
 * executing public `hunk.*` commands (e.g. refreshing after the pane's
 * "hide reviewed files" checkbox flips). After an extension reload the
 * stale lease fails closed — `execute` simply returns false.
 */
let controls: ExtensionCommandControls | null = null;

export function noteCommandControls(next: ExtensionCommandControls): void {
 controls = next;
}

/** Run one public `hunk.*` command; false when nothing live is stashed. */
export function executeHostCommand(commandId: string): boolean {
 return controls?.execute(commandId) ?? false;
}
