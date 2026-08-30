# mark-as-reviewed — Hunk extension spec

A Hunk extension that lets you mark hunks (and whole files) as reviewed while
working through a diff, see review progress in the file list, visually mute
reviewed hunks, and optionally hide them.

Target API: `hunkdiff/extension` **apiVersion 8** (Hunk ≥ 0.19), with an
opportunistic branch on **apiVersion 11** (Hunk ≥ 0.21) for the `"dim"`
line-highlight tone (§5).

---

## 1. Feature breakdown & API mapping

| # | Feature | API surface |
| --- | --------- | ------------- |
| 1 | `r` toggles current hunk reviewed/unreviewed | `hunk.registerCommand` + `ctx.selection` |
| 2 | `R` toggles all hunks in current file | `hunk.registerCommand` + `ctx.selection` |
| 3 | Next / Previous Unreviewed Hunk commands (bindable, no default key) | `hunk.registerCommand` (no `key`) + `ctx.navigation.selectHunk` / `selectFile` |
| 4 | Review pane (file tree) shows `(n/total)` per file (`☑` when complete) and per-hunk `✓` rows that jump on click; visible only while marks exist | `hunk.registerPane` (standalone pane) + `ctx.panes` open/close + `props.actions.selectHunk` |
| 5 | Reviewed hunks get a visual style in the diff | MVP: `hunk.registerLineHighlighter`. Stretch: `hunk.registerFileView` (true dimming) |
| 6 | View option: Hide Reviewed Files (and later Hunks) | Pane checkbox row + `hunk.transformChangeset` + stashed `ctx.commands.execute("hunk.app.refresh")` |

### Hard constraints discovered (these shape the design)

1. **`r` is already taken.** `hunk.app.refresh` ships bound to `r`. Extension
   default chords lose to built-ins (the command still works from the
   Extensions menu and stays bindable). `R` is free. See §3 for the plan.
2. **The built-in file list cannot be decorated.** Progress badges require
   replacing the `hunk:files` pane slot with our own pane. Hunk's own files
   pane is a bundled extension on the same API, so this is a supported,
   dogfooded path — but we re-implement the list rows ourselves (grouping,
   stat badges, scroll-follow are on us; the docs give the exact recipe).
3. **Menu entries are "not contributable yet" — and can't show state.** "Hide
   Reviewed" cannot be a literal View-menu item, and while every registered
   command automatically appears in the **Extensions** menu, extension menu
   entries get no `checked` flag (the host renders `[x]`/`[ ]` only for its
   own built-in menu specs) and command titles are frozen at registration.
   So the toggle is not a command at all: it lives in the Review pane as a
   clickable `☐ Hide reviewed files` checkbox row that both shows and flips
   the mode. Trade-off: no menu entry and nothing to keybind.
4. **Hunks can't be filtered out of a file.** `transformChangeset` can
   filter/reorder *files*; hunks live in the opaque `metadata` blob and must
   pass through untouched. "Hide reviewed *hunks*" is only achievable via a
   custom file view (stretch goal) — or approximated by
   next-unreviewed-hunk navigation.
5. **Line highlighters paint background tints from a fixed tone palette**
   (`match`, `current`, `info`, `warning`, `error`) — they cannot dim text to
   50%. **Superseded in 0.2.0:** modem-dev/hunk#909 added a `"dim"` tone
   (extension apiVersion 11, hunkdiff ≥ 0.21) that recedes text toward its
   background while preserving token hues. We use it when the host's
   `hunk.apiVersion ≥ 11` and fall back to the background tones below it;
   a custom file view remains the stretch path only for *collapsing* hunks.
6. **Themes have a fixed token set**; an extension cannot add a "reviewed"
   theme token. User theming of the reviewed style goes through
   `[extension.mark-as-reviewed]` config keys (§6).
7. **File ids renumber on reload.** Durable review state must be keyed by
   `path` + hunk identity (header/line spans), reconciled on
   `changeset_loaded`. Module state survives soft reloads.

---

## 2. State model

Module-level store (survives reloads, bridged into React via
`useSyncExternalStore` with immutable snapshots — the documented pattern):

