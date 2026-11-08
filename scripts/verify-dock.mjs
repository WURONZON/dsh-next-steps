#!/usr/bin/env node
/**
 * Browser-half self-test for next-steps.
 *
 * The browser half is one module-loader bundle: it has no exports and reaches
 * React through the module table, so a plain unit test cannot import it. This
 * script supplies the smallest React and module-loader stand-ins that the
 * bundle actually uses, mounts the composer Dock, and drives it against a fake
 * Host state route and a fake composer snapshot. No browser, no Harness
 * process, no dependency.
 *
 *   node scripts/verify-dock.mjs
 *
 * Exits non-zero when a check fails.
 */
import assert from 'node:assert/strict'

// ---- Minimal React -------------------------------------------------------
// Only the four hooks the bundle calls, with the same observable rules:
// state is compared with Object.is before a re-render, and an effect re-runs
// when its dependency list changes.
let current = null
const sameDeps = (a, b) => a !== undefined && b !== undefined && a.length === b.length && a.every((item, index) => Object.is(item, b[index]))

const React = {
  createElement(type, props, ...children) {
    const next = { ...(props ?? {}) }
    if (children.length === 1) next.children = children[0]
    else if (children.length > 1) next.children = children
    return { type, props: next }
  },
  useState(initial) {
    const instance = current
    const index = instance.cursor++
    if (!(index in instance.hooks)) instance.hooks[index] = typeof initial === 'function' ? initial() : initial
    return [
      instance.hooks[index],
      (value) => {
        const next = typeof value === 'function' ? value(instance.hooks[index]) : value
        if (Object.is(next, instance.hooks[index])) return
        instance.hooks[index] = next
        instance.dirty = true
      },
    ]
  },
  useEffect(run, deps) {
    const instance = current
    const index = instance.cursor++
    const previous = instance.effects[index]
    if (previous === undefined || deps === undefined || !sameDeps(previous.deps, deps)) {
      instance.pending.push({ index, run, deps })
    }
  },
  useRef(initial) {
    const instance = current
    const index = instance.cursor++
    if (!(index in instance.hooks)) instance.hooks[index] = { current: initial }
    return instance.hooks[index]
  },
}

// ---- Load the real browser half ------------------------------------------
let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
}
await import(new URL('../client.js', import.meta.url).href)
assert.ok(captured, 'client.js registered a module definition')

const EN = {}
const seats = {}
const ctx = {
  effect: (factory) => {
    factory()
  },
  locale: {
    register(_namespace, language, dictionary) {
      if (language === 'en') Object.assign(EN, dictionary)
    },
    bind: () => (key) => EN[key] ?? key,
  },
  slots: {
    inject(_name, callback) {
      callback()
    },
    register(seat, component) {
      seats[seat.name] = component
      return () => {}
    },
  },
}
const plugin = captured.factory((id) => {
  if (id === 'react') return React
  throw new Error('unexpected module: ' + id)
})
plugin.apply(ctx)
const Dock = seats['conversation.input.dock']
assert.ok(Dock, 'the dock seat is registered')

// ---- Fake Host and composer ----------------------------------------------
const baseValue = (sessions) => ({ ok: true, value: { enabled: true, minAnswerChars: 80, maxSuggestions: 3, sessions } })
let payload = baseValue([])
const fetchCalls = []
let refreshHandler = async () => ({ ok: true, json: async () => ({ ok: true, value: {} }) })

globalThis.fetch = async (url, init) => {
  fetchCalls.push({ url: String(url), body: init?.body })
  if (String(url).includes('refresh')) return refreshHandler(url, init)
  return { ok: true, json: async () => payload }
}

const inputSnapshot = { phase: 'plain', draft: '', draftRev: 0 }
const drafts = []
const inputActions = { setDraft: (text) => { drafts.push(text) } }

// ---- Renderer ------------------------------------------------------------
let instance = null
let tree = null

function renderOnce() {
  instance.cursor = 0
  instance.pending = []
  current = instance
  tree = Dock({ sessionId: 's1', inputActions, useInput: () => inputSnapshot })
  current = null
}

function runEffects() {
  const pending = instance.pending.slice()
  instance.pending = []
  for (const { index, run, deps } of pending) {
    const previous = instance.effects[index]
    if (previous !== undefined && typeof previous.cleanup === 'function') previous.cleanup()
    instance.effects[index] = { deps, cleanup: run() }
  }
}

/** Re-render until state and effects are quiet. */
async function flush() {
  for (let round = 0; round < 20; round += 1) {
    instance.dirty = false
    renderOnce()
    runEffects()
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!instance.dirty && instance.pending.length === 0) return
  }
}

