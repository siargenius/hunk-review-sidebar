// Local adapter for hunk-mark-as-reviewed v0.2.0. No approval or code changes.
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

export function installReviewBridge(hunk: any, store: any) {
  const directory = join(homedir(), '.cache/hunk/review-progress');
  const output = join(directory, `${process.pid}.json`);
  let cwd = process.cwd();
  let title = '';
  let identity = '';
  let files: any[] = [];
  let revision = 0;
  let loaded = false;
  let changing = false;
  const publish = () => {
    if (!loaded || changing) return;
    const progress = files.map(file => ({ path: file.path, ...store.fileProgress(file),
      complete: store.isFileFullyReviewed(file) }));
    const value = { version: 1, revision, pid: process.pid, cwd, title, identity,
      updated_at: new Date().toISOString(), hidden: store.getState().hideReviewedFiles,
      files: progress, all_reviewed: progress.length > 0 && progress.every(f => f.complete) };
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    writeFileSync(`${output}.tmp`, JSON.stringify(value), { mode: 0o600 });
    renameSync(`${output}.tmp`, output);
  };
  const unsubscribe = store.subscribe(() => { revision++; publish(); });
  hunk.on('changeset_loaded', ({ changeset }: any, ctx: any) => {
    changing = true;
    revision++;
    cwd = ctx.cwd;
    const next = createHash('sha256').update(JSON.stringify({title: changeset.title,
      files: changeset.files.map((f: any) => ({path:f.path, metadata:f.metadata}))})).digest('hex');
    if (identity && next !== identity) store.resetReviewed();
    identity = next;
    title = changeset.title;
    files = changeset.files;
    loaded = true;
    changing = false;
    publish();
  });
  const timer = setInterval(() => { try { publish(); } catch {} }, 15000);
  hunk.on('shutdown', () => {
    clearInterval(timer); unsubscribe();
    rmSync(output, { force: true });
  });
}
