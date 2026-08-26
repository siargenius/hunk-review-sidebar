import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type {
  ExtensionDiffFile,
  ExtensionDiffHunk,
  ExtensionPaneProps,
  ExtensionPaneTheme,
} from "hunkdiff/extension";
import { toggleHideReviewedFiles } from "./hide.ts";
import {
  fileProgress,
  getState,
  hunksFor,
  isFileFullyReviewed,
  isHunkReviewed,
  subscribe,
  totalProgress,
} from "./store.ts";

function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "…";
  const keep = max - 1;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

function pathColor(file: ExtensionDiffFile, theme: ExtensionPaneTheme): string {
  if (file.isUntracked) return theme.fileUntracked;
  switch (file.changeType) {
    case "new":
      return theme.fileNew;
    case "deleted":
      return theme.fileDeleted;
    case "rename-pure":
    case "rename-changed":
      return theme.fileRenamed;
    default:
      return theme.fileModified;
  }
}

/** Split a path into its directory (trailing slash, "" at root) and base name. */
function splitPath(path: string): { dir: string; base: string } {
  const slash = path.lastIndexOf("/");
  return slash === -1
    ? { dir: "", base: path }
    : { dir: path.slice(0, slash + 1), base: path.slice(slash + 1) };
}

/** One-letter change indicator, matching the built-in file list. */
function statusLetter(file: ExtensionDiffFile): string {
  if (file.isUntracked) return "?";
  switch (file.changeType) {
    case "new":
      return "A";
    case "deleted":
      return "D";
    case "rename-pure":
    case "rename-changed":
      return "R";
    default:
      return "M";
  }
}

/** Checkbox glyphs: empty, partially reviewed, fully reviewed. */
const CHECK_TODO = "\u2610"; // ☐
const CHECK_PARTIAL = "\u25E7"; // ◧
const CHECK_DONE = "\u25A3"; // ▣

interface FileRowProps {
  readonly file: ExtensionDiffFile;
  readonly selected: boolean;
  readonly width: number;
  readonly theme: ExtensionPaneTheme;
  readonly onSelect: () => void;
}

function FileRow({ file, selected, width, theme, onSelect }: FileRowProps) {
  const progress = fileProgress(file);
  const done = isFileFullyReviewed(file);
  const check = done
    ? CHECK_DONE
    : progress.reviewed > 0
      ? CHECK_PARTIAL
      : CHECK_TODO;
  const checkColor = done
    ? theme.badgeAdded
    : progress.reviewed > 0
      ? theme.accent
      : theme.muted;
  const truncated = file.statsTruncated ? "+" : "";
  const stats =
    file.stats.additions + file.stats.deletions > 0
      ? `+${file.stats.additions}${truncated} -${file.stats.deletions}${truncated}`
      : "";
  const count =
    progress.total > 0 && !done
      ? `(${progress.reviewed}/${progress.total})`
      : "";
  const right = [stats, count].filter(Boolean).join(" ");
  // Left fixed cells: " ☐ M " — checkbox and status letter.
  const nameMax = Math.max(1, width - right.length - 6);
  const name = truncateMiddle(splitPath(file.path).base, nameMax);
  return (
    <box
      id={`row-${file.id}`}
      style={{
        flexDirection: "row",
        width: "100%",
        height: 1,
        justifyContent: "space-between",
        backgroundColor: selected ? theme.selectedHunk : undefined,
      }}
      onMouseUp={onSelect}
    >
      <box style={{ flexDirection: "row", height: 1 }}>
        <text content={` ${check} `} style={{ fg: checkColor }} />
        <text
          content={`${statusLetter(file)} `}
          style={{ fg: pathColor(file, theme) }}
        />
        <text
          content={name}
          style={{ fg: selected ? theme.accent : theme.text }}
        />
      </box>
      <text
        content={right.length > 0 ? `${right} ` : ""}
        style={{
          fg: done ? theme.badgeAdded : theme.muted,
        }}
      />
    </box>
  );
}

interface HunkRowProps {
  readonly file: ExtensionDiffFile;
  readonly hunk: ExtensionDiffHunk;
  readonly selected: boolean;
  readonly width: number;
  readonly theme: ExtensionPaneTheme;
  readonly onSelect: () => void;
}

