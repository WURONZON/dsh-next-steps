#!/usr/bin/env node
/**
 * Host-half self-test for next-steps.
 *
 * Drives the real `apply` with a fake Cordis context, a fake Session log and a
 * fake LLM stream, then reads the result back through the plugin's own
 * `/api/next-steps/state` handler — the same path the browser half polls. No
 * dependency, no network, no Harness process.
 *
 *   node scripts/selftest.mjs
 *
 * Exits non-zero on the first failed check.
 */
import assert from 'node:assert/strict'
import { apply, name } from '../index.js'

const STATE_PATH = '/api/next-steps/state'
const REFRESH_PATH = '/api/next-steps/refresh'

const ANSWER = 'I added the settings page and wired it to the same store as the profile page. '.repeat(2)
const QUESTION = 'Now add the same for the settings page.'

function fakeSession(options = {}) {
  const answer = options.answer ?? ANSWER
  const origin = options.origin ?? 'user'
  const messages = [
    { role: 'user', content: [{ type: 'text', text: QUESTION }] },
    { role: 'assistant', content: [{ type: 'text', text: answer }] },
  ]
  return {
    id: options.id ?? 'session-selftest',
    header: { cwd: options.cwd ?? '/tmp/next-steps-demo', origin },
    deriveMessages: () => messages,
    requestHeader: () => ({ config: { provider: 'fake-provider', model: 'fake-model' } }),
    snapshotEvents: () => [],
  }
}

/** A fake `llm` service: each prepared call streams one plan step's `reply` and `kind`. */
function fakeLlm(reply, kind, plan) {
  const steps = Array.isArray(plan) && plan.length > 0 ? plan : [{ reply, kind }]
  const configs = []
  const systems = []
  let calls = 0
  return {
    configs,
    systems,
    prepareCall(config) {
      const step = steps[Math.min(calls, steps.length - 1)]
      calls += 1
      configs.push(config)
      return Promise.resolve({
        config,
        async *stream(options) {
          systems.push(options.system ?? '')
          if (step.delay !== undefined && step.delay > 0) {
            // A slow call keeps its generation in flight while faster ones settle.
            await new Promise((resolve) => setTimeout(resolve, step.delay))
          }
          if (step.hang === true) {
            // A stream that ignores the abort signal: it never yields a finish
            // chunk, so only the caller's deadline can settle the call.
            yield { type: 'text-delta', text: step.reply ?? 'partial ' }
            await new Promise(() => {})
          }
          const text = step.reply ?? ''
          const size = Math.max(1, Math.ceil(text.length / 3))
          for (let index = 0; index < text.length; index += size) {
            yield { type: 'text-delta', text: text.slice(index, index + size) }
          }
          const finish = step.kind ?? 'stop'
          const failure = step.failure ?? (finish === 'aborted' ? {} : undefined)
          yield { type: 'finish', reason: failure === undefined ? { kind: finish } : { kind: finish, failure } }
        },
      })
    },
  }
}

/**
 * Build the fake context, install the plugin, and return the handles the checks
 * need: the routes it registered, its `session/event` listener and the fake LLM.
 */
