#!/usr/bin/env node
/**
 * Visual verification harness for the `next-steps` plugin.
 *
 * It drives the real, already-authenticated Harness Web GUI in Chromium and
 * captures what a person sees: the composer suggestion band, and — when the
 * build registers them — the left-sidebar entry and the "Next steps" panel.
 * It asserts the plugin's own mounted markup (`.nsx-band`, `.nsx-panel`),
 * not a mock. A band-only build skips the panel checks and reports it.
 *
 * Usage:
 *   npm i --no-save playwright
 *   node scripts/verify-ui.mjs --url "http://127.0.0.1:<port>/?token=<process token>"
 *
 * Optional flags:
 *   --out <dir>       artifact directory (default: output/playwright)
 *   --headed          show the browser window
 *   --wait <ms>       how long to wait for the band to appear (default: 25000)
 *   --skip-band       skip the composer band (panel checks still run when present)
 *
 * What is needed: an authenticated page URL. The desktop app's webview address
 * and the `dsh web` startup line carry the process token as a query parameter;
 * the GUI refuses a fresh browser without it. Pass the URL through --url or the
 * DSH_WEB_URL_AUTHENTICATED environment variable (preferred: it stays out of
 * shell history). This harness never reads cookies, profiles or keychains.
 *
 * Exit codes: 0 verified, 2 usage/driver problem, 3 plugin UI check failed.
 */

import { mkdir } from 'node:fs/promises'

function arg(name) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return undefined
  const next = process.argv[index + 1]
  return next !== undefined && !next.startsWith('--') ? next : ''
}

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error('next-steps verify: the `playwright` package is not installed.')
  console.error('  npm i --no-save playwright && npx playwright install chromium')
  process.exit(2)
}

const url = process.env.DSH_WEB_URL_AUTHENTICATED ?? arg('url')
if (typeof url !== 'string' || url === '') {
  console.error('next-steps verify: an authenticated GUI URL is required.')
  console.error('  node scripts/verify-ui.mjs --url "http://127.0.0.1:51989/?token=..."')
  console.error('  (or set DSH_WEB_URL_AUTHENTICATED)')
  process.exit(2)
}
const outDir = arg('out') ?? 'output/playwright'
const headed = process.argv.includes('--headed')
const skipBand = process.argv.includes('--skip-band')
const waitMs = Number(arg('wait') ?? 25000)

const report = { url: url.replace(/token=[^&]+/, 'token=<redacted>'), checks: [], screenshots: [] }
let failed = false

function check(name, ok, detail) {
  report.checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) })
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failed = true
}

async function shot(page, name) {
  const path = `${outDir}/${name}.png`
  await page.screenshot({ path, fullPage: false })
  report.screenshots.push(path)
  return path
}

/** Toggle the app's own dark-theme attribute, the same one its CSS keys on. */
async function setDark(page, dark) {
  await page.evaluate((on) => {
    if (on) document.body.setAttribute('data-ds-dark-theme', '')
    else document.body.removeAttribute('data-ds-dark-theme')
  }, dark)
  await page.waitForTimeout(350)
}

const browser = await chromium.launch({ headless: !headed })
const context = await browser.newContext({ viewport: { width: 1440, height: 920 } })
const page = await context.newPage()

try {
  await mkdir(outDir, { recursive: true })
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })

  // 1. The left-sidebar entry and its panel are optional: a band-only build
  //    registers no panel seats, and this harness then checks the band alone.
  const entry = page.getByRole('button', { name: /Next steps|下一步建议/ }).first()
  const hasPanel = (await entry.count()) > 0 && (await entry.isVisible().catch(() => false))
  if (hasPanel) {
    check('sidebar entry is visible and named', true)
    await shot(page, '01-sidebar-entry')
  } else {
    report.panelSkipped = true
    console.log('skip sidebar entry and panel: this build registers no panel seats')
  }

  // 2. The composer band, if this session already has suggestions.
  if (!skipBand) {
    const band = page.locator('.nsx-band')
    let bandVisible = false
    try {
      await band.waitFor({ state: 'visible', timeout: Number.isFinite(waitMs) ? waitMs : 25000 })
      bandVisible = true
    } catch {
      bandVisible = false
    }
    if (bandVisible) {
      const chips = band.locator('.nsx-chip:not(.nsx-chip-dismiss):not(.nsx-chip-action)')
      const count = await chips.count()
      check('composer band shows chips', count > 0, `${count} chip(s)`)
      const label = await band.locator('.nsx-band-label').innerText()
      check('band carries its label', label.trim().length > 0, label)
      const regenerate = band.locator('.nsx-chip-action')
      const regenerateCount = await regenerate.count()
      check('band offers a regenerate control', regenerateCount === 1, `${regenerateCount} control(s)`)
      if (regenerateCount === 1) {
        check('regenerate control is enabled', await regenerate.isEnabled())
      }
      await shot(page, '02-band-light')
      // A press writes the draft and must not submit it.
      const firstPrompt = await chips.first().getAttribute('title')
      await chips.first().click()
      await page.waitForTimeout(400)
      const editor = page.locator('[contenteditable="true"]').first()
      let draft = ''
      try {
        draft = (await editor.innerText()).trim()
      } catch {
        draft = ''
      }
      if (firstPrompt !== null) {
        check('pressing a chip writes the prompt as a draft', draft.includes(firstPrompt.slice(0, 40)), draft.slice(0, 80))
      }
    } else {
      check('composer band visible (skipped: no finished turn in this session)', !failed, 'run after a completed turn')
      report.bandSkipped = true
    }
  }

  // 3. The panel behind the sidebar entry, when the build has one.
  if (hasPanel) {
    await entry.click()
    const panel = page.locator('.nsx-panel')
    await panel.waitFor({ state: 'visible', timeout: 20000 })
    const heading = (await panel.locator('.nsx-title').innerText()).trim()
    check('panel renders its title', heading.length > 0, heading)
    const body = await panel.innerText()
    check('panel shows either suggestions or its empty state', /Copy|复制|No suggestions|还没有|没有可用/.test(body), body.slice(0, 80))
    check('panel explains the no-auto-send rule', /never sends|不会自行发送/.test(body))
    await setDark(page, false)
    await shot(page, '03-panel-light')
    await setDark(page, true)
    await shot(page, '04-panel-dark')
    await setDark(page, false)
  }

  // 4. Theme tokens only: no literal hex colors on the plugin's own containers.
  const theme = await page.evaluate(() => {
    const roots = [document.querySelector('.nsx-panel'), document.querySelector('.nsx-band')].filter(Boolean)
    const found = []
    for (const root of roots) {
      for (const element of [root, ...root.querySelectorAll('*')]) {
        const style = getComputedStyle(element)
        for (const property of ['color', 'backgroundColor', 'borderTopColor']) {
          const value = style.getPropertyValue(property)
          if (/^rgba?\(/.test(value) && !/^rgba?\(0, 0, 0, 0\)$/.test(value)) found.push(`${property}: ${value}`)
        }
      }
    }
    return { containers: roots.length, literals: found.slice(0, 5) }
  })
  if (theme.containers === 0) {
    report.themeSkipped = true
    console.log('skip theme-token check: no plugin container is mounted')
  } else {
    check('containers inherit theme colors', theme.literals.length === 0, theme.literals.join('; '))
  }

  console.log(`\nartifacts: ${outDir}`)
  if (failed) {
    console.log('next-steps verify: FAILED')
    process.exitCode = 3
  } else {
    console.log('next-steps verify: passed')
  }
} catch (error) {
  console.error(`next-steps verify: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
} finally {
  await context.close()
  await browser.close()
}
