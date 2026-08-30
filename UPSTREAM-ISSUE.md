# Draft issue for modem-dev/hunk

> **Resolved:** filed as modem-dev/hunk#852 and shipped by
> [modem-dev/hunk#909](https://github.com/modem-dev/hunk/pull/909) — the
> `"dim"` line-highlight tone, available from extension apiVersion 11
> (hunkdiff ≥ 0.21). This extension uses it since 0.2.0, with a fallback to
> background tones on older Hunk versions.

**Title:** Line highlighters: a "dim" treatment for diff text (foreground-side control)

---

## Summary

`registerLineHighlighter` can only paint *background* tints. For
review-progress workflows (marking hunks as reviewed), the natural treatment
is the opposite: make the text itself recede — roughly a 50% dim toward the
background — while leaving everything else about the host's diff rendering
untouched. Today no extension surface can do that.

## Use case

I'm building [`hunk-mark-as-reviewed`](https://github.com/evantravers/hunk-mark-as-reviewed),
an extension that lets you mark hunks/files as reviewed (`x`/`X`), shows
per-file `(n/total)` progress in a replacement files pane, and navigates
between unreviewed hunks. The missing piece is the visual: once a hunk is
reviewed, I want it to *fade back* so the eye goes to what's left.

The current highlighter API gets me a background band, which reads as
"flagged/attention" — the opposite of "done, nothing to see here":

> "Syntax highlighting, word diff, and layout stay intact; the marked
> characters get a resolved background."

What I want is the same delivery mechanism (source-coordinate marks, host
resolves against theme and line kind, paint-only, never geometry) but applied
to the **foreground**: dim the marked text toward its background.

## Proposed API

Any of these would work; the first is my preference for symmetry with the
existing model:

1. **A new mark tone** — `tone: "dim"` (or `"muted"`). The host resolves it
   like any other tone, but instead of a background tint it blends the
   line's foreground (syntax color included) ~50% toward the resolved
   background of that cell. Fits the existing "tones rather than colors, host
   owns resolution" philosophy, and the minimum-contrast machinery already
   exists for word-diff emphasis (here it would cap *maximum* contrast
   instead).

2. **Attributes on marks** — `attributes: ["faint"]` on
   `ExtensionLineHighlight`, mapping to the terminal's faint/dim SGR. Less
   control over the exact amount, but trivially explainable.

3. **A foreground override on marks** — e.g. `fg?: "dim" | "muted"` —
   keeping backgrounds and foregrounds independently composable.

In all variants, marks stay paint-only: colors change, never text or
geometry — the failure/containment story is identical to today's
highlighters.

## Alternatives considered

- **Background tones (status quo).** Works, but reads as "highlighted for
  attention", not "recede". On added/removed lines the tinted background also
  fights the line-kind background the user relies on to read the diff.
- **A custom file view (`registerFileView`).** This is the only surface with
  foreground control, but view rows are painted from symbolic spans with six
  semantic tones — `syntax` is a single generic color, not per-token
  highlighting. Replacing the raw diff to dim reviewed hunks would strip real
  syntax highlighting from the *unreviewed* hunks too — the ones the reviewer
  is still actively reading. A fixed-height JSX row painter could compute a
  true 50% blend, but it would have to re-implement the diff rendering
  (syntax, word diff, layout) to match the host for everything else.
- **Theme contribution.** `registerTheme` can't add tokens, and a reviewed
  state is dynamic per-hunk state, not a theme concern.

## Why it belongs in the highlighter API

- The use case generalizes beyond my extension: coverage (dim covered
  lines), generated-code markers, "already reviewed in a previous round" for
  stacked diffs — all are "recede this text" rather than "flag this text".
- It composes with everything that already works: `revealLine` pairing,
  split/stack layout, wrapping, collapsed-context expansion — all inherited
  because the mark model doesn't change.
- Per the extension-system docs, a capability the public contract can't
  express is a real gap; this one currently forces a choice between "no
  dimming" and "re-implement the diff renderer".

Happy to prototype behind a flag or test an experimental shape if that helps.