function HunkRow({
  file,
  hunk,
  selected,
  width,
  theme,
  onSelect,
}: HunkRowProps) {
  const reviewed = isHunkReviewed(file.path, hunk);
  const check = reviewed ? CHECK_DONE : CHECK_TODO;
  const ordinal = `${hunk.index + 1}.`;
  // Leading indent + checkbox + ordinal ("   ☐ 12. ").
  const prefix = `   ${check} ${ordinal} `;
  const labelMax = Math.max(1, width - prefix.length - 1);
  const label = truncateMiddle(hunk.header, labelMax);
  return (
    <box
      id={`row-${file.id}:h${hunk.index}`}
      style={{
        flexDirection: "row",
        width: "100%",
        height: 1,
        backgroundColor: selected ? theme.selectedHunk : undefined,
      }}
      onMouseUp={onSelect}
    >
      <text
        content={`   ${check} `}
        style={{ fg: reviewed ? theme.badgeAdded : theme.muted }}
      />
      <text
        content={`${ordinal} ${label}`}
        style={{
          fg: selected ? theme.accent : reviewed ? theme.muted : theme.text,
        }}
      />
    </box>
  );
}

/**
 * The "Review" pane: a tree of directories, files, and their hunks, shown
 * in place of the built-in file list while any mark exists (the entry point
 * swaps the two via open/close; with zero marks only the built-in list is
 * around and `s` toggles it alone). The layout mirrors the built-in list's
 * simplicity — a dimmed directory header, then one row per file with a
 * colored status letter and right-aligned +/- stats — with hunks nested one
 * level deeper. Every row leads with a unicode checkbox: `▣` reviewed, `◧`
 * partially reviewed (files only), `☐` not reviewed. In-progress files also
 * keep a `(n/total)` count beside their stats. Hunk rows jump the review
 * stream to the hunk on click, so the global `x`/`X` toggles then act on
 * what was clicked. The header row counts the whole changeset; beneath it
 * sits a clickable "Hide reviewed files" checkbox — the only surface that
 * both shows and flips that mode, since extension menu entries can't carry
 * a live check state.
 */
export function ReviewedFilesPane(props: ExtensionPaneProps) {
  // Subscribe to the module-level review store so toggles rerender the list
  // even though they happen outside React.
  const state = useSyncExternalStore(subscribe, getState);
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  useEffect(() => {
    if (props.selectedFileId === null) return;
    const id =
      props.selectedHunkIndex === null
        ? `row-${props.selectedFileId}`
        : `row-${props.selectedFileId}:h${props.selectedHunkIndex}`;
    scrollRef.current?.scrollChildIntoView(id);
  }, [props.selectedFileId, props.selectedHunkIndex]);
  const totals = totalProgress(props.files);
  const allReviewed = totals.total > 0 && totals.reviewed === totals.total;
  const summary = ` ${totals.reviewed}/${totals.total} reviewed`;
  const hideCheck = state.hideReviewedFiles ? CHECK_DONE : CHECK_TODO;
  // Group files under a dimmed directory header, emitted whenever the
  // directory changes — the changeset arrives path-sorted, so siblings are
  // already adjacent.
  const rows: ReactNode[] = [];
  let lastDir: string | null = null;
  for (const file of props.files) {
    const dir = splitPath(file.path).dir;
    if (dir !== lastDir) {
      lastDir = dir;
      if (dir !== "") {
        rows.push(
          <box key={`dir-${dir}`} style={{ height: 1, width: "100%" }}>
            <text content={` ${dir}`} style={{ fg: props.theme.muted }} />
          </box>,
        );
      }
    }
    rows.push(
      <box
        key={file.id}
        style={{
          flexDirection: "column",
          width: "100%",
        }}
      >
        <FileRow
          file={file}
          selected={
            file.id === props.selectedFileId && props.selectedHunkIndex === null
          }
          width={props.width}
          theme={props.theme}
          onSelect={() => props.actions.selectFile(file.id)}
        />
        {hunksFor(file).map((hunk) => (
          <HunkRow
            key={hunk.index}
            file={file}
            hunk={hunk}
            selected={
              file.id === props.selectedFileId &&
              hunk.index === props.selectedHunkIndex
            }
            width={props.width}
            theme={props.theme}
            onSelect={() => props.actions.selectHunk(file.id, hunk.index)}
          />
        ))}
      </box>,
    );
  }
  return (
    <scrollbox
      ref={scrollRef}
      width="100%"
      height="100%"
      scrollY={true}
      focused={false}
    >
      <box style={{ height: 1, width: "100%" }}>
        <text
          content={summary}
          style={{
            fg: allReviewed ? props.theme.badgeAdded : props.theme.muted,
          }}
        />
      </box>
      <box
        style={{ flexDirection: "row", height: 1, width: "100%" }}
        onMouseUp={() => toggleHideReviewedFiles(props.actions.notify)}
      >
        <text
          content={` ${hideCheck} `}
          style={{
            fg: state.hideReviewedFiles
              ? props.theme.badgeAdded
              : props.theme.muted,
          }}
        />
        <text content="Hide reviewed files" style={{ fg: props.theme.text }} />
      </box>
      {rows}
    </scrollbox>
  );
}
