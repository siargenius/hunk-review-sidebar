# mark-as-reviewed — Hunk extension spec

A Hunk extension that lets you mark hunks (and whole files) as reviewed while
working through a diff, see review progress in the file list, visually mute
reviewed hunks, and optionally hide them.

Target API: `hunkdiff/extension` **apiVersion 8** (Hunk ≥ 0.19).

---

## 1. Feature breakdown & API mapping

| # | Feature | API surface |
| --- | --------- | ------------- |
| 1 | `r` toggles current hunk reviewed/unreviewed | `hunk.registerCommand` + `ctx.selection` |
| 2 | `R` toggles all hunks in current file | `hunk.registerCommand` + `ctx.selection` |
| 3 | Next / Previous Unreviewed Hunk commands (bindable, no default key) | `hunk.registerCommand` (no `key`) + `ctx.navigation.selectHunk` / `selectFile` |
| 4 | File list shows `(n/total)` per file, `☑` when complete | `hunk.registerPane` with `replaces: "hunk:files"` |
| 5 | Reviewed hunks get a visual style in the diff | MVP: `hunk.registerLineHighlighter`. Stretch: `hunk.registerFileView` (true dimming) |
| 6 | View option: Hide Reviewed Files (and later Hunks) | Toggle command + `hunk.transformChangeset` + `ctx.commands.execute("hunk.app.refresh")` |

### Hard constraints discovered (these shape the design)

1. **`r` is already taken.** `hunk.app.refresh` ships bound to `r`. Extension
   default chords lose to built-ins (the command still works from the
   Extensions menu and stays bindable). `R` is free. See §3 for the plan.
2. **The built-in file list cannot be decorated.** Progress badges require
   replacing the `hunk:files` pane slot with our own pane. Hunk's own files
   pane is a bundled extension on the same API, so this is a supported,
   dogfooded path — but we re-implement the list rows ourselves (grouping,
   stat badges, scroll-follow are on us; the docs give the exact recipe).
3. **Menu entries are "not contributable yet."** "Hide Reviewed" cannot be a
   literal View-menu item. Every registered command automatically appears in
   the **Extensions** menu, so the toggle lives there and is key-bindable.
4. **Hunks can't be filtered out of a file.** `transformChangeset` can
   filter/reorder *files*; hunks live in the opaque `metadata` blob and must
   pass through untouched. "Hide reviewed *hunks*" is only achievable via a
   custom file view (stretch goal) — or approximated by
   next-unreviewed-hunk navigation.
5. **Line highlighters paint background tints from a fixed tone palette**
   (`match`, `current`, `info`, `warning`, `error`) — they cannot dim text to
   50%. True dimming needs a custom file view (stretch).
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
| `mark-as-reviewed.toggleHideReviewed` | Hide reviewed files | *(none)* |
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

## 4. File list pane (progress badges)

A pane registered with `replaces: "hunk:files"` so it takes over the file
list slot — `s` / View → Files pane keep working against our pane.

Row rendering — **simple flat list (locked decision)**, keeping the
built-in's `+adds/-dels` stat badges and appending the review badge:

```
src/app.ts       +40 -12  (2/7)
src/util.ts      +10  -3   ☑
assets/logo.png            ✓   ← no hunks, marked via X
```

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

### v1 (MVP): line highlighter

`hunk.registerLineHighlighter({ id: "reviewed", ... })` marks every line of
every reviewed hunk (full-line character ranges, `side: "new"` + context
lines on both sides as addressed) with a configurable **tone**
(default `"info"`). After any toggle, the handler calls
`ctx.highlights.refresh("reviewed")` (optionally `{ fileId }`-scoped).

This gives a visible "done" background band, not a 50% dim — that's the
palette's ceiling.

### v2 (stretch): custom file view for true dimming

A `registerFileView` implementation that renders the raw diff itself but
paints reviewed-hunk rows at ~50% opacity (blend fg toward bg), reading
colors from `[extension.mark-as-reviewed]` config so users can theme it.
Selectable from the View menu; raw diff remains the fallback. This also
unlocks "hide reviewed hunks" (collapse them to a one-line summary row,
subject to the `hunkRows` one-entry-per-parsed-hunk contract).

**Theming commitment for v1:** the tone is user-configurable; document the
config knob and the future file view in the README.

---

## 6. Configuration

```toml
[extension.mark-as-reviewed]
# Tone used by the line highlighter for reviewed hunks.
# One of: "match" | "current" | "info" | "warning" | "error"
reviewedTone = "info"

# Start sessions with reviewed files hidden.
hideReviewedFiles = false
```

Per Hunk's rules, repo-level `.hunk/config.toml` can also set these —
fine here (no exec-adjacent values).

---

## 7. "Hide Reviewed" toggle

- `toggleHideReviewed` flips the store flag, then runs
  `ctx.commands.execute("hunk.app.refresh")` so `transformChangeset`
  re-runs and filters out fully-reviewed files.
- Guard: if filtering would hide **every** file, keep the changeset intact
  and notify instead (avoids a dead empty review).
- Reviewed state survives the reload (keyed by path+hunk identity, §2).
- "Hide reviewed hunks" within a file is deferred to the v2 file view (§5);
  v1's answer is the next-unreviewed navigation commands.
- Menu placement: Extensions menu (host limitation §1.3), plus bindable.

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
- **M5 (stretch) — custom file view:** 50% dim, themeable colors, collapse
  reviewed hunks. Separable follow-up release.

## Decisions (locked)

1. **Keys:** conflict-free defaults `x` (toggle hunk) / `X` (toggle file);
   `r`/`R` documented as a user remap (requires moving `hunk.app.refresh`).
2. **Persistence:** in-session only; nothing written to disk in v1.
3. **Naming:** repo stays `hunk-mark-as-reviewed`; extension id is
   `mark-as-reviewed` via a root-level `mark-as-reviewed.tsx` entry file
   and no `hunk.extensions` manifest (§8).
4. **File-list pane:** simple flat list, keeping the built-in `+/-` stat
   badges, with the review badge appended.
5. **Marking:** toggle semantics — pressing `x`/`X` again un-reviews.
