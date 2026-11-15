# Combined review pane

## Goal

Replace the two competing file panes with one pane that shows files, changes, notes, and review progress.
Keep the existing marking keys, dimming, navigation, and progress bridge.

## Implementation

1. Copy the installed extension into a local Git fork. Keep its upstream history and local progress bridge.
2. Register Review as the replacement for `hunk:files`. Remove mark-driven pane switching.
   Let `s` and View → Files pane control visibility, including after reloads or clearing marks.
3. Read notes from `files[].agent.annotations`, the same data supplied to the built-in file list.
   Show note counts, source labels, summaries, and rationale beneath each file.
   Jump to the note range on click, with a file fallback for notes without a range.
   Show files, changes, and notes together by default. Add controls to hide changes or notes.
4. Test note grouping and navigation, sidebar registration, marking, and reload behavior.
   Typecheck against Hunk 0.24.1. Check rendering in an isolated terminal.
5. Keep the original managed installation as a backup. Disable its discovery and load the fork through user configuration.

## Constraints

The pane presents the notes Hunk attaches to visible files. Hidden files remain hidden.
Drafts and orphaned notes without a visible file are outside this list, as in the built-in file list.
The built-in pane remains installed as Hunk's fallback if the custom pane fails.
Reviewed marks keep the upstream session lifetime and reconciliation rules.
