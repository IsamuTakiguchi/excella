import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type ExcellaApi, type MenuAction } from '../shared/ipc'

const api: ExcellaApi = {
  openWorkbook: () => ipcRenderer.invoke(IPC.openWorkbook),
  saveWorkbook: (path, model, results) =>
    ipcRenderer.invoke(IPC.saveWorkbook, path, model, results),
  exportCsv: (model, sheetId, displayValues) =>
    ipcRenderer.invoke(IPC.exportCsv, model, sheetId, displayValues),
  setDirty: (dirty) => ipcRenderer.send(IPC.setDirty, dirty),
  onMenu: (handler) => {
    const listener = (_e: unknown, action: MenuAction) => handler(action)
    ipcRenderer.on(IPC.menu, listener)
    return () => ipcRenderer.removeListener(IPC.menu, listener)
  },
}

contextBridge.exposeInMainWorld('excella', api)