```ts
// Hunk identity: path + @@ header + old/new spans.
// Index is NOT stable across reloads; header+spans survive renumbering.
type HunkKey = string; // `${path}\0${header}\0${oldStart}-${oldEnd}\0${newStart}-${newEnd}`

interface ReviewState {
  reviewed: ReadonlySet<HunkKey>;
  hideReviewedFiles: boolean;
}
```

- On `changeset_loaded` / `session_reload`: reconcile — drop keys whose
  `(path, header, spans)` no longer exists, notify if the diff changed under
  us (e.g. "3 reviewed hunks no longer match the diff").
- Files with no hunks (binary, pure rename): `X` marks the file itself
  (path-only key) so the file list can still show it as done.

**Persistence: in-session only (locked decision).** State lives in module
memory; soft reloads keep it, quitting Hunk discards it. A future v2 could
persist JSON under `~/.config/hunk/` keyed by repo + changeset hash.

---

## 3. Commands & keybindings

Extension id: **`mark-as-reviewed`** (locked decision — repo stays
`hunk-mark-as-reviewed`; see §8 for how the id is decoupled from the repo
name).

| Command id | Title (Extensions menu) | Default key |
| --- | --- | --- |
| `mark-as-reviewed.toggleHunk` | Toggle hunk reviewed | `x` |
| `mark-as-reviewed.toggleFile` | Toggle file reviewed | `X` |
| `mark-as-reviewed.nextUnreviewed` | Next unreviewed hunk | `>` |
| `mark-as-reviewed.prevUnreviewed` | Previous unreviewed hunk | `<` |
| `mark-as-reviewed.resetReview` | Clear all reviewed marks | *(none)* |

**Defaults are `x` / `X` (locked decision).** Both are conflict-free against
the built-in table (`r` is taken by `hunk.app.refresh`; built-ins win
default-chord conflicts, so shipping `r` would just produce a startup
warning). Users who prefer `r`/`R` get a documented remap for
`~/.config/hunk/config.toml`:

```toml
[keybindings]
"hunk.app.refresh" = "ctrl+r"                     # move refresh off r
"mark-as-reviewed.toggleHunk" = "r"
"mark-as-reviewed.toggleFile" = "R"
```

Behavior details:

- `toggleHunk` toggles the hunk under `ctx.selection.hunkIndex`; notifies
  "Hunk reviewed (3/7 in file)" / "Hunk unreviewed". No-op with a warning
  toast if no hunk is selected.
- `toggleFile` marks all hunks in `selection.file`; if already fully
  reviewed, unmarks all (**toggle semantics — locked decision**: pressing
  again un-reviews; no separate unmark command).
- Navigation commands walk hunks in render order, crossing file boundaries,
  wrapping at the ends, skipping reviewed hunks. If everything is reviewed:
  notify "All hunks reviewed 🎉". When `hideReviewedFiles` is active they
  also skip hidden files (only visible ids are navigable).

---

## 4. Review pane (progress tree)

A standalone pane (id `review`, **not** `replaces: "hunk:files"`) — the
host's files-slot toggle falls back to the replacement key whenever nothing
is open, so a replacement stays reachable via `s` even with zero marks. As a
standalone pane, `s` / View → Files only ever toggles the built-in list, and
the tree's visibility is purely mark-driven: the first mark opens it (and
closes `hunk:files` so the two never compete for sidebar width); zero marks
closes it and restores the built-in. Synced after every mutation
(`toggleHunk`, `toggleFile`, `resetReview`) and on `changeset_loaded`, which
also restores the tree after a soft reload since marks survive it.

Row rendering — **file/hunk tree**, keeping the built-in's `+adds/-dels`
stat badges and appending the review badge, with one clickable sub-row per
hunk:

```
src/app.ts       +40 -12  (2/7)
  1. @@ -10,7 +10,9 @@ renderRow()      ✓
  2. @@ -40,6 +42,8 @@ main()
src/util.ts      +10  -3   ☑
assets/logo.png            ✓   ← no hunks, marked via X
```

Clicking a hunk row calls `actions.selectHunk(file.id, hunk.index)`, so the
global `x`/`X` toggles then act on exactly what was clicked. The selected
file/hunk row follows `props.selectedFileId` / `props.selectedHunkIndex`
(scroll-follow included). The header row counts the whole changeset; beneath
it sits the `☐ Hide reviewed files` checkbox row (§1.3 explains why the
pane, not a menu command, carries this toggle). Clicking it flips
`hideReviewedFiles` and refreshes through stashed command controls (§7).

