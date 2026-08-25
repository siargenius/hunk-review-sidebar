import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type {
  ExtensionDiffFile,
  ExtensionDiffHunk,
  ExtensionPaneProps,
  ExtensionPaneTheme,
} from "hunkdiff/extension";
import {
  fileProgress,
  getState,
  isFileFullyReviewed,
  isHunkReviewed,
  knownHunksFor,
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

/** Hunk summaries for a file, falling back to the store's last record. */
function hunksOf(file: ExtensionDiffFile): readonly ExtensionDiffHunk[] {
  return file.hunks ?? knownHunksFor(file.path);
}

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
  const truncated = file.statsTruncated ? "+" : "";
  const stats =
    file.stats.additions + file.stats.deletions > 0
      ? `+${file.stats.additions}${truncated} -${file.stats.deletions}${truncated}`
      : "";
  const badge =
    progress.total > 0
      ? done
        ? "☑"
        : `(${progress.reviewed}/${progress.total})`
      : done
        ? "✓"
        : "";
  const right = [stats, badge].filter(Boolean).join(" ");
  const pathMax = Math.max(1, width - right.length - 3);
  const label = truncateMiddle(file.path, pathMax);
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
      <text
        content={` ${label}`}
        style={{
          fg: selected ? theme.accent : pathColor(file, theme),
        }}
      />
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
  const badge = reviewed ? "✓" : "";
  // Leading indent + ordinal (" 12. ") + trailing badge cell.
  const labelMax = Math.max(1, width - badge.length - 7);
  const label = truncateMiddle(hunk.header, labelMax);
  return (
    <box
      id={`row-${file.id}:h${hunk.index}`}
      style={{
        flexDirection: "row",
        width: "100%",
        height: 1,
        justifyContent: "space-between",
        backgroundColor: selected ? theme.selectedHunk : undefined,
      }}
      onMouseUp={onSelect}
    >
      <text
        content={`  ${hunk.index + 1}. ${label}`}
        style={{
          fg: selected ? theme.accent : reviewed ? theme.muted : theme.text,
        }}
      />
      <text
        content={badge.length > 0 ? `${badge} ` : ""}
        style={{ fg: theme.badgeAdded }}
      />
    </box>
  );
}

/**
 * The "Review" pane: a tree of files and their hunks, shown in place of the
 * built-in file list while any mark exists (the entry point swaps the two
 * via open/close; with zero marks only the built-in list is around and `s`
 * toggles it alone). File rows keep the built-in's +/- stat badges and
 * append a review badge — `(n/total)` in progress, `☑` once every hunk is
 * reviewed, `✓` for hunk-less files marked reviewed whole. Hunk rows show the
 * `@@` header (muted with a `✓` once reviewed) and jump the review stream to
 * the hunk on click, so the global `x`/`X` toggles then act on what was
 * clicked. The header row counts the whole changeset and flags when
 * fully-reviewed files are being hidden.
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
  const hiding = state.hideReviewedFiles ? " · hiding reviewed files" : "";
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
          content={`${summary}${hiding}`}
          style={{
            fg: allReviewed ? props.theme.badgeAdded : props.theme.muted,
          }}
        />
      </box>
      {props.files.map((file) => (
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
              file.id === props.selectedFileId &&
              props.selectedHunkIndex === null
            }
            width={props.width}
            theme={props.theme}
            onSelect={() => props.actions.selectFile(file.id)}
          />
          {hunksOf(file).map((hunk) => (
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
        </box>
      ))}
    </scrollbox>
  );
}
