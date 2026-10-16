/**
 * Regression: the stored theme is published when the plugin loads.
 *
 * The client half is bundled by esbuild rather than compiled into `lib/` by tsc,
 * so this test loads the built artifact and skips when it is absent — CI runs
 * `npm run build` before `npm test`.
 *
 * The bug it covers: `apply()` installed the bridge but never called it, so a
 * saved theme only appeared once the user opened Settings. Every restart came up
 * with the host's default palette while localStorage still held the choice.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { getPreset } from '../lib/themes.js'

const BUNDLE = new URL('../lib/theme-studio.web.js', import.meta.url)
const skip = existsSync(fileURLToPath(BUNDLE)) ? false : 'run `npm run build` first'

/**
 * Load the browser bundle once. A second `import` of the same URL is served from
 * the module cache, so the registration happens exactly once per process.
 */
let clientHalf
async function loadClientHalf() {
  if (clientHalf !== undefined) return clientHalf
  let registration
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { __ModuleLoader__: { load: (r) => { registration = r } } },
  })
  try {
    await import(BUNDLE.href)
  } finally {
    delete globalThis.window
  }
  assert.ok(registration !== undefined, 'the bundle must register itself with __ModuleLoader__')
  clientHalf = registration.factory(createRequire(import.meta.url))
  return clientHalf
}

/** A client context that records what the plugin publishes and nothing else. */
function recordingContext() {
  const published = []
  return {
    published,
    ctx: {
      slots: { inject: (_name, register) => { register() }, register: () => undefined },
      locale: { register: () => () => {}, bind: () => (key) => key },
      theme: {
        getTheme: () => ({ fontSize: 14, active: { colorScheme: 'dark' } }),
        overrideTokens: (source, tokens) => { published.push({ source, tokens }); return () => {} },
        setFontSize: () => {},
      },
      effect: (callback) => { callback(); return undefined },
      on: () => undefined,
    },
  }
}

/** Run `apply` with `stored` as this browser's saved preferences. */
async function applyWithStored(stored) {
  const client = await loadClientHalf()
  const { ctx, published } = recordingContext()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key) => (key === 'dsh-theme-studio' && stored !== undefined ? JSON.stringify(stored) : null),
      setItem: () => {},
    },
  })
  try {
    client.apply(ctx)
  } finally {
    delete globalThis.localStorage
  }
  return published
}

test('the stored theme is published at load, before the panel exists', { skip }, async () => {
  const preset = getPreset('tokyo-night')
  const published = await applyWithStored({
    preset: preset.id,
    accentColor: null,
    darkAccentColor: null,
    fontFamily: 'system',
    animations: true,
    customCss: '',
  })
  assert.equal(published.length, 1, 'apply() must publish exactly one layer when it loads')
  assert.equal(published[0].source, 'dsh-theme-studio')
  assert.equal(
    published[0].tokens['--dsw-alias-bg-base']?.dark,
    preset.darkTokens['--dsw-alias-bg-base'],
    'the layer must carry the stored preset, not the host default',
  )
})

test('with nothing stored the layer stays empty', { skip }, async () => {
  const published = await applyWithStored(undefined)
  assert.equal(published.length, 1)
  assert.deepEqual(published[0].tokens, {}, 'no stored choice must paint no tokens')
})
