# Hunk review sidebar

One pane shows files, changes, saved notes, and review progress together in [Hunk](https://www.hunk.dev/).
Requires Hunk 0.24.1 or later (extension API 32).

This is a fork of **[hunk-mark-as-reviewed](https://github.com/evantravers/hunk-mark-as-reviewed)** by **[Evan Travers](https://github.com/evantravers)**, based on v0.2.0.
The original extension provides the marking, dimming, hiding, and unreviewed-navigation features this project builds on.
This fork adds a combined files-and-notes pane, compact thread summaries, and colored change metadata.
This fork is maintained separately from the original extension.

## Use

- `x` marks the selected hunk. `X` marks its file.
- `<` and `>` jump between unreviewed hunks.
- `s` toggles the combined pane through Hunk's normal files-pane command.
- Click a file or hunk to jump to it.
- Click a thread row to reveal its source line. Notes without a range select their file.
- Click Changes or Notes in the pane header to hide or show those rows.
- Click Hide reviewed files to filter completed files and refresh the review.

File rows show change type, additions, deletions, review progress, and note counts (`*2` means two notes).
Each thread appears beneath its hunk as a dot, note count, and latest author, without an order number.
Your replies show `You`. Separate threads keep separate rows, even at the same source line.
Hunk rows show only `@@` range metadata, without trailing code context.
Note previews stay in the main review stream. The file note count precedes addition and deletion counts. Review progress sits at the far right. Zero change counts are omitted.
Addition counts and hunk ranges are green. Deletion counts and hunk ranges are red.
Hunk supplies saved user notes, live agent comments, and sidecar annotations with each visible file.
Note edits and removals appear through the same file props used by Hunk's built-in file list.

The pane replaces the `hunk:files` slot from startup, including before the first reviewed mark.
Clearing marks and refreshing preserve the pane's open preference.
Section preferences survive closing and reopening the pane during the session.
The built-in pane remains available as Hunk's rendering fallback.

## Install

```sh
hunk extension install siargenius/hunk-review-sidebar
```

If you already use the original extension, remove it before installing this fork:

```sh
hunk extension remove hunk-mark-as-reviewed
hunk extension install siargenius/hunk-review-sidebar
```

Both versions bind the same marking keys and replace the files pane. Run one version at a time.
Restart Hunk after installation. Existing sessions keep their loaded extension code.

To try a checkout for one run:

```sh
hunk diff --extension /path/to/hunk-review-sidebar/mark-as-reviewed.tsx
```

## Scope

The list follows Hunk's visible files and their annotations.
Files hidden by filters stay hidden, including their notes.
Drafts and orphaned notes without a visible file do not appear in this list.
The pane shows thread metadata. Note text and rich markup remain in Hunk's main review stream.
Hunk retains note editing and deletion in the main review stream.

Pure renames with no text hunks count as reviewed automatically, including after clearing manual marks.
Renames with text changes, binary changes, and skipped files still need manual review.

Reviewed marks last for the session. Soft reloads preserve marks whose upstream identity still matches.
The installed extension id is `hunk-review-sidebar`. Its settings use `[extension.hunk-review-sidebar]`.
Commands use that prefix too, such as `hunk-review-sidebar.toggleHunk`.
When loading `mark-as-reviewed.tsx` directly from a checkout, the id remains `mark-as-reviewed`.

## Development

```sh
npm ci
npm run typecheck
npm test
npm run test:integration
```

The terminal smoke test uses an isolated configuration, temporary repository, and private pseudoterminal.
It checks initial notes, marking, sidebar toggling, reloads, and live comments.
Set `HUNK_BIN` when Hunk is installed outside `/opt/homebrew/bin/hunk`.
Some npm configurations skip dependency install scripts. On macOS, make node-pty's spawn helper executable before running integration tests.

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for the implementation plan.
Upstream design notes remain in SPEC.md and UPSTREAM-ISSUE.md.

## Optional progress export

The progress bridge writes a local JSON summary for tools that consume review status.
It is disabled by default. To enable it, add this to your Hunk configuration:

```toml
[extension.hunk-review-sidebar]
progressBridge = true
```

The bridge writes to `~/.cache/hunk/review-progress/<pid>.json` and removes the file on normal shutdown.
It does not send data over the network.

## Credits

Original extension: [Evan Travers's hunk-mark-as-reviewed](https://github.com/evantravers/hunk-mark-as-reviewed).
The upstream package declares the MIT license. This fork retains that license declaration and upstream Git history.

Use `HUNK_SMOKE_INSTALLED=1 npm run test:integration` to test discovery through the active user configuration.
