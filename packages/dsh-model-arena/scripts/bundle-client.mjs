import { build } from 'esbuild';
import { resolve } from 'node:path';

const entry = resolve('src/client/index.tsx');
const outfile = resolve('lib/arena.web.js');

await build({
  entryPoints: [entry],
  bundle: true,
  outfile,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
  logLevel: 'info',
});

console.log('Client bundle written to', outfile);
