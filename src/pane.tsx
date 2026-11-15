import { useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type {
  ExtensionDiffFile,
  ExtensionDiffHunk,
  ExtensionPaneProps,
  ExtensionPaneTheme,
} from "hunkdiff/extension";
import type { NoteThread } from "./notes.ts";
import { notesFor, noteSource, threadsFor, revealNote } from "./notes.ts";
import { hunkLabel } from "./hunk-label.ts";
import { toggleHideReviewedFiles } from "./hide.ts";
import {
  fileProgress,
  getState,
  hunksFor,
  isFileFullyReviewed,
  isHunkReviewed,
  subscribe,
  totalProgress,
  toggleSection,
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
  const additions = file.stats.additions > 0 ? `+${file.stats.additions}${truncated}` : "";
  const deletions = file.stats.deletions > 0 ? `-${file.stats.deletions}${truncated}` : "";
  const count =
    progress.total > 0 && !done
      ? `(${progress.reviewed}/${progress.total})`
      : "";
  const notes = notesFor(file).length;
  const noteCount = notes > 0 ? `*${notes}` : "";
  const right = [count, noteCount, additions, deletions].filter(Boolean).join(" ");
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
      <box style={{ flexDirection: "row", height: 1 }}>
        {[
          { text: count, color: theme.muted },
          { text: noteCount, color: theme.muted },
          { text: additions, color: theme.badgeAdded },
          { text: deletions, color: theme.badgeRemoved },
        ].filter(item => item.text).map((item, index) => (
          <text key={index} content={`${item.text} `} style={{ fg: item.color }} />
        ))}
      </box>
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
  const label = hunkLabel(hunk.header, labelMax);
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
      <box style={{ flexDirection: "row", height: 1 }}>
        <text content={`${ordinal} `} style={{ fg: selected ? theme.accent : reviewed ? theme.muted : theme.text }} />
        {label.split(/([+-][\d,…]+)/).filter(Boolean).map((part, index) => (
          <text
            key={index}
            content={part}
            style={{ fg: part.startsWith("+") ? theme.badgeAdded : part.startsWith("-") ? theme.badgeRemoved : selected ? theme.accent : reviewed ? theme.muted : theme.text }}
          />
        ))}
      </box>
    </box>
  );
}

function ThreadRow({ file, thread, ordinal, props }: {
  file: ExtensionDiffFile;
  thread: NoteThread;
  ordinal: number;
  props: ExtensionPaneProps;
}) {
  const label = `     ● ${ordinal}. ${thread.count} ${thread.count === 1 ? "note" : "notes"} · ${noteSource(thread.latest)}`;
  return (
    <box style={{ height: 1, width: "100%" }} onMouseUp={() => revealNote(file, thread.root, props.actions)}>
      <text
        content={truncateMiddle(label, props.width - 1)}
        style={{ fg: thread.latest.source === "user" ? props.theme.accent : props.theme.muted }}
      />
    </box>
  );
}

/** Files, hunk progress, and saved notes in one replacement pane. */
export function ReviewedFilesPane(props: ExtensionPaneProps) {
  // Subscribe to the module-level review store so toggles rerender the list
  // even though they happen outside React.
  const state = useSyncExternalStore(subscribe, getState);
  const { showChanges, showNotes } = state;
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  useEffect(() => {
    if (props.selectedFileId === null) return;
    const id =
      props.selectedHunkIndex === null || !showChanges
        ? `row-${props.selectedFileId}`
        : `row-${props.selectedFileId}:h${props.selectedHunkIndex}`;
    scrollRef.current?.scrollChildIntoView(id);
  }, [props.selectedFileId, props.selectedHunkIndex, showChanges]);
  const totals = totalProgress(props.files);
  const allReviewed = totals.total > 0 && totals.reviewed === totals.total;
  const noteCount = props.files.reduce((count, file) => count + notesFor(file).length, 0);
  const summary = ` ${totals.reviewed}/${totals.total} reviewed · ${noteCount} ${noteCount === 1 ? "note" : "notes"}`;
  const hideCheck = state.hideReviewedFiles ? CHECK_DONE : CHECK_TODO;
  // Group files under a dimmed directory header, emitted whenever the
  // directory changes — the changeset arrives path-sorted, so siblings are
  // already adjacent.
  const rows: ReactNode[] = [];
  let lastDir: string | null = null;
  for (const file of props.files) {
    const threads = threadsFor(file);
    const threadRow = (thread: NoteThread, ordinal: number) => (
      <ThreadRow key={thread.id} file={file} thread={thread} ordinal={ordinal} props={props} />
    );
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
        {showChanges && hunksFor(file).map((hunk) => (
          <box key={hunk.index} style={{ flexDirection: "column", width: "100%" }}>
            <HunkRow
              file={file}
              hunk={hunk}
              selected={file.id === props.selectedFileId && hunk.index === props.selectedHunkIndex}
              width={props.width}
              theme={props.theme}
              onSelect={() => props.actions.selectHunk(file.id, hunk.index)}
            />
            {showNotes && threads.filter(thread => thread.hunkIndex === hunk.index).map((thread, index) => threadRow(thread, index + 1))}
          </box>
        ))}
        {showNotes && threads.filter(thread => !showChanges || thread.hunkIndex === null).map((thread, index) => threadRow(thread, index + 1))}
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
      <box style={{ flexDirection: "row", height: 1, width: "100%" }}>
        <text
          content={` ${showChanges ? CHECK_DONE : CHECK_TODO} Changes `}
          style={{ fg: props.theme.accent }}
          onMouseUp={() => toggleSection("showChanges")}
        />
        <text
          content={`${showNotes ? CHECK_DONE : CHECK_TODO} Notes`}
          style={{ fg: props.theme.accent }}
          onMouseUp={() => toggleSection("showNotes")}
        />
      </box>
      {rows.length > 0 ? rows : <text content=" No visible files" style={{ fg: props.theme.muted }} />}
    </scrollbox>
  );
}