/** Run every effect cleanup, which also stops the Host poll timer. */
function dispose() {
  if (instance === null) return
  for (const effect of instance.effects) {
    if (effect !== undefined && typeof effect.cleanup === 'function') {
      try {
        effect.cleanup()
      } catch {
        // A cleanup that already ran is fine.
      }
    }
  }
  instance = null
}

function walk(node, found = []) {
  if (node === null || node === undefined || typeof node === 'string' || typeof node === 'number') return found
  if (Array.isArray(node)) {
    for (const child of node) walk(child, found)
    return found
  }
  if (typeof node.type === 'function') return walk(node.type(node.props ?? {}), found)
  found.push(node)
  if (node.props !== undefined && node.props.children !== undefined) walk(node.props.children, found)
  return found
}

const textOf = (node) => {
  if (typeof node === 'string') return node
  if (node === null || node === undefined || node.props === undefined) return ''
  return Array.isArray(node.props.children) ? node.props.children.map(textOf).join('') : textOf(node.props.children)
}
const visible = () => walk(tree).filter((node) => node.type !== 'style')
const texts = () => visible().map(textOf).join(' | ')
const buttons = () => visible().filter((node) => node.type === 'button')
const suggestionChips = () =>
  buttons().filter((button) => {
    const className = String(button.props.className)
    return className.includes('nsx-chip') && !className.includes('dismiss') && !className.includes('nsx-chip-action')
  })
const regenerateButton = () => buttons().find((button) => String(button.props.className).includes('nsx-chip-action'))

const suggestions = [
  { label: 'Run tests', prompt: 'run the tests' },
  { label: 'Commit', prompt: 'commit this' },
]
const ready = (at, items = suggestions) => [
  { sessionId: 's1', label: 'demo', status: 'ready', error: null, turn: 1, at, suggestions: items },
]

async function mount(sessions, draft) {
  dispose()
  drafts.length = 0
  inputSnapshot.draft = draft
  inputSnapshot.draftRev += 1
  payload = baseValue(sessions)
  instance = { hooks: [], effects: [], cursor: 0, pending: [], dirty: false }
  await flush()
}

/** The Host poll runs every 2 s; one round of it settles a scripted change. */
const nextPoll = () => new Promise((resolve) => setTimeout(resolve, 2200))

// ---- Checks --------------------------------------------------------------
let passed = 0
const failures = []

async function check(title, run) {
  try {
    await run()
    passed += 1
    console.log(`ok  ${title}`)
  } catch (error) {
    failures.push({ title, error })
    console.log(`FAIL ${title}`)
    console.log(`     ${error instanceof Error ? error.message : String(error)}`)
  }
}

await check('a non-empty draft asks before replacing it', async () => {
  await mount(ready(100), 'abc')
  assert.ok(texts().includes('next:'), 'chips shown: ' + texts())
  suggestionChips()[0].props.onClick()
  await flush()
  assert.deepEqual(drafts, [], 'nothing written on the first press')
  assert.ok(texts().includes('Replace your draft?'), 'confirm row shown: ' + texts())
  assert.ok(!texts().includes('next:'), 'chips hidden during the confirm')
})

await check('Replace writes the prompt and closes the confirm row', async () => {
  await mount(ready(100), 'abc')
  suggestionChips()[0].props.onClick()
  await flush()
  buttons().find((button) => String(button.props.className).includes('nsx-btn')).props.onClick()
  await flush()
  assert.deepEqual(drafts, ['run the tests'], 'the suggestion becomes the draft')
  assert.ok(!texts().includes('Replace your draft?'), 'confirm row closed')
})

await check('Cancel keeps the draft and restores the chips', async () => {
  await mount(ready(200), 'abc')
  suggestionChips()[0].props.onClick()
  await flush()
  buttons().find((button) => String(button.props.className).includes('dismiss')).props.onClick()
  await flush()
  assert.deepEqual(drafts, [], 'cancel writes nothing')
  assert.ok(texts().includes('next:'), 'chips are back: ' + texts())
})

await check('a whitespace-only draft fills directly', async () => {
  await mount(ready(300), '   ')
  suggestionChips()[0].props.onClick()
  await flush()
  assert.deepEqual(drafts, ['run the tests'], 'no confirm for an empty draft')
})

