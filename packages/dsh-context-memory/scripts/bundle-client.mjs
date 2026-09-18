import { build } from 'esbuild';
import { resolve } from 'node:path';

// The browser half ships as `lib/memory.web.js` — deliberately not `lib/client.js`,
// which is the compiled host module `src/client.ts`; a name collision would let this
// bundle overwrite a host module the loader imports by path.
await build({
  entryPoints: [resolve('src/client/index.tsx')],
  bundle: true,
  outfile: resolve('lib/memory.web.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  logLevel: 'info',
});
console.log('Client bundle written');
