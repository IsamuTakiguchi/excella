/**
 * 保存まわりのまとめ役。
 *
 * - saveCurrent：メニューの保存と自動保存が共通で使う保存処理
 * - enableAutoSave：タイトル帯のスイッチをオンにするときの段取り
 * - createAutoPersistence：変更を見張って、自動回復の控えと自動保存を裏で行う
 *
 * 見張り役はストアと API を引数で受け取るので、タイマーごとテストできる。
 */
import type { ExcellaApi, SerializedResults } from '@shared/ipc'
import { bridge } from './bridge'
import { useStore, type Store } from './store/workbookStore'

/** 自動回復の控えを書くまでの待ち時間（打鍵のたびに書かないよう、少しまとめる） */
export const RECOVERY_DELAY_MS = 1500
/** 自動保存までの待ち時間 */
export const AUTOSAVE_DELAY_MS = 2000

/** 自動保存をオンにするとき、外から開いた xlsx に対して出す確認 */
export const AUTOSAVE_WARNING =
  '自動保存をオンにすると、このファイルに変更が自動で上書きされます。\n' +
  'Excella が対応していない要素（グラフ・ピボットテーブル・条件付き書式・画像など）は、' +
  '上書きしたときにファイルから失われます。\n\n自動保存をオンにしますか？'

/**
 * 開いているブックを保存する。asNew なら「名前を付けて保存」。
 * 保存したのは呼んだ時点のモデルなので、それを markSaved に渡す
 * （保存中に打った変更まで「保存済み」にしないため）。
 */
export async function saveCurrent(
  asNew: boolean,
  options: { silent?: boolean } = {},
): Promise<boolean> {
  const state = useStore.getState()
  const model = state.model
  const results: SerializedResults = model.sheets.map((sheet) => [
    sheet.id,
    [...state.engine.getResultMap(sheet).entries()],
  ])
  const result = await bridge.saveWorkbook(asNew ? null : state.filePath, model, results)
  if (!result) return false
  useStore.getState().markSaved(result.path, result.name, { silent: options.silent, model })
  return true
}

/**
 * 自動保存をオンにする。Excel と同じく、まだファイルになっていないブックは
 * 先に保存先を決めてもらう。外から開いた xlsx は、非対応の要素が消えることを確かめる。
 */
export async function enableAutoSave(): Promise<boolean> {
  const store = () => useStore.getState()
  if (!bridge.supportsAutoSave) {
    store().setStatus('このブラウザではファイルへの自動保存ができません（自動回復は有効です）')
    return false
  }

  if (!bridge.canAutoSave(store().filePath)) {
    // 新しいブックや CSV：xlsx として保存先を決めてから
    if (!(await saveCurrent(true))) return false
  } else if (store().fileOrigin === 'opened' && !confirm(AUTOSAVE_WARNING)) {
    return false
  }

  const path = store().filePath
  if (!path || !bridge.canAutoSave(path) || !(await bridge.prepareAutoSave(path))) {
    store().setStatus('ファイルへの書き込みが許可されなかったため、自動保存をオンにできません')
    return false
  }
  store().setAutoSave(true)
  return true
}

type PersistenceDeps = {
  api: Pick<ExcellaApi, 'saveRecovery' | 'clearRecovery' | 'canAutoSave'>
  store: {
    getState(): Store
    subscribe(listener: (state: Store, prev: Store) => void): () => void
  }
  /** 自動保存の保存処理（ふだんは saveCurrent(false, { silent: true })） */
  save: () => Promise<boolean>
  recoveryDelay?: number
  autoSaveDelay?: number
}

/**
 * 変更を見張り、次の 2 つを裏で行う。
 *
 * 1. 自動回復（常に）：未保存の変更があれば少し待って控えを書く。保存されたら控えを消す
 * 2. 自動保存（スイッチがオンのとき）：少し待ってファイルへ上書きする。
 *    セルの編集中は確定を待ち、保存中に変更が入ればもう一度保存する
 */
export function createAutoPersistence(deps: PersistenceDeps): {
  stop: () => void
  flush: () => Promise<void>
} {
  const recoveryDelay = deps.recoveryDelay ?? RECOVERY_DELAY_MS
  const autoSaveDelay = deps.autoSaveDelay ?? AUTOSAVE_DELAY_MS
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null
  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let saving = false

  const writeRecovery = async () => {
    if (recoveryTimer) clearTimeout(recoveryTimer)
    recoveryTimer = null
    const s = deps.store.getState()
    if (!s.dirty) return
    await deps.api.saveRecovery({
      model: s.model,
      fileName: s.fileName,
      filePath: s.filePath,
      savedAt: Date.now(),
    })
  }

  const scheduleRecovery = () => {
    if (recoveryTimer) clearTimeout(recoveryTimer)
    recoveryTimer = setTimeout(() => void writeRecovery(), recoveryDelay)
  }

  const scheduleAutoSave = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => void runAutoSave(), autoSaveDelay)
  }

  const runAutoSave = async () => {
    autoSaveTimer = null
    const s = deps.store.getState()
    if (!s.autoSave || !s.dirty || !deps.api.canAutoSave(s.filePath)) return
    // 編集中のセルはまだモデルに入っていない。確定してから保存する
    if (s.editing) return scheduleAutoSave()
    if (saving) return
    saving = true
    s.setAutoSaveState('saving')
    let ok: boolean
    try {
      ok = await deps.save()
    } catch {
      ok = false
    }
    saving = false
    const after = deps.store.getState()
    if (!ok) {
      after.setAutoSave(false)
      after.setAutoSaveState('error')
      after.setStatus('自動保存できなかったため、自動保存をオフにしました')
      return
    }
    after.setAutoSaveState('saved')
    // 保存している間に打った変更は、まだファイルに無い
    if (after.autoSave && after.dirty) scheduleAutoSave()
  }

  const unsubscribe = deps.store.subscribe((state, prev) => {
    const changed =
      state.model !== prev.model || state.dirty !== prev.dirty || state.autoSave !== prev.autoSave
    if (!changed) return

    if (state.dirty) scheduleRecovery()
    else if (prev.dirty) {
      // 保存された（または破棄された）ので、控えはもう要らない
      if (recoveryTimer) clearTimeout(recoveryTimer)
      recoveryTimer = null
      void deps.api.clearRecovery()
    }

    if (state.autoSave && state.dirty) scheduleAutoSave()
  })

  return {
    stop: () => {
      unsubscribe()
      if (recoveryTimer) clearTimeout(recoveryTimer)
      if (autoSaveTimer) clearTimeout(autoSaveTimer)
    },
    // 画面が隠れるとき（タブを閉じる・アプリを切り替える）に、待たずに控えを書く
    flush: writeRecovery,
  }
}
