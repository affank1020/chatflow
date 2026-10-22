// Shared esbuild configuration for production builds and watch mode.
// Content scripts must stay classic scripts: Chrome does not support ESM imports there.
export const esbuildBundles = [
  {
    entryPoints: { background: 'src/background.ts' },
    bundle: true,
    platform: 'browser',
    target: 'chrome116',
    format: 'esm',
    outdir: 'dist',
    logLevel: 'info',
  },
  {
    entryPoints: {
      'content-chatgpt': 'src/content-chatgpt.ts',
      'content-github': 'src/content-github.ts',
    },
    bundle: true,
    platform: 'browser',
    target: 'chrome116',
    format: 'iife',
    outdir: 'dist',
    logLevel: 'info',
  },
];
