# Hunk review sidebar

A local fork of `evantravers/hunk-mark-as-reviewed` v0.2.0 for Hunk 0.24.1.
One pane shows files, changes, saved notes, and review progress together.

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

## Installation on this machine

The user configuration loads this checkout's `mark-as-reviewed.tsx`.
The original managed installation is retained outside the extension discovery directory as a backup.
Do not install both versions: they use the same `mark-as-reviewed` extension id and marking keys.

To load this checkout for one run in a separate configuration:

```sh
hunk diff --extension /path/to/hunk-review-sidebar/mark-as-reviewed.tsx
```

## Scope

The list follows Hunk's visible files and their annotations.
Files hidden by filters stay hidden, including their notes.
Drafts and orphaned notes without a visible file do not appear in this list.
The pane renders note text. Rich markup remains available in Hunk's main review stream.
Hunk retains note editing and deletion in the main review stream.

Reviewed marks last for the session. Soft reloads preserve marks whose upstream identity still matches.
The original progress bridge remains in place for existing consumers.
The existing `[extension.mark-as-reviewed]` settings and command ids still apply.

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

## Local backup and rollback

`LOCAL-INSTALL.json` records this machine's backup directory and active configuration.
The backup contains the previous config, managed extension, and installation records.
To roll back, restore `config.toml`, copy the backup extension into Hunk's managed install directory,
and restore its entry in `records.json`. Reopen Hunk afterward.

Use `HUNK_SMOKE_INSTALLED=1 npm run test:integration` to test discovery through the active user configuration.
