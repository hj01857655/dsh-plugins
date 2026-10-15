/**
 * Bundle the browser half into the loader's lazy-CJS factory artifact.
 *
 * dsh's client module system loads the `./client` export as a CJS factory
 * bundle: the artifact must call `window.__ModuleLoader__.load({ id, factory })`
 * and resolve externals (react here — a platform module-table row) through the
 * injected `require`.
 *
 * A plain ESM bundle loads without ever registering, and the loader reports
 * `Cannot use import statement outside a module` — which aborts the WHOLE plugin
 * bootstrap, not just this plugin's page. That is what the first published build
 * of this file did; `dsh plugin add` accepts it happily and the failure only
 * appears when you open the web UI.
 *
 * @module scripts/bundle-client
 */

import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  // Not lib/client.js: that name is the compiled host module (src/client.ts).
  // The browser artifact lives beside it under its own name.
  outfile: 'lib/theme-studio.web.js',
  sourcemap: true,
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  banner: {
    // The intro vars belong between banner and body; esbuild has no separate
    // intro slot, so they ride the banner like the official artifacts print them.
    js: 'window.__ModuleLoader__.load({ id: "dsh-theme-studio", factory: (require) => {'
      + '\nvar module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})

console.log('✓ client bundle → lib/theme-studio.web.js')
