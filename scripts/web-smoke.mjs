/**
 * ブラウザ／PWA 版のスモークテスト。
 *
 *   npm run build:web && node scripts/web-smoke.mjs [--screenshot shot.png]
 *
 * out/web を簡易 HTTP サーバで配信し、Playwright の Chromium を iPhone 相当
 * （タッチ入力・狭い画面）でエミュレートして開く。デスクトップ版のスモークと同じ
 * サンプルデータを流し込んだうえで、スマホ特有の経路を実際のタップで検査する：
 *   - 起動直後にソフトキーボードが出ていない（入力欄が勝手にフォーカスされない）
 *   - セルをタップすると選択され、もう一度タップすると編集が始まる
 *   - 文字を打って Enter で確定し、キーボードが閉じる
 *   - 長押しでメニューが出る
 *   - 「ファイル」メニューが開く
 *   - Service Worker と manifest（ホーム画面に追加できる条件）
 *
 * Chromium の場所は CHROMIUM_PATH で上書きできる（無ければ Playwright の既定）。
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { chromium, devices } from 'playwright-core'

const ROOT = resolve('out/web')
const BASE = (process.env['WEB_BASE'] ?? '/').replace(/\/?$/, '/')
const PORT = 4173
const args = process.argv.slice(2)
const shotIndex = args.indexOf('--screenshot')
const screenshotPath = shotIndex >= 0 ? args[shotIndex + 1] : null

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.map': 'application/json',
}

/** out/web を BASE の下で配信する（GitHub Pages のサブパス配置と同じ形） */
function startServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(404).end()
      return
    }
    let rel = url.pathname.slice(BASE.length)
    if (rel === '' || rel.endsWith('/')) rel += 'index.html'
    const file = normalize(join(ROOT, rel))
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end()
      return
    }
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('not a file')
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
      res.end(await readFile(file))
    } catch {
      res.writeHead(404).end()
    }
  })
  return new Promise((ok) => server.listen(PORT, '127.0.0.1', () => ok(server)))
}

const fail = (message) => {
  throw new Error(message)
}

/** タッチの長押し（Playwright には無いので CDP で直接送る） */
async function longPress(page, x, y, ms = 700) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(ms)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

