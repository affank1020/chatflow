import { build as buildVite } from 'vite';
import { build as buildEsbuild } from 'esbuild';
import { esbuildBundles } from './bundles.mjs';

// Production build: Vite clears dist/ once, then esbuild adds the extension scripts.
await buildVite();
for (const config of esbuildBundles) {
  await buildEsbuild(config);
}
