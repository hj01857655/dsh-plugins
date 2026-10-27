/**
 * Bundle the browser half into the loader-factory format dsh concatenates.
 *
 * Format contract (PLUGIN-CONTRACT 5): lazy-CJS factory under `window.__ModuleLoader__.load`,
 * `format: 'cjs'`, `jsx: 'automatic'`, react external. A bare ESM bundle breaks the
 * concatenated `<script>` evaluation for every plugin loaded after it.
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
  outfile: 'lib/context-meter.web.js',
  sourcemap: true,
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-context-meter", factory: (require) => {'
      + '\nvar module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})
