import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile, appendFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Runs a real watcher in an isolated copy so CI (and developers) keep their
// own working tree, node_modules, and dist/ untouched.
const sandbox = await mkdtemp(join(tmpdir(), 'chatflow-watch-'));
let child;
let log = '';
let exitCode;
const marker = 'CHATFLOW_WATCH_SMOKE_MARKER';

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function outputCss() {
  const directory = join(sandbox, 'dist', 'assets');
  if (!(await exists(directory))) return '';
  const names = (await readdir(directory)).filter(name => name.endsWith('.css'));
  return (await Promise.all(names.map(name => readFile(join(directory, name), 'utf8')))).join('\n');
}

async function awaitResult(label, predicate, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (exitCode !== undefined) throw new Error('Watch process exited early (' + exitCode + '):\n' + log);
    if (await predicate()) return;
    await delay(200);
  }
  throw new Error('Timed out waiting for ' + label + ':\n' + log);
}

try {
  for (const path of ['src', 'scripts', 'public', 'popup.html', 'vite.config.ts', 'package.json']) {
    await cp(resolve(path), join(sandbox, path), { recursive: true });
  }
  await symlink(resolve('node_modules'), join(sandbox, 'node_modules'), 'dir');

  child = spawn(process.execPath, ['scripts/watch.mjs'], {
    cwd: sandbox,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CI: '1' },
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { log += chunk.toString(); });
  }
  child.on('exit', code => { exitCode = code ?? -1; });
  child.on('error', error => { log += '\n' + error; exitCode = -1; });

  await awaitResult('initial complete extension build', async () =>
    (await exists(join(sandbox, 'dist', 'manifest.json'))) &&
    (await exists(join(sandbox, 'dist', 'background.js'))) &&
    (await exists(join(sandbox, 'dist', 'content-chatgpt.js'))) &&
    (await exists(join(sandbox, 'dist', 'popup.html'))) &&
    Boolean(await outputCss())
  );

  await appendFile(join(sandbox, 'src', 'background.ts'), '\nconsole.info("' + marker + '");\n');
  await awaitResult('esbuild service-worker rebuild', async () =>
    (await readFile(join(sandbox, 'dist', 'background.js'), 'utf8')).includes(marker)
  );

  await appendFile(join(sandbox, 'src', 'popup', 'style.css'), '\nbody{--chatflow-watch-smoke:ready}\n');
  await awaitResult('Vite popup CSS rebuild', async () =>
    (await outputCss()).includes('--chatflow-watch-smoke')
  );

  await writeFile(join(sandbox, 'public', 'watch-smoke.txt'), 'static asset refreshed');
  await awaitResult('public asset sync', async () => {
    const dest = join(sandbox, 'dist', 'watch-smoke.txt');
    return (await exists(dest)) && (await readFile(dest, 'utf8')) === 'static asset refreshed';
  });

  assert.equal(await exists(join(sandbox, 'dist', 'background.js')), true,
    'Vite rebuild must not erase the esbuild worker');
  assert.equal(await exists(join(sandbox, 'dist', 'manifest.json')), true);
  console.info('Watch smoke test passed: esbuild, Vite and static assets rebuild in place.');
} finally {
  if (child && exitCode === undefined) {
    const ended = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([ended, delay(5000)]);
    if (exitCode === undefined) child.kill('SIGKILL');
  }
  await rm(sandbox, { recursive: true, force: true });
}
