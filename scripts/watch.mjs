import { watch as watchFiles } from 'node:fs';
import { cp, rm } from 'node:fs/promises';
import { build as buildVite } from 'vite';
import { context as esbuildContext } from 'esbuild';
import { esbuildBundles } from './bundles.mjs';

// Clean exactly once at startup. Repeated Vite cleanups would delete the
// background/content bundles that esbuild writes into the same dist/ directory.
await rm('dist', { recursive: true, force: true });

const esbuildContexts = [];
let viteWatcher;
let publicWatcher;
let stopping = false;
let assetSync = Promise.resolve();

async function stop() {
  if (stopping) return;
  stopping = true;
  publicWatcher?.close();
  const tasks = esbuildContexts.map(context => context.dispose());
  if (viteWatcher) tasks.push(viteWatcher.close());
  await Promise.allSettled(tasks);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void stop().then(() => process.exit(0), error => {
      console.error(error);
      process.exit(1);
    });
  });
}

try {
  // Vite handles the popup React/CSS bundle; keep emptyOutDir disabled because
  // esbuild owns the worker and content-script files in that same directory.
  const result = await buildVite({
    build: { watch: {}, emptyOutDir: false },
  });
  if (!('on' in result) || !('close' in result)) {
    throw new Error('Vite did not return a build watcher.');
  }
  viteWatcher = result;
  viteWatcher.on('event', event => {
    if (event.code === 'ERROR') console.error('[ChatFlow] Popup rebuild failed:', event.error);
    if (event.code === 'BUNDLE_END') console.info('[ChatFlow] Popup rebuilt.');
  });

  for (const config of esbuildBundles) {
    const context = await esbuildContext(config);
    esbuildContexts.push(context);
    await context.watch();
  }

  // Vite's Rollup watcher does not always recopy changed public/ assets.
  // Mirror them ourselves, including the Manifest V3 manifest.
  publicWatcher = watchFiles('public', { recursive: true }, () => {
    assetSync = assetSync.then(() => cp('public', 'dist', { recursive: true, force: true }));
    assetSync = assetSync.catch(error => {
      console.error('[ChatFlow] Static asset sync failed:', error);
    });
  });

  console.info('[ChatFlow] Watch mode running. Edit src/ or public/ to rebuild dist/.');
  console.info('[ChatFlow] After changes, reload the extension in chrome://extensions and refresh affected tabs.');
} catch (error) {
  await stop();
  console.error('[ChatFlow] Unable to start watch mode:', error);
  process.exitCode = 1;
}
