import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

await build({
  entryPoints: ['src/client/index.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  outfile: 'lib/theme-studio.web.js',
  external: ['react', 'react-dom'],
  logLevel: 'info',
})

console.log('✓ client bundle → lib/theme-studio.web.js')
