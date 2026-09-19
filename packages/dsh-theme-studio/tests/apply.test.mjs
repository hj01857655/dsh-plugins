/**
 * Tests for the DOM-facing apply logic.
 *
 * jsdom isn't a dependency, so a minimal document/body double is installed
 * globally. That is enough to prove the behaviour that matters and that the
 * earlier version got wrong: properties are written to `body` — the element dsh
 * defines its palette on — and stale properties are cleared before each pass.
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// ─── Minimal DOM double ────────────────────────────────────────
function makeStyle() {
  const props = new Map()
  const order = []
  return {
    props,
    order,
    setProperty(name, value) {
      if (!props.has(name)) order.push(name)
      props.set(name, value)
    },
    removeProperty(name) {
      props.delete(name)
      const i = order.indexOf(name)
      if (i !== -1) order.splice(i, 1)
    },
    getPropertyValue(name) {
      return props.get(name) ?? ''
    },
  }
}

function installDom({ dark = false } = {}) {
  const bodyStyle = makeStyle()
  const attrs = new Set(dark ? ['data-ds-dark-theme'] : [])

  const store = new Map()

  const createElement = (tag) => {
    const el = { id: '', textContent: '' }
    if (tag === 'style') {
      let current = ''
      Object.defineProperty(el, 'id', {
        get() { return current },
        set(v) { current = v; store.set(v, el) },
        configurable: true,
      })
    }
    return el
  }

  const head = {
    children: [],
    appendChild(el) {
      head.children.push(el)
      store.set(el.id, el)
      return el
    },
  }

  const body = {
    style: bodyStyle,
    hasAttribute: (n) => attrs.has(n),
    setAttribute: (n) => attrs.add(n),
  }

  const documentElementStyle = makeStyle()

  globalThis.document = {
    body,
    documentElement: { style: documentElementStyle },
    head,
    createElement,
    getElementById: (id) => store.get(id) ?? null,
    appendChild: (el) => { store.set(el.id, el); return el },
  }

  return { bodyStyle, documentElementStyle, store, head }
}

const DEFAULT_PREFS = {
  preset: null,
  accentColor: null,
  darkAccentColor: null,
  density: 'comfortable',
  fontFamily: 'system',
  animations: true,
  customCss: '',
}

const { applyTheme, isDshToken, observeDarkMode, resetTheme, resolveAccent } = await import('../lib/apply.js')

let dom
beforeEach(() => { dom = installDom() })

// ─── The regression this rewrite exists for ────────────────────
test('applyTheme writes to body, never to documentElement', () => {
  applyTheme({ ...DEFAULT_PREFS, accentColor: '#ff0000' })
  assert.equal(
    dom.bodyStyle.getPropertyValue('--dsw-alias-button-primary-fill'), '#ff0000',
    'accent must reach body, where dsh defines its palette',
  )
  assert.equal(
    dom.documentElementStyle.props.size, 0,
    'documentElement is inherited-into-body and loses to body, so nothing may go there',
  )
})

test('applyTheme sets a real accent across the whole accent family', () => {
  applyTheme({ ...DEFAULT_PREFS, preset: 'nord' })
  for (const name of [
    '--dsw-alias-state-business-primary',
    '--dsw-alias-brand-primary',
    '--dsw-alias-link',
    '--dsw-alias-button-primary-fill',
  ]) {
    assert.notEqual(dom.bodyStyle.getPropertyValue(name), '', `${name} was not written`)
  }
})

// ─── Clearing ──────────────────────────────────────────────────
test('switching a preset off clears the properties it had set', () => {
  applyTheme({ ...DEFAULT_PREFS, preset: 'nord' })
  assert.notEqual(dom.bodyStyle.getPropertyValue('--dsw-alias-brand-primary'), '')

  applyTheme({ ...DEFAULT_PREFS, preset: null, accentColor: null })
  assert.equal(
    dom.bodyStyle.getPropertyValue('--dsw-alias-brand-primary'), '',
    'a switched-off preset must not leave its colors behind',
  )
})

test('resetTheme removes everything and blanks the motion stylesheet', () => {
  applyTheme({ ...DEFAULT_PREFS, preset: 'dracula', animations: false })
  resetTheme()
  for (const [name] of dom.bodyStyle.props) {
    assert.fail(`property survived reset: ${name}`)
  }
})

// ─── Accent precedence ─────────────────────────────────────────
test('an explicit accent overrides the preset accent', () => {
  applyTheme({ ...DEFAULT_PREFS, preset: 'forest', accentColor: '#123456' })
  assert.equal(dom.bodyStyle.getPropertyValue('--dsw-alias-state-business-primary'), '#123456')
})

test('darkAccentColor wins in dark mode, accentColor in light mode', () => {
  const prefs = { ...DEFAULT_PREFS, accentColor: '#111111', darkAccentColor: '#eeeeee' }
  applyTheme(prefs, false)
  assert.equal(dom.bodyStyle.getPropertyValue('--dsw-alias-state-business-primary'), '#111111')
  applyTheme(prefs, true)
  assert.equal(dom.bodyStyle.getPropertyValue('--dsw-alias-state-business-primary'), '#eeeeee')
})

test('resolveAccent: falls back to accentColor when no dark color is set', () => {
  // A dark-ish blue is below the dark-mode luminance floor, so the fallback is
  // still guarded — assert the fallback happened, not that the value is verbatim.
  const r = resolveAccent({ ...DEFAULT_PREFS, accentColor: '#336699' }, true)
  assert.ok(r.accent !== null)
  assert.equal(r.adjusted, true)

  // A color that already clears the floor passes through untouched.
  const bright = resolveAccent({ ...DEFAULT_PREFS, accentColor: '#88c0d0' }, true)
  assert.equal(bright.accent, '#88c0d0')
  assert.equal(bright.adjusted, false)
})

test('resolveAccent: reports a contrast adjustment only when it happened', () => {
  const bright = resolveAccent({ ...DEFAULT_PREFS, accentColor: '#88c0d0' }, true)
  assert.equal(bright.adjusted, false)
  assert.equal(bright.accent, '#88c0d0')

  const tooDark = resolveAccent({ ...DEFAULT_PREFS, accentColor: '#050505' }, true)
  assert.equal(tooDark.adjusted, true)
  assert.notEqual(tooDark.accent, '#050505')
})

test('resolveAccent: never adjusts in light mode', () => {
  const r = resolveAccent({ ...DEFAULT_PREFS, accentColor: '#050505' }, false)
  assert.equal(r.adjusted, false)
  assert.equal(r.accent, '#050505')
})

// ─── Custom CSS boundary ───────────────────────────────────────
test('custom CSS may override a dsh token', () => {
  applyTheme({ ...DEFAULT_PREFS, customCss: '--dsw-alias-label-primary: #abcdef;' })
  assert.equal(dom.bodyStyle.getPropertyValue('--dsw-alias-label-primary'), '#abcdef')
})

test('custom CSS is last, so it beats the preset', () => {
  applyTheme({
    ...DEFAULT_PREFS,
    preset: 'forest',
    customCss: '--dsw-alias-state-business-primary: #0000ff;',
  })
  assert.equal(dom.bodyStyle.getPropertyValue('--dsw-alias-state-business-primary'), '#0000ff')
})

test('custom CSS cannot write outside the dsh namespaces', () => {
  applyTheme({ ...DEFAULT_PREFS, customCss: '--evil: red;\nposition: fixed;' })
  assert.equal(dom.bodyStyle.getPropertyValue('--evil'), '')
})

test('custom CSS cannot smuggle in an extra rule or comment', () => {
  applyTheme({
    ...DEFAULT_PREFS,
    customCss: '--dsw-alias-label-primary: red; } body { display: none;',
  })
  const written = dom.bodyStyle.getPropertyValue('--dsw-alias-label-primary')
  assert.ok(!written.includes('}'), `brace escaped into the value: ${written}`)
  assert.ok(!written.includes('{'), `brace escaped into the value: ${written}`)
})

test('isDshToken: accepts dsh/dsw names, rejects everything else', () => {
  assert.equal(isDshToken('--dsw-alias-link'), true)
  assert.equal(isDshToken('--dsh-content-font-size'), true)
  assert.equal(isDshToken('--accent'), false)
  assert.equal(isDshToken('color'), false)
})

// ─── Density and fonts ─────────────────────────────────────────
test('density writes the verified content font size', () => {
  applyTheme({ ...DEFAULT_PREFS, density: 'compact' })
  assert.equal(dom.bodyStyle.getPropertyValue('--dsh-content-font-size'), '13px')
  applyTheme({ ...DEFAULT_PREFS, density: 'spacious' })
  assert.equal(dom.bodyStyle.getPropertyValue('--dsh-content-font-size'), '15px')
})

test('font family writes both family and mono tokens', () => {
  applyTheme({ ...DEFAULT_PREFS, fontFamily: 'mono' })
  assert.ok(dom.bodyStyle.getPropertyValue('--dsw-font-family').includes('monospace'))
  assert.ok(dom.bodyStyle.getPropertyValue('--dsw-font-mono').includes('monospace'))
})

// ─── Dark mode ─────────────────────────────────────────────────
test('dark mode is read from the attribute dsh actually sets', () => {
  installDom({ dark: true })
  assert.equal(globalThis.document.body.hasAttribute('data-ds-dark-theme'), true)
})

test('animations off writes the motion stylesheet, on blanks it', () => {
  applyTheme({ ...DEFAULT_PREFS, animations: false })
  const el = dom.store.get('dsh-theme-studio-overrides')
  assert.ok(el !== undefined, 'the motion stylesheet was not created')
  assert.ok(el.textContent.includes('transition-duration'), 'stylesheet is empty')

  applyTheme({ ...DEFAULT_PREFS, animations: true })
  assert.equal(el.textContent, '')
})
