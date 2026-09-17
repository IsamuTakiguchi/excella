import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuAction } from '../shared/ipc'

export function buildMenu(win: BrowserWindow): void {
  const send = (action: MenuAction) => () => win.webContents.send(IPC.menu, action)
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about', label: 'Excella について' },
              { type: 'separator' },
              { role: 'quit', label: 'Excella を終了' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'ファイル',
      submenu: [
        { label: '新規', accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: '開く…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: '名前を付けて保存…', accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { label: 'CSV として書き出し…', click: send('export-csv') },
        { type: 'separator' },
        isMac ? { role: 'close', label: '閉じる' } : { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '編集',
      submenu: [
        { label: '元に戻す', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
        { label: 'やり直し', accelerator: 'CmdOrCtrl+Shift+Z', click: send('redo') },
        { type: 'separator' },
        { label: '切り取り', accelerator: 'CmdOrCtrl+X', click: send('cut') },
        { label: 'コピー', accelerator: 'CmdOrCtrl+C', click: send('copy') },
        { label: '貼り付け', accelerator: 'CmdOrCtrl+V', click: send('paste') },
        { label: '削除', accelerator: 'Delete', click: send('delete') },
        { type: 'separator' },
        { label: 'すべて選択', accelerator: 'CmdOrCtrl+A', click: send('select-all') },
      ],
    },
    {
      label: '書式',
      submenu: [
        { label: 'セルを結合／解除', click: send('toggle-merge') },
        { label: 'ウィンドウ枠の固定／解除', click: send('toggle-freeze') },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'フルスクリーン' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
