/**
 * Bundle the browser half into the loader's lazy-CJS factory artifact.
 *
 * The artifact registers through `window.__ModuleLoader__.load({ id, factory })` and
 * resolves externals (react — a platform module-table row) through the injected
 * `require`. Output is `lib/git.web.js`: `lib/client.js` is the compiled host-side
 * module (src/client.ts would collide), so the browser artifact gets its own name.
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
  outfile: 'lib/git.web.js',
  sourcemap: true,
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-git-ops", factory: (require) => {'
      + '\nvar module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})
