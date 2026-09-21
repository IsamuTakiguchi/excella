import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openFileInWindow, registerIpcHandlers, setMainWindow } from './ipc'
import { buildMenu } from './menu'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** `--smoke` 付きで起動されたら、ウィンドウを表示して数秒で終了する（CI/ヘッドレス確認用） */
const SMOKE = process.argv.includes('--smoke')

const OPENABLE = /\.(xlsx|csv|tsv)$/i

/** コマンドライン引数から、開くべきファイルのパスを拾う（Windows / Linux の関連付け） */
function fileFromArgv(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue
    if (OPENABLE.test(arg) && existsSync(arg)) return resolve(arg)
  }
  return null
}

/** macOS は open-file イベントで届く。ready 前に来ることがあるので溜めておく */
let pendingFile: string | null = null

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  pendingFile = filePath
  if (app.isReady()) void openFileInWindow(filePath)
})

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: false,
    title: 'Excella',
    backgroundColor: '#f3f3f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

void app.whenReady().then(() => {
  const win = createWindow()
  setMainWindow(win)
  registerIpcHandlers()
  buildMenu(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const next = createWindow()
      setMainWindow(next)
      buildMenu(next)
    }
  })

  if (SMOKE) {
    win.webContents.once('did-finish-load', () => {
      void runSmoke(win)
    })
  } else {
    const initial = pendingFile ?? fileFromArgv(process.argv)
    if (initial) {
      win.webContents.once('did-finish-load', () => {
        pendingFile = null
        void openFileInWindow(initial)
      })
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/**
 * ヘッドレス環境でも「実際に描画されたか」を確かめるための自動実行。
 * サンプルデータを流し込み、`--screenshot <path>` が渡されていれば PNG を書き出す。
 */
async function runSmoke(win: BrowserWindow): Promise<void> {
  // ファイルを指定して起動された場合は、関連付け経由と同じ経路で開いて確認する
  const target = fileFromArgv(process.argv)
  if (target) {
    await openFileInWindow(target)
    await new Promise((resolve) => setTimeout(resolve, 800))
    const name = await win.webContents.executeJavaScript(
      'window.__excellaStore.getState().fileName',
    )
    console.log(`[smoke] 開いたファイル: ${String(name)}`)
    await captureIfRequested(win)
    app.exit(0)
    return
  }

  const seed = `
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
    store.setSelection({ row: 4, col: 0 }, { row: 4, col: 3 })
    store.applyStyle({ bold: true })
    // 結合セルの見出しを作る
    store.setCellInput({ row: 6, col: 0 }, '結合したタイトル行')
    store.setSelection({ row: 6, col: 0 }, { row: 7, col: 3 })
    store.toggleMerge()
    store.applyStyle({ bold: true, bg: '#FFF3BF', align: 'center' })

    // 表に罫線を引く（外枠は太線、内側は細線）
    store.setSelection({ row: 0, col: 0 }, { row: 4, col: 3 })
    store.applyBorders('inner', { weight: 'thin' })
    store.applyBorders('outer', { weight: 'thick' })
    // 見出し行の下だけ色付きの中線にする
    store.setSelection({ row: 0, col: 0 }, { row: 0, col: 3 })
    store.applyBorders('bottom', { weight: 'medium', color: '#107C41' })

    // 見出し行を 1 行だけ固定し、合計セルを選んだ状態にする
    store.setSelection({ row: 1, col: 0 })
    store.toggleFreeze()
    store.setSelection({ row: 4, col: 3 })

    store.displayText({ row: 4, col: 3 })
  `
  try {
    const total = await win.webContents.executeJavaScript(seed)
    console.log(`[smoke] 合計セルの表示値: ${String(total)}`)
  } catch (error) {
    console.error('[smoke] サンプルデータの投入に失敗しました', error)
    app.exit(1)
    return
  }

  if (!(await checkIme(win))) {
    app.exit(1)
    return
  }
  if (!(await checkClickAndType(win))) {
    app.exit(1)
    return
  }
  if (!(await checkPointMode(win))) {
    app.exit(1)
    return
  }

  await captureIfRequested(win)
  console.log('[smoke] 正常に描画できました')
  app.exit(0)
}

/**
 * 日本語入力（IME）が壊れていないかを確かめる。
 * 変換確定の Enter でセルまで確定してしまう退行は実際に起きたので、
 * composition イベントを直接流して毎回検査する。
 */
async function checkIme(win: BrowserWindow): Promise<boolean> {
  const script = `
    (async () => {
      const store = () => window.__excellaStore.getState()
      const input = document.querySelector('[data-grid-input]')
      if (!input) return 'FAIL: 入力欄が無い'
      const tick = () => new Promise((r) => setTimeout(r, 30))
      const fireInput = () => input.dispatchEvent(new InputEvent('input', { bubbles: true }))

      // まずスクロールしていない状態で、入力欄がセルの上に重なるかを見る
      // （オーバーレイがスクロール内容の後ろへ流れる退行の検知）
      store().setSelection({ row: 0, col: 0 })
      store().beginEdit({ row: 0, col: 0 })
      await tick()
      const box = input.getBoundingClientRect()
      const grid = document.querySelector('.grid-scroll').getBoundingClientRect()
      store().cancelEdit()
      if (box.top < grid.top || box.top > grid.top + 80) {
        return 'FAIL: 入力欄がセルの位置に無い (top=' + Math.round(box.top - grid.top) + ')'
      }

      store().setSelection({ row: 40, col: 0 })
      await tick()
      if (document.activeElement !== input) return 'FAIL: 入力欄にフォーカスが無い'

      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      input.value = 'にほんご'
      fireInput()
      await tick()
      if (!store().editing) return 'FAIL: 変換開始で編集モードにならない'

      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
      )
      await tick()
      if (!store().editing) return 'FAIL: 変換確定の Enter でセルまで確定してしまう'

      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
      input.value = '日本語'
      fireInput()
      await tick()
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: false }),
      )
      await tick()
      if (store().displayValue({ row: 40, col: 0 }) !== '日本語') return 'FAIL: 確定した値が違う'
      if (store().editing) return 'FAIL: 確定後も編集モードのまま'

      // 後片付け：検査で入れた値と選択位置を元へ戻す
      store().undo()
      store().setSelection({ row: 4, col: 3 })
      await tick()
      // 検査でスクロールしたぶんを戻す（このあとのスクリーンショット用）
      document.querySelector('.grid-scroll').scrollTo({ top: 0, left: 0 })
      await tick()
      return 'OK'
    })()
  `
  try {
    const result = String(await win.webContents.executeJavaScript(script))
    if (result !== 'OK') {
      console.error(`[smoke] 日本語入力の検査に失敗: ${result}`)
      return false
    }
    console.log('[smoke] 日本語入力（IME）の検査に通りました')
    return true
  } catch (error) {
    console.error('[smoke] 日本語入力の検査が例外で落ちました', error)
    return false
  }
}

/**
 * 本物のマウス操作とキー入力で「クリックして打てる」ことを確かめる。
 * executeJavaScript からの疑似イベントではブラウザの既定動作（クリック先への
 * フォーカス移動）が起きないため、sendInputEvent で Chromium の入力経路を通す。
 * 実際に「クリックでセルは選べるが入力できない」退行が起きたので毎回検査する。
 */
async function checkClickAndType(win: BrowserWindow): Promise<boolean> {
  const wc = win.webContents
  const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
  const mouseClick = async (x: number, y: number) => {
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    await tick(40)
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    await tick()
  }
  const typeChar = async (ch: string) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode: ch })
    wc.sendInputEvent({ type: 'char', keyCode: ch })
    wc.sendInputEvent({ type: 'keyUp', keyCode: ch })
    await tick()
  }
  const pressEscape = async () => {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await tick()
  }
  const state = (expr: string) =>
    wc.executeJavaScript(`(() => { const s = window.__excellaStore.getState(); return ${expr} })()`)

  try {
    win.focus()
    // 何も無いセル（K30 あたり）の画面座標を求めてクリック
    const cell = (await wc.executeJavaScript(`
      (() => {
        const r = document.querySelector('.grid-scroll').getBoundingClientRect()
        return { x: Math.round(r.left + 46 + 88 * 10 + 40), y: Math.round(r.top + 24 + 22 * 12 + 11) }
      })()
    `)) as { x: number; y: number }
    await mouseClick(cell.x, cell.y)

    const focused = await wc.executeJavaScript(
      `document.activeElement && document.activeElement.dataset.gridInput === 'true'`,
    )
    if (!focused) {
      console.error('[smoke] クリック後に入力欄からフォーカスが外れています')
      return false
    }

    await typeChar('x')
    if ((await state('s.editing && s.editing.text')) !== 'x') {
      console.error('[smoke] クリック後のキー入力がセルに届いていません')
      return false
    }
    await pressEscape()

    // ツールバーのボタンを押した後も打てること（ボタンがフォーカスを奪わない）
    const bold = (await wc.executeJavaScript(`
      (() => {
        const b = document.querySelector('button[title^="太字"]')
        const r = b.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })()
    `)) as { x: number; y: number }
    await mouseClick(bold.x, bold.y)
    await typeChar('y')
    if ((await state('s.editing && s.editing.text')) !== 'y') {
      console.error('[smoke] ツールバーのボタンを押した後にキー入力が届きません')
      return false
    }
    await pressEscape()
    // 太字の切り替えを戻しておく
    await wc.executeJavaScript(`window.__excellaStore.getState().undo()`)

    console.log('[smoke] クリック→入力の検査に通りました')
    return true
  } catch (error) {
    console.error('[smoke] クリック→入力の検査が例外で落ちました', error)
    return false
  }
}

