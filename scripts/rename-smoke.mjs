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
writeFileSync(join(cwd, 'original.txt'), 'unchanged content\n');
run('git', ['add', '.']);
run('git', ['-c', 'user.name=Smoke', '-c', 'user.email=smoke@example.invalid', 'commit', '-qm', 'fixture']);
writeFileSync(join(cwd, 'hello.txt'), 'after\n');
run('git', ['mv', 'original.txt', 'renamed.txt']);
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
  child = pty.spawn(hunkBin, ['diff', 'HEAD', '--sidebar', '--extension', resolve('mark-as-reviewed.tsx')], { cwd, env, cols: 140, rows: 42 });
  child.onData(data => { output += data; term.write(data); });
  child.onExit(() => { exited = true; });
  await until(() => sidebar().includes('1/2 reviewed') && sidebar().includes('▣ R renamed.txt'), 'pure rename starts reviewed');
  child.write('x');
  await until(() => sidebar().includes('2/2 reviewed'), 'text review completes changeset including pure rename');
  child.write('x');
  await until(() => sidebar().includes('1/2 reviewed'), 'unmark text change');
  child.write('\x1b[<0;5;3M');
  await sleep(100);
  child.write('\x1b[<0;5;3m');
  await until(() => sidebar().includes('0/1 reviewed') && !sidebar().includes('renamed.txt'), 'hide reviewed filters the pure rename');
  child.write('r');
  await sleep(600);
  assert.ok(!sidebar().includes('renamed.txt'), 'filtered rename stays hidden on the next reload');
  assert.ok(sidebar().includes('0/1 reviewed'));
  console.log('PASS: real Git pure rename auto-review, 2/2 completion, hiding, and repeated reload');
} finally {
  child?.kill();
  await sleep(300);
  term.dispose();
  rmSync(root, { recursive: true, force: true });
}
