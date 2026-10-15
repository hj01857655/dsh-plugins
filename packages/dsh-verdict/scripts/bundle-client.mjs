/**
 * Bundle the browser half into the loader's lazy-CJS factory artifact.
 *
 * dsh's client module system loads `./client` exports as CJS factory bundles:
 * the artifact calls `window.__ModuleLoader__.load({ id, factory })` and
 * resolves externals (react here — both are platform module-table rows)
 * through the injected `require`. The workspace's shared tsdown preset is not
 * published, so third-party plugins replicate this exact output shape.
 *
 * @module scripts/bundle-client
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  // Not lib/client.js: that name is the compiled host module (src/client.ts).
  // The browser artifact lives beside it under its own name.
  outfile: 'lib/verdict.web.js',
  sourcemap: true,
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  banner: {
    // The intro vars belong between banner and body; esbuild has no separate
    // intro slot, so they ride the banner like the official artifacts print them.
    js: 'window.__ModuleLoader__.load({ id: "dsh-verdict", factory: (require) => {'
      + '\nvar module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})