await check('a new round clears the pending replace', async () => {
  await mount(ready(400), 'abc')
  suggestionChips()[0].props.onClick()
  await flush()
  assert.ok(texts().includes('Replace your draft?'), 'confirm visible first')
  payload = baseValue(ready(500, [{ label: 'New', prompt: 'new prompt' }]))
  await nextPoll()
  await flush()
  assert.ok(!texts().includes('Replace your draft?'), 'confirm cleared: ' + texts())
  assert.ok(texts().includes('next:'), 'new chips shown')
  assert.deepEqual(drafts, [], 'a changed round writes nothing')
})

await check('an error round supersedes the pending replace', async () => {
  await mount(ready(600), 'abc')
  suggestionChips()[0].props.onClick()
  await flush()
  payload = baseValue([{ sessionId: 's1', label: 'demo', status: 'error', error: 'boom', turn: 2, at: 600, suggestions: [] }])
  await nextPoll()
  await flush()
  assert.ok(texts().includes('next steps failed: boom'), 'error band shown: ' + texts())
  assert.ok(!texts().includes('Replace your draft?'), 'no confirm during the error')
})

await check('typing closes the pending replace', async () => {
  await mount(ready(700), 'abc')
  suggestionChips()[0].props.onClick()
  await flush()
  assert.ok(texts().includes('Replace your draft?'), 'confirm visible before typing')
  inputSnapshot.draft = 'abcd'
  inputSnapshot.draftRev += 1
  await flush()
  assert.ok(!texts().includes('Replace your draft?'), 'confirm closed after typing: ' + texts())
  assert.ok(texts().includes('next:'), 'chips are back')
  assert.deepEqual(drafts, [], 'typing closes the confirm without writing')
})

await check('regenerate spins until the poll reports the new round', async () => {
  await mount(ready(800), 'abc')
  fetchCalls.length = 0
  refreshHandler = async () => ({ ok: true, json: async () => ({ ok: true, value: { status: 'loading' } }) })
  assert.ok(regenerateButton(), 'regenerate button present')
  regenerateButton().props.onClick()
  await flush()
  assert.ok(fetchCalls.some((call) => call.url.includes('refresh')), 'refresh route was called')
  assert.ok(texts().includes('Regenerating…'), 'spinner while the request runs: ' + texts())
  assert.equal(regenerateButton().props.disabled, true, 'button disabled while running')
  payload = baseValue([{ sessionId: 's1', label: 'demo', status: 'loading', error: null, turn: 1, at: 800, suggestions: [] }])
  await nextPoll()
  await flush()
  assert.ok(texts().includes('next steps…'), 'loading band after the poll: ' + texts())
  assert.ok(!texts().includes('Regenerating…'), 'the poll clears the spinner')
  payload = baseValue(ready(900, [{ label: 'Fresh', prompt: 'fresh prompt' }]))
  await nextPoll()
  await flush()
  assert.ok(texts().includes('Fresh'), 'new chips after the successful refresh: ' + texts())
})

await check('a failed regenerate shows its error and dismisses', async () => {
  await mount(ready(1000), 'abc')
  refreshHandler = async () => ({ ok: false, status: 500 })
  regenerateButton().props.onClick()
  await flush()
  assert.ok(texts().includes('next steps failed: HTTP 500'), 'refresh error band: ' + texts())
  assert.ok(texts().includes('Regenerate'), 'a retry button is offered')
  buttons().find((button) => String(button.props.className).includes('dismiss')).props.onClick()
  await flush()
  assert.ok(!texts().includes('HTTP 500'), 'the refresh error is dismissed')
  assert.ok(texts().includes('next:'), 'chips are back: ' + texts())
})

await check('typing during an in-flight regenerate keeps the spinner', async () => {
  await mount(ready(1100), 'abc')
  let release
  refreshHandler = () => new Promise((resolve) => { release = () => resolve({ ok: true, json: async () => ({ ok: true, value: {} }) }) })
  regenerateButton().props.onClick()
  await flush()
  assert.ok(texts().includes('Regenerating…'), 'spinner before typing')
  inputSnapshot.draftRev += 1
  await flush()
  assert.ok(texts().includes('Regenerating…'), 'typing must not clear the spinner: ' + texts())
  assert.equal(regenerateButton().props.disabled, true, 'button stays disabled in flight')
  release()
  await flush()
  assert.ok(texts().includes('Regenerating…'), 'success alone does not unlock before the poll')
})

dispose()

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed, ${passed} passed`)
  process.exit(1)
}
console.log(`\nall ${passed} dock checks passed`)
// The bundle under test polls on a timer; dispose() stops it, and the explicit
// exit keeps a stray timer from holding a CI job open.
process.exit(0)
