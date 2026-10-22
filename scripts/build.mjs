import { build as buildVite } from 'vite';
import { build as buildEsbuild } from 'esbuild';

await buildVite();

await buildEsbuild({
  entryPoints: { background: 'src/background.ts' },
  bundle: true, platform: 'browser', target: 'chrome116',
  format: 'esm', outdir: 'dist', logLevel: 'info',
});

await buildEsbuild({
  entryPoints: {
    'content-chatgpt': 'src/content-chatgpt.ts',
    'content-github': 'src/content-github.ts',
  },
  bundle: true, platform: 'browser', target: 'chrome116',
  format: 'iife', outdir: 'dist', logLevel: 'info',
});
