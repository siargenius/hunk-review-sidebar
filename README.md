# hunk-mark-as-reviewed

A [Hunk](https://hunk.dev) extension for marking your way through a review:
mark hunks and files as reviewed, watch progress in the file list, mute what
you've finished, and hide it when you don't want to see it again.

Reviewed state lives for the session — soft reloads (refresh, watch) keep it,
quitting Hunk discards it. Marks survive reload renumbering: they are keyed by
path + hunk header + line spans, and reconciled whenever the changeset
reloads.

## Install

```sh
hunk extension install evantravers/hunk-mark-as-reviewed
```

Or load it for one run from a checkout:

```sh
hunk diff --extension /path/to/checkout/mark-as-reviewed.tsx
```

## Keys & commands

| Key | Command | What it does |
| --- | --- | --- |
| `x` | `mark-as-reviewed.toggleHunk` | Toggle the current hunk reviewed/unreviewed |
| `X` | `mark-as-reviewed.toggleFile` | Toggle every hunk in the current file (binary/skipped files toggle as a whole) |
| `>` | `mark-as-reviewed.nextUnreviewed` | Jump to the next unreviewed hunk, across files, wrapping |
| `<` | `mark-as-reviewed.prevUnreviewed` | Jump to the previous unreviewed hunk |
| — | `mark-as-reviewed.toggleHideReviewed` | Hide fully-reviewed files from the review |
| — | `mark-as-reviewed.resetReview` | Clear every reviewed mark |

`>`/`<` are the shifted forms of Hunk's own `.`/`,` (next/previous file), so
the mnemonic composes. Every command is rebindable in
`~/.config/hunk/config.toml`:

```toml
[keybindings]
"mark-as-reviewed.nextUnreviewed" = "]"
"mark-as-reviewed.prevUnreviewed" = "["
```

### Prefer `r` / `R`?

`r` ships as Hunk's refresh (`hunk.app.refresh`), and built-ins win default
chords — that's why the defaults are `x`/`X`. To reclaim `r`/`R`, move refresh
and rebind:

```toml
[keybindings]
"hunk.app.refresh" = "ctrl+r"
"mark-as-reviewed.toggleHunk" = "r"
"mark-as-reviewed.toggleFile" = "R"
```

## What you see

- **File list** (replaces the built-in files pane): each row keeps its
  `+adds/-dels` badges and adds a review badge — `(2/7)` while a file is in
  progress, `☑` when every hunk is reviewed, `✓` for hunk-less files marked
  whole. A summary line at the top counts the whole changeset.
- **Diffs**: every line of a reviewed hunk is painted with a full-line
  highlight in the configured tone.
- **Hide reviewed files**: when toggled on, fully-reviewed files are filtered
  out of the changeset on reload (the toggle triggers a refresh for you). If
  everything is reviewed, nothing is hidden — you get a toast instead of an
  empty review.

## Configuration

```toml
[extension.mark-as-reviewed]
# Tone used to paint reviewed hunks.
# One of: "match" | "current" | "info" | "warning" | "error"
reviewedTone = "info"

# Start every session with fully-reviewed files hidden.
hideReviewedFiles = false
```

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit against hunkdiff/extension types
npm test            # node --test over the pure logic (store, nav, highlights)
```

The extension id is `mark-as-reviewed` — it comes from the entry file's stem,
not the repository name, so command ids stay short even though the repo
follows the `hunk-*` convention.

## Roadmap

- A custom file view that renders reviewed hunks dimmed (~50%) with
  user-configurable colors, and can collapse reviewed hunks to a summary row
  ("hide reviewed hunks" within a file).
- Optional cross-session persistence of reviewed state.
