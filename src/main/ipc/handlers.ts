import { ipcMain, app, safeStorage, desktopCapturer, screen } from 'electron'
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

  ipcMain.on('klaira:resize-window', (event, { width, height }: { width: number; height: number }) => {
    const win = event.sender.getOwnerBrowserWindow?.() ?? null
    if (!win) return
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    win.setBounds({ x: sw - width - 20, y: sh - height - 20, width, height })
  })

  ipcMain.handle('klaira:capture-screen', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 768, height: 432 }
      })
      const img = sources[0]?.thumbnail
      if (!img) return null
      const buf = img.toJPEG(75)
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })
}
