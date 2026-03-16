import { ipcMain, app, safeStorage } from 'electron'
import path from 'path'
import { executeAction } from '../actionExecutor'
import { setEnabled } from '../screenWatcher'

const ASSETS_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(process.cwd(), 'assets')

export function registerHandlers(): void {
  ipcMain.on('klaira:get-assets-path', (event) => {
    event.returnValue = ASSETS_PATH
  })

  ipcMain.on('klaira:set-monitoring', (_event, enabled: boolean) => {
    setEnabled(enabled)
  })

  ipcMain.on('klaira:execute-action', async (_event, action) => {
    await executeAction(action)
  })

  ipcMain.on('klaira:minimize', (event) => {
    const win = event.sender.getOwnerBrowserWindow?.() ?? null
    win?.minimize()
  })

  ipcMain.on('klaira:toggle-always-on-top', (event, value: boolean) => {
    const win = event.sender.getOwnerBrowserWindow?.() ?? null
    win?.setAlwaysOnTop(value)
  })
}