function harness(options = {}) {
  const llm = fakeLlm(options.reply ?? '', options.kind ?? 'stop', options.plan)
  const routes = new Map()
  const listeners = []
  const disposers = []
  const scoped = {
    get(service) {
      if (service !== 'connection') return undefined
      return {
        fetch: {
          register(route) {
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        },
      }
    },
    effect(factory) {
      disposers.push(factory())
    },
  }
  const ctx = {
    get(service) {
      if (service === 'llm') return llm
      return undefined
    },
    on(event, handler) {
      listeners.push({ event, handler })
    },
    inject(_services, callback) {
      callback(scoped)
    },
    effect(factory) {
      disposers.push(factory())
    },
    logger: { info() {}, warn() {} },
  }
  apply(ctx, options.config ?? {})
  const session = options.session ?? fakeSession(options)
  const emit = (event, target = session) => {
    for (const listener of listeners) {
      if (listener.event === 'session/event') listener.handler(target, event)
    }
  }
  return {
    llm,
    routes,
    disposers,
    session,
    emit,
    turnEnd(reason = { kind: 'completed' }, turn = 1, target = session) {
      emit({ type: 'turn/end', data: { reason, turn } }, target)
    },
  }
}

async function post(test, path, body) {
  const route = test.routes.get(path)
  assert.ok(route !== undefined, `route ${path} is registered`)
  const request = new Request(`http://next-steps.local${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const response = await route.fetch(request)
  return response.json()
}

const state = (test, sessionId = test.session.id) => post(test, STATE_PATH, { sessionId })
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Poll the state route until this Session's generation settles. */
async function settle(test, sessionId = test.session.id) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const payload = await state(test, sessionId)
    assert.equal(payload.ok, true, 'state route succeeds')
    const entry = payload.value.sessions[0]
    if (entry !== undefined && entry.status !== 'loading') return entry
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('suggestion generation never settled')
}

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

await check('package name is stable', () => {
  assert.equal(name, 'next-steps')
})

await check('a completed turn with a full reply yields cleaned suggestions', async () => {
  const reply = JSON.stringify([
    { label: 'Run the tests', prompt: 'run the tests you just wrote for the settings page' },
    { label: 'Commit and open the PR', prompt: 'commit this and open the PR' },
  ])
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.equal(entry.turn, 1)
  assert.equal(entry.label, 'next-steps-demo')
  assert.deepEqual(entry.suggestions.map((item) => item.label), ['Run the tests', 'Commit and open the PR'])
  assert.equal(entry.error, null)
})

await check('a fenced reply with prose is still understood', async () => {
  const reply = 'Here is the list:\n\n```json\n[{"label":"Run tests","prompt":"run the tests"}]\n```\n'
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.deepEqual(entry.suggestions.map((item) => item.label), ['Run tests'])
})

await check('a reply cut off by max-tokens keeps the complete suggestions', async () => {
  const reply = '[{"label":"Run the tests","prompt":"run the tests you just wrote"},{"label":"Settings page","prompt":"do the same for the sett'
  const test = harness({ reply, kind: 'max-tokens' })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready', 'truncation is not a failure when a suggestion survived')
  assert.equal(entry.error, null)
  assert.equal(entry.suggestions.length, 1)
  assert.equal(entry.suggestions[0].prompt, 'run the tests you just wrote')
})

await check('max-tokens with nothing usable reports the output limit', async () => {
  const test = harness({ reply: '[{"label":"Run the tests","prompt":"run the tes', kind: 'max-tokens' })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'error')
  assert.match(entry.error, /1600-token output limit/)
})

await check('quotes, escapes and nested objects survive parsing', async () => {
  const reply = JSON.stringify([
    { label: 'Say "hi"', prompt: 'print \"hello\" and a backslash \\\\ then stop', meta: { deep: { n: 1 }, list: [1, 2] } },
  ])
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.equal(entry.suggestions.length, 1)
  assert.equal(entry.suggestions[0].label, 'Say "hi"')
  assert.equal(entry.suggestions[0].prompt, 'print "hello" and a backslash \\\\ then stop')
})

await check('a damaged array still recovers the valid entries', async () => {
  const reply = '[{"label":"Run tests","prompt":"run the tests"},{"label":42},{"label":"Commit","prompt":"commit this"}]'
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.deepEqual(entry.suggestions.map((item) => item.label), ['Run tests', 'Commit'])
})

await check('a prose [1] before the array does not hide the suggestions', async () => {
  const reply = 'Next step [1] is this:\n[{"label":"Run tests","prompt":"run the tests"}]'
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.deepEqual(entry.suggestions.map((item) => item.label), ['Run tests'])
})

await check('a markdown link before the array does not hide the suggestions', async () => {
  const reply = 'See [the docs](https://example.com) first:\n[{"label":"Run tests","prompt":"run the tests"}]'
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.deepEqual(entry.suggestions.map((item) => item.label), ['Run tests'])
})

await check('a prose bracket with a cut-off reply still recovers', async () => {
  const reply = 'See [the docs](https://example.com) first:\n[{"label":"Run the tests","prompt":"run the tests you just wrote"},{"label":"Settings page","prompt":"do the same for the sett'
  const test = harness({ reply, kind: 'max-tokens' })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.equal(entry.suggestions.length, 1)
  assert.equal(entry.suggestions[0].prompt, 'run the tests you just wrote')
})

await check('a bracket inside a string value does not start the array', async () => {
  const reply = JSON.stringify([
    { label: 'Inspect the first item', prompt: 'look at array[0] and explain it' },
    { label: 'Commit', prompt: 'commit this' },
  ])
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.equal(entry.suggestions.length, 2)
  assert.equal(entry.suggestions[0].prompt, 'look at array[0] and explain it')
})

await check('a string bracket in a cut-off reply does not hide the closed entry', async () => {
  const reply = '[{"label":"Run the tests","prompt":"run the tests"},{"label":"Inspect","prompt":"look at array[0] and stop'
  const test = harness({ reply, kind: 'max-tokens' })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.equal(entry.suggestions.length, 1)
  assert.equal(entry.suggestions[0].prompt, 'run the tests')
})

await check('trailing prose with a bracket does not hide the suggestions', async () => {
  const reply = JSON.stringify([{ label: 'Run the tests', prompt: 'run the tests' }]) + '\n\nMore options: [1].'
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.deepEqual(entry.suggestions.map((item) => item.label), ['Run the tests'])
})

await check('other non-stop finish kinds are errors', async () => {
  for (const kind of ['error', 'tool-calls', 'aborted']) {
    const test = harness({ reply: 'no json here', kind })
    test.turnEnd()
    const entry = await settle(test)
    assert.equal(entry.status, 'error', `${kind} is a failure`)
    assert.ok(/aborted|stopped early/.test(entry.error), `${kind} names the failure`)
  }
})

await check('a short answer skips the model call entirely', async () => {
  const test = harness({ reply: '[]', answer: 'ok' })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'empty')
  assert.equal(test.llm.configs.length, 0)
})

await check('maxSuggestions caps the list', async () => {
  const reply = JSON.stringify(
    Array.from({ length: 5 }, (_, index) => ({ label: `item ${index}`, prompt: `prompt ${index}` })),
  )
  const test = harness({ reply, config: { maxSuggestions: 2 } })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.suggestions.length, 2)
})

await check('control characters are stripped and tag characters dropped', async () => {
  const reply = JSON.stringify([
    { label: 'Run\u001b[31m tests', prompt: 'run\u0007 the\u001b[31m tests now' },
    { label: 'Hidden', prompt: 'hide\u{e0041} this prompt' },
    { label: 'Commit', prompt: 'commit this' },
  ])
  const test = harness({ reply })
  test.turnEnd()
  const entry = await settle(test)
  assert.deepEqual(entry.suggestions.map((item) => item.label), ['Run tests', 'Commit'])
  assert.equal(entry.suggestions[0].prompt, 'run the tests now')
})

await check('the plugin asks for a bounded output budget', async () => {
  const first = harness({ reply: '[]' })
  first.turnEnd()
  await settle(first)
  assert.equal(first.llm.configs[0].maxTokens, 1600)
  assert.equal(first.llm.configs[0].provider, 'fake-provider')
  assert.equal(first.llm.configs[0].model, 'fake-model')
  assert.match(first.llm.systems[0], /at most 160 characters/)
  assert.match(first.llm.systems[0], /ONLY a JSON array/)
  assert.match(first.llm.systems[0], /up to 3 concrete prompts/)

  const custom = harness({ reply: '[]', config: { maxOutputTokens: 900 } })
  custom.turnEnd()
  await settle(custom)
  assert.equal(custom.llm.configs[0].maxTokens, 900)
})

await check('aborted, blocked and subagent turns are ignored', async () => {
  const aborted = harness({ reply: '[]' })
  aborted.turnEnd({ kind: 'aborted' })
  await tick()
  assert.deepEqual((await state(aborted)).value.sessions, [])
  assert.equal(aborted.llm.configs.length, 0)

  const subagent = harness({ reply: '[]', origin: 'subagent' })
  subagent.turnEnd()
  await tick()
  assert.deepEqual((await state(subagent)).value.sessions, [])
  assert.equal(subagent.llm.configs.length, 0)
})

await check('a disabled plugin tracks nothing', async () => {
  const test = harness({ reply: '[]', config: { enabled: false } })
  test.turnEnd()
  await tick()
  assert.deepEqual((await state(test)).value.sessions, [])
  assert.equal(test.llm.configs.length, 0)
})

await check('the refresh route regenerates and reports failures', async () => {
  const reply = '[{"label":"Run tests","prompt":"run the tests"}]'
  const test = harness({ reply })
  test.turnEnd()
  await settle(test)
  assert.equal(test.llm.configs.length, 1)

  const refreshed = await post(test, REFRESH_PATH, { sessionId: test.session.id })
  assert.equal(refreshed.ok, true)
  assert.equal(refreshed.value.status, 'loading')
  const entry = await settle(test)
  assert.equal(entry.status, 'ready')
  assert.equal(test.llm.configs.length, 2)

  const unknown = await post(test, REFRESH_PATH, { sessionId: 'session-missing' })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.error.code, 'next-steps/unknown-session')

  const badBody = await post(test, STATE_PATH, {})
  assert.equal(badBody.ok, false)
  assert.equal(badBody.error.code, 'next-steps/bad-request')
})

await check('an oversized digest is skipped rather than sent', async () => {
  const test = harness({ reply: '[]', config: { maxInputChars: 50 } })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'empty')
  assert.equal(test.llm.configs.length, 0)
})

await check('a stream that ignores the abort signal settles as a timeout error', async () => {
  const test = harness({ plan: [{ hang: true }], config: { timeoutMs: 25 } })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'error')
  assert.match(entry.error, /timed out/)
  assert.doesNotMatch(entry.error, /aborted/)
})

await check('a timed-out turn does not block the next one', async () => {
  const test = harness({
    plan: [{ hang: true }, { reply: '[{"label":"Run tests","prompt":"run the tests"}]' }],
    config: { timeoutMs: 25 },
  })
  test.turnEnd()
  const first = await settle(test)
  assert.equal(first.status, 'error')
  test.turnEnd({ kind: 'completed' }, 2)
  const second = await settle(test)
  assert.equal(second.status, 'ready')
  assert.deepEqual(second.suggestions.map((item) => item.label), ['Run tests'])
})

await check('the newest session survives the 24-session cap', async () => {
  const test = harness({ plan: [{ reply: '[{"label":"Run tests","prompt":"run the tests"}]' }] })
  const sessions = []
  for (let index = 0; index < 25; index += 1) {
    const session = fakeSession({ id: `session-cap-${String(index).padStart(2, '0')}` })
    sessions.push(session)
    test.turnEnd({ kind: 'completed' }, 1, session)
    await settle(test, session.id)
  }
  const newest = await state(test, sessions[24].id)
  assert.equal(newest.ok, true)
  assert.equal(newest.value.sessions.length, 1)
  assert.equal(newest.value.sessions[0].suggestions.length, 1)
  const oldest = await state(test, sessions[0].id)
  assert.deepEqual(oldest.value.sessions, [])
})

await check('the newest session survives the cap while older turns are in flight', async () => {
  const reply = '[{"label":"Run tests","prompt":"run the tests"}]'
  const slow = { reply, delay: 300 }
  const plan = [{ reply }]
  for (let index = 0; index < 24; index += 1) plan.push(slow)
  const test = harness({ plan })
  for (let index = 0; index < 25; index += 1) {
    const session = fakeSession({ id: `cap-${String(index).padStart(2, '0')}` })
    test.turnEnd({ kind: 'completed' }, 1, session)
  }
  // The 24 older generations are still in flight, so the cap cannot evict them.
  const during = await state(test, 'cap-24')
  assert.equal(during.value.sessions.length, 1)

  // The first generation settles while the rest are still in flight: settling
  // must not evict the Session that just finished.
  await new Promise((resolve) => setTimeout(resolve, 60))
  const first = await state(test, 'cap-00')
  const other = await state(test, 'cap-01')
  assert.equal(first.value.sessions.length, 1)
  assert.equal(first.value.sessions[0].status, 'ready')
  assert.equal(other.value.sessions.length, 1)
  assert.equal(other.value.sessions[0].status, 'loading')

  // Let every generation settle, then add one more Session.
  await settle(test, 'cap-24')
  await tick()
  const next = fakeSession({ id: 'cap-25' })
  test.turnEnd({ kind: 'completed' }, 1, next)
  await settle(test, 'cap-25')

  // Oldest is gone, the newest two stay, and the map falls back to the cap.
  assert.deepEqual((await state(test, 'cap-00')).value.sessions, [])
  assert.equal((await state(test, 'cap-24')).value.sessions.length, 1)
  assert.equal((await state(test, 'cap-25')).value.sessions.length, 1)
  let tracked = 0
  for (let index = 0; index <= 25; index += 1) {
    const entry = await state(test, `cap-${String(index).padStart(2, '0')}`)
    if (entry.value.sessions.length > 0) tracked += 1
  }
  assert.equal(tracked, 24)
})

await check('a settled newest session survives while older turns are still in flight', async () => {
  const reply = '[{"label":"Run tests","prompt":"run the tests"}]'
  const slow = { reply, delay: 200 }
  const plan = []
  for (let index = 0; index < 24; index += 1) plan.push(slow)
  plan.push({ reply })
  const test = harness({ plan })
  for (let index = 0; index < 25; index += 1) {
    const session = fakeSession({ id: `fleet-${String(index).padStart(2, '0')}` })
    test.turnEnd({ kind: 'completed' }, 1, session)
  }
  // The newest generation settles first, while the 24 older ones are in flight.
  await new Promise((resolve) => setTimeout(resolve, 60))
  const newest = await state(test, 'fleet-24')
  assert.equal(newest.value.sessions.length, 1)
  assert.equal(newest.value.sessions[0].status, 'ready')
  assert.equal(newest.value.sessions[0].suggestions.length, 1)
  const oldest = await state(test, 'fleet-00')
  assert.equal(oldest.value.sessions.length, 1)
  assert.equal(oldest.value.sessions[0].status, 'loading')

  // Every generation settles and nothing is pruned during the storm: the map is
  // allowed to sit one entry above the cap until the next remember.
  await settle(test, 'fleet-23')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal((await state(test, 'fleet-24')).value.sessions.length, 1)
  assert.equal((await state(test, 'fleet-24')).value.sessions[0].suggestions.length, 1)
  let tracked = 0
  for (let index = 0; index < 25; index += 1) {
    const entry = await state(test, `fleet-${String(index).padStart(2, '0')}`)
    if (entry.value.sessions.length > 0) tracked += 1
  }
  assert.equal(tracked, 25)

  // The next tracked Session reclaims the excess: the two oldest go, the newest two stay.
  const next = fakeSession({ id: 'fleet-25' })
  test.turnEnd({ kind: 'completed' }, 1, next)
  await settle(test, 'fleet-25')
  assert.deepEqual((await state(test, 'fleet-00')).value.sessions, [])
  assert.deepEqual((await state(test, 'fleet-01')).value.sessions, [])
  assert.equal((await state(test, 'fleet-24')).value.sessions.length, 1)
  assert.equal((await state(test, 'fleet-25')).value.sessions.length, 1)
  tracked = 0
  for (let index = 0; index <= 25; index += 1) {
    const entry = await state(test, `fleet-${String(index).padStart(2, '0')}`)
    if (entry.value.sessions.length > 0) tracked += 1
  }
  assert.equal(tracked, 24)
})

await check('a failed turn clears the previous suggestions', async () => {
  const test = harness({
    plan: [{ reply: '[{"label":"A","prompt":"a"}]' }, { reply: '', kind: 'error' }],
  })
  test.turnEnd()
  const first = await settle(test)
  assert.equal(first.status, 'ready')
  assert.equal(first.suggestions.length, 1)
  test.turnEnd({ kind: 'completed' }, 2)
  const second = await settle(test)
  assert.equal(second.status, 'error')
  assert.equal(typeof second.error, 'string')
  assert.ok(second.error.length > 0)
  assert.equal(second.suggestions.length, 0)
})

await check('a new turn clears the previous suggestions while loading', async () => {
  const test = harness({
    plan: [
      { reply: '[{"label":"A","prompt":"a"}]' },
      { reply: '[{"label":"B","prompt":"b"}]', delay: 200 },
    ],
  })
  test.turnEnd()
  const first = await settle(test)
  assert.equal(first.status, 'ready')
  assert.equal(first.suggestions.length, 1)
  test.turnEnd({ kind: 'completed' }, 2)
  const during = await state(test, test.session.id)
  const entry = during.value.sessions[0]
  assert.equal(entry.status, 'loading')
  assert.equal(entry.suggestions.length, 0)
})

await check('an error finish carries its failure code', async () => {
  const test = harness({
    plan: [{ reply: '', kind: 'error', failure: { message: 'upstream says 429', code: 'RATE_LIMIT' } }],
  })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'error')
  assert.match(entry.error, /RATE_LIMIT/)
  assert.match(entry.error, /rate limit/i)
  assert.doesNotMatch(entry.error, /upstream says 429/)
})

await check('a context-window failure is explained', async () => {
  const test = harness({
    plan: [{ reply: '', kind: 'error', failure: { message: 'too long', code: 'CONTEXT_WINDOW_EXCEEDED' } }],
  })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'error')
  assert.match(entry.error, /context window/i)
  assert.match(entry.error, /CONTEXT_WINDOW_EXCEEDED/)
})

await check('an unknown failure code is still reported verbatim', async () => {
  const test = harness({
    plan: [{ reply: '', kind: 'error', failure: { message: 'weird', code: 'WEIRD_CODE' } }],
  })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'error')
  assert.match(entry.error, /WEIRD_CODE/)
})

await check('a timeout is never reported as an abort', async () => {
  const test = harness({ plan: [{ hang: true }], config: { timeoutMs: 25 } })
  test.turnEnd()
  const entry = await settle(test)
  assert.equal(entry.status, 'error')
  assert.match(entry.error, /timed out/)
  assert.doesNotMatch(entry.error, /aborted/)
})

if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed, ${passed} passed`)
  process.exitCode = 1
} else {
  console.log(`\nall ${passed} checks passed`)
}