/**
 * 数式の参照選択（ポイントモード）を本物の入力で確かめる。
 * `=` を打ってから矢印キーとクリックでセルを選び、計算結果まで見る。
 * 矢印キーは「確定して移動」と「参照を選ぶ」で意味が変わるため、退行しやすい。
 */
async function checkPointMode(win: BrowserWindow): Promise<boolean> {
  const wc = win.webContents
  const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
  const key = async (keyCode: string) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode })
    wc.sendInputEvent({ type: 'keyUp', keyCode })
    await tick()
  }
  const typeChar = async (ch: string) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode: ch })
    wc.sendInputEvent({ type: 'char', keyCode: ch })
    wc.sendInputEvent({ type: 'keyUp', keyCode: ch })
    await tick()
  }
  const mouseClick = async (x: number, y: number) => {
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    await tick(40)
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    await tick()
  }
  const state = (expr: string) =>
    wc.executeJavaScript(`(() => { const s = window.__excellaStore.getState(); return ${expr} })()`)

  try {
    win.focus()

    // どの座標がどのセルに当たるかは、先にふつうのクリックで確かめておく。
    // 座標計算を検査側で作り直すと固定ペインなどでずれるので、
    // 「同じ座標をクリックしたら、選択されたのと同じセルが参照されること」を見る
    const point = (await wc.executeJavaScript(`
      (() => {
        const r = document.querySelector('.grid-scroll').getBoundingClientRect()
        return { x: Math.round(r.left + r.width * 0.4), y: Math.round(r.top + r.height * 0.5) }
      })()
    `)) as { x: number; y: number }
    await mouseClick(point.x, point.y)
    // 1 行で書くのは、state() が `return <式>` に埋め込むため。
    // 改行を挟むと return の直後でセミコロンが補われて undefined になる
    const target = (await state(
      `((a) => { let n = a.col, letters = ''; for (;;) { letters = String.fromCharCode(65 + (n % 26)) + letters; n = Math.floor(n / 26) - 1; if (n < 0) break } return letters + (a.row + 1) })(s.selection.anchor)`,
    )) as string

    // 空いているセル（F10）を選んでから `=` を打つ
    await wc.executeJavaScript(`window.__excellaStore.getState().setSelection({ row: 9, col: 5 })`)
    await tick()
    await typeChar('=')
    if ((await state('s.editing && s.editing.text')) !== '=') {
      console.error('[smoke] = を打っても編集が始まりません')
      return false
    }

    // 上矢印で 1 つ上のセルを参照する（確定して移動してしまわないこと）
    await key('Up')
    if ((await state('s.editing && s.editing.text')) !== '=F9') {
      console.error(
        `[smoke] 矢印キーで参照が入りません: ${String(await state('s.editing && s.editing.text'))}`,
      )
      return false
    }
    if (!(await state('Boolean(s.pointing)'))) {
      console.error('[smoke] 参照選択の状態になっていません')
      return false
    }

    // さらに上へ動かすと参照が置き換わる（=F9F8 のように重ならない）
    await key('Up')
    if ((await state('s.editing && s.editing.text')) !== '=F8') {
      console.error('[smoke] 矢印キーで参照が置き換わりません')
      return false
    }

    // 演算子を打つと参照選択は終わる
    await typeChar('+')
    if (await state('Boolean(s.pointing)')) {
      console.error('[smoke] 文字を打っても参照選択が終わりません')
      return false
    }

    // 続きはクリックでも参照できる
    await mouseClick(point.x, point.y)
    const expected = `=F8+${target}`
    if ((await state('s.editing && s.editing.text')) !== expected) {
      console.error(
        `[smoke] クリックで参照が入りません: ${String(
          await state('s.editing && s.editing.text'),
        )}（期待 ${expected}）`,
      )
      return false
    }

    // Enter で確定し、数式として保存・計算されていること
    await key('Return')
    await tick()
    const input = await state(`s.inputText({ row: 9, col: 5 })`)
    if (input !== expected) {
      console.error(`[smoke] 確定した数式が違います: ${String(input)}`)
      return false
    }
    const value = await state(`s.displayValue({ row: 9, col: 5 })`)
    if (typeof value !== 'number') {
      console.error(`[smoke] 数式が計算されていません: ${String(value)}`)
      return false
    }

    // 後片付け（このあとのスクリーンショットに残さない）
    await wc.executeJavaScript(`window.__excellaStore.getState().undo()`)
    await wc.executeJavaScript(`window.__excellaStore.getState().setSelection({ row: 4, col: 3 })`)
    await tick()

    console.log('[smoke] 数式の参照選択（ポイントモード）の検査に通りました')
    return true
  } catch (error) {
    console.error('[smoke] 数式の参照選択の検査が例外で落ちました', error)
    return false
  }
}

/** `--screenshot <path>` が渡されていれば画面を PNG で保存する */
async function captureIfRequested(win: BrowserWindow): Promise<void> {
  const shotIndex = process.argv.indexOf('--screenshot')
  const path = shotIndex >= 0 ? process.argv[shotIndex + 1] : undefined
  if (!path) return
  await new Promise((done) => setTimeout(done, 600))
  const image = await win.webContents.capturePage()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(path, image.toPNG())
  console.log(`[smoke] スクリーンショットを保存しました: ${path}`)
}
