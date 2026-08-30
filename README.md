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

- **Review pane** (a file/hunk tree that swaps places with the built-in
  file list once you start marking): every file expands into its hunks. File
  rows keep their `+adds/-dels` badges and add a review badge — `(2/7)`
  while a file is in progress, `☑` when every hunk is reviewed, `✓` for
  hunk-less files marked whole. Hunk rows show the `@@` header and turn muted
  with a `✓` once reviewed. A summary line at the top counts the whole
  changeset and flags when reviewed files are being hidden. Until the first
  hunk is marked — and again once every mark is cleared — only the plain
  built-in file list is around, and `s` / View → Files toggles it alone; the
  tree's visibility is driven purely by your marks.
- **Click to jump, `x` to mark**: clicking a file or hunk row jumps the
  review stream to it, so the usual `x`/`X` toggles then mark exactly what
  you clicked.
- **Diffs**: reviewed hunks are *dimmed* — the text recedes toward its
  background while syntax-highlighting hues stay intact (Hunk ≥ 0.21,
  extension apiVersion 11). On older Hunk versions they get the original
  full-line background highlight in the configured tone instead.
- **Hide reviewed files**: the Review pane has a clickable `☐ Hide reviewed
  files` checkbox under its header. While it's checked, fully-reviewed files
  are filtered out of the changeset (the click triggers a refresh for you).
  If everything is reviewed, nothing is hidden — you get a toast instead of
  an empty review. The checkbox lives in the pane rather than the Extensions
  menu because extension menu entries can't show a live check state (Hunk
  renders `[x]` only for its own built-in menu items).

## Configuration

```toml
[extension.mark-as-reviewed]
# Tone used to paint reviewed hunks. "dim" fades the text itself toward
# the background (Hunk ≥ 0.21); the rest are background-highlight tones.
# One of: "dim" | "match" | "current" | "info" | "warning" | "error"
# Default: "dim" where supported, "info" on older Hunk versions.
# reviewedTone = "dim"

# Start every session with fully-reviewed files hidden.
hideReviewedFiles = false
```

Setting any classic tone (`"info"`, `"warning"`, …) forces the v1
background-highlight look even on new Hunk versions; setting `"dim"` on an
old Hunk version safely degrades to `"info"`.

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

- A custom file view that can collapse reviewed hunks to a summary row
  ("hide reviewed hunks" within a file). True dimming shipped in 0.2.0 via
  Hunk's `"dim"` line-highlight tone.
- Optional cross-session persistence of reviewed state.