async function main() {
  const server = await startServer()
  const browser = await chromium.launch({
    executablePath: process.env['CHROMIUM_PATH'] || undefined,
    args: ['--no-sandbox'],
  })
  try {
    // iPhone 相当の画面とタッチ入力。エンジンは Chromium のまま
    const iphone = devices['iPhone 13']
    const context = await browser.newContext({ ...iphone, locale: 'ja-JP' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto(`http://127.0.0.1:${PORT}${BASE}`, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean(window.__excellaStore), null, { timeout: 15_000 })

    // タッチ端末として認識されていること（以降の検査の前提）
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    if (!coarse) fail('タッチ端末としてエミュレートされていない (pointer: coarse が偽)')

    // PWA の条件：manifest と Service Worker
    const manifest = await page.getAttribute('link[rel="manifest"]', 'href')
    if (!manifest) fail('manifest のリンクが無い')
    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 'unsupported'
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((r) => setTimeout(() => r(null), 10_000)),
      ])
      return reg ? 'ready' : 'timeout'
    })
    if (swState !== 'ready') fail(`Service Worker が登録されない (${swState})`)
    console.log('[web-smoke] manifest と Service Worker を確認しました')

    // サンプルデータ（デスクトップ版スモークと同じ表）
    const total = await page.evaluate(() => {
      const store = window.__excellaStore.getState()
      const rows = [
        ['商品', '単価', '数量', '小計'],
        ['りんご', 180, 12, '=B2*C2'],
        ['みかん', 98, 30, '=B3*C3'],
        ['ぶどう', 540, 4, '=B4*C4'],
        ['合計', '', '', '=SUM(D2:D4)'],
      ]
      rows.forEach((row, r) =>
        row.forEach((value, c) => {
          if (value !== '') store.setCellInput({ row: r, col: c }, String(value))
        }),
      )
      store.setSelection({ row: 0, col: 0 }, { row: 0, col: 3 })
      store.applyStyle({ bold: true, bg: '#E2EFDA', align: 'center' })
      store.setSelection({ row: 1, col: 3 }, { row: 4, col: 3 })
      store.applyStyle({ numFmt: '¥#,##0' })
      store.setSelection({ row: 0, col: 0 }, { row: 4, col: 3 })
      store.applyBorders('inner', { weight: 'thin' })
      store.applyBorders('outer', { weight: 'thick' })
      store.setSelection({ row: 4, col: 3 })
      return store.displayText({ row: 4, col: 3 })
    })
    if (total !== '¥7,260') fail(`合計セルの表示値が違う: ${total}`)
    console.log(`[web-smoke] 合計セルの表示値: ${total}`)

    const isInputFocused = () =>
      page.evaluate(() => document.activeElement?.dataset?.gridInput === 'true')
    if (await isInputFocused())
      fail('起動直後から入力欄にフォーカスがある（キーボードが出てしまう）')

    // セル B7 の画面座標（見出し 46×24、既定の列幅 88、行高 22）
    const cell = await page.evaluate(() => {
      const r = document.querySelector('.grid-scroll').getBoundingClientRect()
      return { x: r.left + 46 + 88 + 44, y: r.top + 24 + 22 * 6 + 11 }
    })
    await page.touchscreen.tap(cell.x, cell.y)
    await page.waitForTimeout(150)
    const anchor = await page.evaluate(() => window.__excellaStore.getState().selection.anchor)
    if (anchor.row !== 6 || anchor.col !== 1)
      fail(`タップで選択されない: ${JSON.stringify(anchor)}`)
    if (await isInputFocused()) fail('選択しただけでキーボードが出る')

    await page.touchscreen.tap(cell.x, cell.y)
    await page.waitForTimeout(150)
    const editing = await page.evaluate(() => Boolean(window.__excellaStore.getState().editing))
    if (!editing) fail('選択中のセルを再タップしても編集が始まらない')
    if (!(await isInputFocused())) fail('編集が始まったのに入力欄にフォーカスが無い')

    await page.keyboard.type('スマホ')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(150)
    const value = await page.evaluate(() =>
      window.__excellaStore.getState().displayValue({ row: 6, col: 1 }),
    )
    if (value !== 'スマホ') fail(`確定した値が違う: ${String(value)}`)
    if (await isInputFocused()) fail('確定後もキーボードが出たまま')
    console.log('[web-smoke] タップ→編集→確定の検査に通りました')

    // 数式の参照選択：`=` を打ってからセルをタップすると、確定ではなく参照が入る
    const other = { x: cell.x + 88, y: cell.y - 22 * 3 }
    await page.touchscreen.tap(other.x, other.y)
    await page.waitForTimeout(150)
    // どのセルに当たったかはアプリに聞く（座標計算を検査側で作り直さない）
    const target = await page.evaluate(() => {
      const a = window.__excellaStore.getState().selection.anchor
      let n = a.col
      let letters = ''
      for (;;) {
        letters = String.fromCharCode(65 + (n % 26)) + letters
        n = Math.floor(n / 26) - 1
        if (n < 0) break
      }
      return letters + (a.row + 1)
    })
    // 空のセルで編集を始める（中身があると `=` が後ろに付いて数式にならない）
    const empty = { x: cell.x, y: cell.y + 22 * 2 }
    await page.touchscreen.tap(empty.x, empty.y)
    await page.waitForTimeout(150)
    await page.touchscreen.tap(empty.x, empty.y) // 再タップで編集開始
    await page.waitForTimeout(150)
    await page.keyboard.type('=')
    await page.waitForTimeout(150)
    await page.touchscreen.tap(other.x, other.y)
    await page.waitForTimeout(150)
    const formula = await page.evaluate(
      () => window.__excellaStore.getState().editing?.text ?? null,
    )
    if (formula !== `=${target}`) {
      fail(`タップで参照が入りません: ${String(formula)}（期待 =${target}）`)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    if (await page.evaluate(() => Boolean(window.__excellaStore.getState().editing))) {
      fail('Escape で数式の編集が取り消せない')
    }
    console.log('[web-smoke] 数式の参照選択（タップ）の検査に通りました')

    // 長押しでメニュー
    await longPress(page, cell.x, cell.y)
    await page.waitForTimeout(150)
    if (!(await page.isVisible('.context-menu'))) fail('長押しでメニューが出ない')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
    if (await page.isVisible('.context-menu')) fail('Escape でメニューが閉じない')
    console.log('[web-smoke] 長押しメニューの検査に通りました')

    // ファイルメニュー
    await page.tap('.file-menu-button')
    await page.waitForTimeout(150)
    const menuText = await page.textContent('.context-menu')
    if (!menuText || !menuText.includes('開く')) fail('ファイルメニューが開かない')
    await page.keyboard.press('Escape')
    console.log('[web-smoke] ファイルメニューの検査に通りました')

    // 横幅がはみ出していない（ページ全体が横スクロールしない）
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    if (overflow > 0) fail(`ページが横にはみ出している (${overflow}px)`)

    if (screenshotPath) {
      await page.evaluate(() => window.__excellaStore.getState().setSelection({ row: 4, col: 3 }))
      await page.waitForTimeout(100)
      await page.screenshot({ path: screenshotPath })
      console.log(`[web-smoke] スクリーンショットを保存しました: ${screenshotPath}`)
    }

    if (errors.length > 0) fail(`ページでエラーが出ています:\n${errors.join('\n')}`)
    console.log('[web-smoke] 正常に動作しました')
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((error) => {
  console.error(`[web-smoke] 失敗: ${error.message ?? error}`)
  process.exit(1)
})
