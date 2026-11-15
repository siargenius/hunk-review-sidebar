import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import pty from 'node-pty';
import xterm from '@xterm/headless';

const hunkBin = process.env.HUNK_BIN || '/opt/homebrew/bin/hunk';
const root = mkdtempSync(join(tmpdir(), 'hunk-sidebar-smoke-'));
const cwd = join(root, 'repo');
mkdirSync(cwd);
const installed = process.env.HUNK_SMOKE_INSTALLED === '1';
const env = { ...process.env, TERM: 'xterm-256color', XDG_CONFIG_HOME: installed ? (process.env.XDG_CONFIG_HOME || join(homedir(), '.config')) : join(root, 'config') };
if (!installed) {
  mkdirSync(join(env.XDG_CONFIG_HOME, 'hunk'), { recursive: true });
  writeFileSync(join(env.XDG_CONFIG_HOME, 'hunk/config.toml'), 'theme = "gruvbox-dark-hard"\n');
}
const run = (exe, args) => execFileSync(exe, args, { cwd, env, encoding: 'utf8' });
run('git', ['init', '-q']);
writeFileSync(join(cwd, 'hello.txt'), 'before\n');
run('git', ['add', '.']);
run('git', ['-c', 'user.name=Smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '-qm', 'fixture']);
writeFileSync(join(cwd, 'hello.txt'), 'after\n');
writeFileSync(join(root, 'notes.json'), JSON.stringify({ files: [{ path: 'hello.txt', annotations: [
  { summary: 'SIDECAR_NOTE', rationale: 'Details stay visible in the combined pane.', newRange: [1, 1] },
] }] }));
const term = new xterm.Terminal({ cols: 140, rows: 42, allowProposedApi: true });
let output = '';
let child;
let exited = false;
const screen = () => Array.from({ length: term.rows }, (_, i) => term.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n');
const sidebar = () => screen().split('\n').map(line => line.slice(0, 34)).join('\n');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label) {
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (test()) return;
    if (exited) break;
  }
  throw new Error(`${label}\n${screen()}\n${output.slice(-2000)}`);
}
try {
  child = pty.spawn(hunkBin, ['diff', '--sidebar', '--agent-notes', ...(installed ? [] : ['--extension', resolve('mark-as-reviewed.tsx')]), '--agent-context', join(root, 'notes.json')], { cwd, env, cols: 140, rows: 42 });
  child.onData(data => { output += data; term.write(data); });
  child.onExit(() => { exited = true; });
  await until(() => sidebar().includes('1 note · Agent') && sidebar().includes('0/1 reviewed'), 'initial combined pane');
  assert.equal(screen().split('Hide reviewed files').length - 1, 1);
  assert.ok(!sidebar().includes('SIDECAR_NOTE') && !sidebar().includes('USER_NOTE'), 'note bodies stay out of the sidebar');
  const fileRow = screen().split('\n').findIndex(line => line.slice(0, 34).includes('hello.txt'));
  const row = term.buffer.active.getLine(fileRow);
  const rowText = row.translateToString();
  assert.notEqual(row.getCell(rowText.indexOf('+1')).getFgColor(), row.getCell(rowText.indexOf('-1')).getFgColor(), 'addition and deletion counts use distinct colors');
  assert.match(rowText.slice(0, 34), /● \+1 -1/);
  assert.ok(!rowText.slice(0, 34).includes("*1"));
  assert.ok(!rowText.slice(0, 34).includes('1n'));
  const hunkRowIndex = screen().split('\n').findIndex(line => line.slice(0, 34).includes('@@ -1 +1 @@'));
  const hunkRow = term.buffer.active.getLine(hunkRowIndex);
  const hunkText = hunkRow.translateToString();
  assert.equal(hunkRow.getCell(hunkText.indexOf('+1')).getFgColor(), row.getCell(rowText.indexOf('+1')).getFgColor(), 'hunk additions match the green file count');
  assert.equal(hunkRow.getCell(hunkText.indexOf('-1')).getFgColor(), row.getCell(rowText.indexOf('-1')).getFgColor(), 'hunk deletions match the red file count');

  child.write('x');
  await until(() => sidebar().includes('1/1 reviewed'), 'marking keeps the combined pane');
  child.write('s');
  await until(() => !screen().includes('Hide reviewed files'), 's closes the replacement');
  child.write('s');
  await until(() => sidebar().includes('1 note · Agent'), 's reopens the replacement');
  child.write('r');
  await until(() => sidebar().includes('1/1 reviewed'), 'reload retains progress');
  await sleep(500);
  assert.ok(sidebar().includes('1 note · Agent'));
  const sessions = JSON.parse(run(hunkBin, ['session', 'list', '--json'])).sessions;
  const session = sessions.find(session => session.path === cwd || session.repoRoot === cwd || JSON.stringify(session).includes(cwd));
  assert.ok(session, 'isolated session registered');
  const id = session.id || session.sessionId;
  assert.ok(id);
  const added = JSON.parse(run(hunkBin, ['session', 'comment', 'add', id, '--file', 'hello.txt', '--new-line', '1', '--summary', 'LIVE_NOTE', '--author', 'Codex', '--json']));
  await until(() => sidebar().includes('1 note · Codex') && sidebar().includes('2 notes'), 'live note appears without a refresh');
  const listed = JSON.parse(run(hunkBin, ['session', 'comment', 'list', id, '--json']));
  assert.equal(listed.comments.length, 1);
  run(hunkBin, ['session', 'comment', 'rm', id, added.result.commentId, '--json']);
  await until(() => !sidebar().includes('1 note · Codex') && sidebar().includes('1 note'), 'removed note disappears');
  child.write('c');
  await sleep(400);
  child.write('USER_NOTE');
  await sleep(200);
  child.write('\x13');
  await until(() => sidebar().includes('1 note · You'), 'saved user note appears');
  const userNotes = JSON.parse(run(hunkBin, ['session', 'comment', 'list', id, '--type', 'user', '--json'])).comments;
  assert.equal(userNotes.length, 1);
  const reply = JSON.parse(run(hunkBin, ['session', 'comment', 'add', id, '--reply-to', userNotes[0].noteId, '--summary', 'REPLY_BODY', '--author', 'Codex', '--json']));
  await until(() => sidebar().includes('2 notes · Codex') && !sidebar().includes('1 note · You'), 'thread groups replies and shows latest author');
  assert.ok(!sidebar().includes('REPLY_BODY'));
  run(hunkBin, ['session', 'comment', 'rm', id, reply.result.commentId, '--json']);
  await until(() => sidebar().includes('1 note · You'), 'deleting latest reply restores previous author');
  const click = async (x, y) => { await sleep(200); child.write(`\x1b[<0;${x};${y}M`); await sleep(100); child.write(`\x1b[<0;${x};${y}m`); };
  await click(5, 4);
  await until(() => !sidebar().includes('1. @@'), 'Changes control hides hunk rows');
  child.write('s');
  await until(() => !screen().includes('Hide reviewed files'), 'close compact pane');
  child.write('s');
  await until(() => sidebar().includes('1 note · Agent') && !sidebar().includes('1. @@'), 'compact preference survives reopen');
  await click(15, 4);
  await until(() => !sidebar().includes('1 note · Agent'), 'Notes control hides notes');
  await click(15, 4);
  await until(() => sidebar().includes('1 note · Agent'), 'Notes control shows notes');
  await click(5, 4);
  await until(() => sidebar().includes('1. @@'), 'Changes control restores hunk rows');
  await click(5, 3);
  await until(() => sidebar().includes('▣ Hide reviewed files'), 'hide reviewed control refreshes');
  await sleep(500);
  assert.ok(sidebar().includes('1 note · Agent'));
  await click(5, 3);
  await until(() => sidebar().includes('☐ Hide reviewed files'), 'hide reviewed control restores mode');
  child.write('x');
  await until(() => sidebar().includes('0/1 reviewed'), 'clearing the last mark retains the combined pane');
  term.resize(85, 30);
  child.resize(85, 30);
  await sleep(500);
  assert.ok(sidebar().includes('1 note · You'));
  assert.equal(screen().split('Hide reviewed files').length - 1, 1);
  console.log('SMOKE_SIDEBAR\n' + sidebar().trimEnd());
  assert.ok(!/failed rendering|failed to load|Extension .*failed/.test(screen()));
  console.log('PASS: initial notes, marking, single pane, s toggle, reload, live notes/removal, saved user notes, section controls, filtering, clearing marks, narrow terminal');
} finally {
  child?.kill();
  await sleep(300);
  term.dispose();
  rmSync(root, { recursive: true, force: true });
}