- Stat badges mirror the built-in pane (`+${additions} -${deletions}` in
  the theme's add/remove colors, honoring `statsTruncated`).
- `(n/total)` in a muted theme color; `☑` (U+2611) in green/accent when
  `n === total` and total > 0.
- Selected row highlighted with `theme.accent`; click row →
  `actions.selectFile(file.id)`; per-hunk sub-rows are **not** in v1 (keeps
  the pane close to the built-in).
- Scroll-follow via `scrollbox` ref + `scrollChildIntoView`, per the docs'
  recipe.
- Component reads review state via `useSyncExternalStore` against the
  module store (state lives outside React; pane can unmount freely).

Accepted trade-off (locked): we re-implement what the built-in files pane
does; grouping/tree view and windowing are out of v1. The built-in pane is
the reference implementation on the identical prop/ref contract if parity
features are wanted later.

---

## 5. Reviewed-hunk styling

### v1 (MVP): line highlighter with background tone

`hunk.registerLineHighlighter({ id: "reviewed", ... })` marks every line of
every reviewed hunk (full-line character ranges, `side: "new"` + context
lines on both sides as addressed) with a configurable **tone**
(default `"info"`). After any toggle, the handler calls
`ctx.highlights.refresh("reviewed")` (optionally `{ fileId }`-scoped).

This gives a visible "done" background band, not a 50% dim — that's the
palette's ceiling.

### v1.1 (shipped in 0.2.0): `"dim"` tone with version fallback

modem-dev/hunk#909 added a `"dim"` tone at extension apiVersion 11
(hunkdiff ≥ 0.21): the host blends each syntax token's foreground toward
the line's effective background with a minimum-contrast floor — true
dimming through the same mark delivery mechanism, no custom file view
needed. The entry resolves the tone at load: `hunk.apiVersion ≥ 11`
defaults to `"dim"`, older hosts keep `"info"`; an explicit `reviewedTone`
config always wins (a configured `"dim"` on an old host degrades to
`"info"`). The published type package predates the tone, so `"dim"` rides
as a local `ReviewedTone` union extension with narrowing casts until
devDependencies can track hunkdiff ≥ 0.21.

### v2 (stretch): custom file view for collapsing hunks

A `registerFileView` implementation that renders the raw diff itself,
unlocking "hide reviewed hunks" (collapse them to a one-line summary row,
subject to the `hunkRows` one-entry-per-parsed-hunk contract). True dimming
no longer needs it (§ v1.1).

**Theming commitment:** the tone is user-configurable; document the
config knob and the future file view in the README.

---

## 6. Configuration

```toml
[extension.mark-as-reviewed]
# Tone used by the line highlighter for reviewed hunks. "dim" needs
# Hunk ≥ 0.21 (apiVersion 11) and degrades to "info" below it.
# One of: "dim" | "match" | "current" | "info" | "warning" | "error"
# Default: "dim" where supported, "info" otherwise.
# reviewedTone = "dim"

# Start sessions with reviewed files hidden.
hideReviewedFiles = false
```

Per Hunk's rules, repo-level `.hunk/config.toml` can also set these —
fine here (no exec-adjacent values).

---

## 7. "Hide Reviewed" toggle

- The pane's checkbox row calls `toggleHideReviewedFiles` (src/hide.ts):
  flip the store flag, re-arm the transform's toast, toast the new mode via
  `props.actions.notify`, then refresh so `transformChangeset` re-runs and
  filters out fully-reviewed files.
- Pane components receive no command controls, so the refresh runs through
  the most recent command handler's stashed `ctx.commands` (src/host.ts).
  The stash is session-scoped — the pane is only ever open after a marking
  command has run, so live controls are always available; a stale lease
  after an extension reload fails closed (`execute` returns false).
- Guard: if filtering would hide **every** file, keep the changeset intact
  and notify instead (avoids a dead empty review).
- Reviewed state survives the reload (keyed by path+hunk identity, §2).
- "Hide reviewed hunks" within a file is deferred to the v2 file view (§5);
  v1's answer is the next-unreviewed navigation commands.
- No command/menu entry at all: extension menu entries can't show a check
  state (§1.3). Trade-off: the toggle is mouse-only, with nothing to keybind.

---

## 8. Project layout

**Id decoupled from repo name (locked decision).** The repo stays
`hunk-mark-as-reviewed` (matching the `hunk-*` community convention), but
the extension id must be `mark-as-reviewed`. Verified against
`docs/extensions.md` in the Hunk repo: a folder extension with a
single-entry manifest takes the *folder* name (which under
`hunk extension install` is the repo name), and there is no manifest field
for an explicit id — but a **plain file** extension's id is its *file
stem*. So the entry point is a file named `mark-as-reviewed.tsx` at the
repo root, with **no** `hunk.extensions` manifest and **no** `index.*`
file; the repo directory is then scanned as a directory of extensions and
the entry loads with id `mark-as-reviewed` regardless of the folder it
lives in. `package.json` keeps `"hunk": {"apiVersion": 8}` (no
`extensions` key) so old Hunks still refuse the install cleanly.

```
hunk-mark-as-reviewed/          (repo; id comes from the entry file stem)
  mark-as-reviewed.tsx  # entry: factory registering commands, pane, highlighter, transform
  package.json          # {"hunk": {"apiVersion": 8}} — NO hunk.extensions key
  tsconfig.json         # jsx: react-jsx, jsxImportSource: @opentui/react
  src/
    store.ts            # review-state store + hunk-key derivation + reconcile
    pane.tsx            # file-list pane component
    nav.ts              # next/prev unreviewed logic (pure, unit-testable)
  test/                 # bun test coverage for store/nav
  README.md
```

Implementation-time verifications for this layout (fall back to accepting
the `hunk-mark-as-reviewed` id + updated docs if either fails):

1. `hunk extension install <path>` accepts a repo whose extension is a
   bare top-level `*.tsx` (no manifest, no `index.*`) — the install docs'
   "verifies it contains an extension" step.
2. The entry's relative imports (`./src/store.ts`) resolve when loaded as
   a plain file extension.
3. No `index.*` file anywhere one level down (e.g. `src/index.ts`), which
   would be picked up as a separate folder extension.

- `dependencies`: none at runtime. `devDependencies`: `hunkdiff`, `react`,
  `@types/react`, `@opentui/core`, `@opentui/react` (types only — **never
  ship React**, the host serves its own).

## 9. Verification plan

1. `tsc --noEmit` typecheck against `hunkdiff/extension` types.
2. `bun test` for `store.ts`/`nav.ts` (key derivation, reconcile, wrap
   navigation, toggle semantics).
3. Manual: `hunk diff --extension ./src/index.tsx` (immediate load, no
   trust prompt) in a repo with a multi-file diff; check footer toasts and
   startup warnings.
4. Triage with `--no-extensions` if anything misbehaves.

## 10. Milestones

- **M1 — core state + commands:** store, `r`/`R` toggles, next/prev
  unreviewed, toasts. (No UI yet.)
- **M2 — file-list pane** with `(n/total)` / `☑` badges replacing
  `hunk:files`.
- **M3 — line highlighter** for reviewed hunks + config knob.
- **M4 — hide-reviewed-files** toggle via transform + refresh.
- **M5 (stretch) — custom file view:** collapse reviewed hunks to a summary
  row. (The 50%-dim goal shipped in 0.2.0 via the upstream `"dim"` tone.)
  Separable follow-up release.

## Decisions (locked)

1. **Keys:** conflict-free defaults `x` (toggle hunk) / `X` (toggle file);
   `r`/`R` documented as a user remap (requires moving `hunk.app.refresh`).
2. **Persistence:** in-session only; nothing written to disk in v1.
3. **Naming:** repo stays `hunk-mark-as-reviewed`; extension id is
   `mark-as-reviewed` via a root-level `mark-as-reviewed.tsx` entry file
   and no `hunk.extensions` manifest (§8).
4. **File-list pane:** file/hunk tree, keeping the built-in `+/-` stat
   badges, with the review badge appended per file and a `✓` per reviewed
   hunk; hunk rows jump the review stream on click.
5. **Marking:** toggle semantics — pressing `x`/`X` again un-reviews.
