import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type {
  ExtensionDiffFile,
  ExtensionPaneProps,
  ExtensionPaneTheme,
} from "hunkdiff/extension";
import {
  fileProgress,
  getState,
  isFileFullyReviewed,
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
        style={{ fg: selected ? theme.accent : pathColor(file, theme) }}
      />
      <text
        content={right.length > 0 ? `${right} ` : ""}
        style={{ fg: done ? theme.badgeAdded : theme.muted }}
      />
    </box>
  );
}

/**
 * Replacement for the built-in files pane (`replaces: "hunk:files"`): the
 * same flat file list, keeping +/- stat badges, with a review-progress badge
 * appended — `(n/total)` while a file is in progress, `☑` once every hunk is
 * reviewed, `✓` for hunk-less files marked reviewed whole.
 */
export function ReviewedFilesPane(props: ExtensionPaneProps) {
  // Subscribe to the module-level review store so toggles rerender the list
  // even though they happen outside React.
  useSyncExternalStore(subscribe, getState);
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  useEffect(() => {
    if (props.selectedFileId !== null) {
      scrollRef.current?.scrollChildIntoView(`row-${props.selectedFileId}`);
    }
  }, [props.selectedFileId]);
  const totals = totalProgress(props.files);
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
          content={` ${totals.reviewed}/${totals.total} reviewed`}
          style={{
            fg:
              totals.total > 0 && totals.reviewed === totals.total
                ? props.theme.badgeAdded
                : props.theme.muted,
          }}
        />
      </box>
      {props.files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          selected={file.id === props.selectedFileId}
          width={props.width}
          theme={props.theme}
          onSelect={() => props.actions.selectFile(file.id)}
        />
      ))}
    </scrollbox>
  );
}
