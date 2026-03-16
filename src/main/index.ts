import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { fork, ChildProcess } from 'child_process'
import path from 'path'
import { createWindow } from './windowManager'
import { registerHandlers } from './ipc/handlers'
import { startWatcher, stopWatcher } from './screenWatcher'

let serverProcess: ChildProcess | null = null

function startServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!app.isPackaged) {
      // In dev, server is started by concurrently — just resolve
      setTimeout(resolve, 1500) // Give server time to start
      return
    }

    const serverPath = path.join(process.resourcesPath, 'server', 'index.js')
    serverProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: '3847',
        KLAIRA_DATA_PATH: app.getPath('userData'),
        KLAIRA_ASSETS_PATH: path.join(process.resourcesPath, 'assets')
      },
      silent: false
    })

    serverProcess.on('message', (msg) => {
      if (msg === 'ready') resolve()
    })

    serverProcess.on('error', (err) => {
      console.error('[main] Server error:', err)
      resolve()
    })

    // Safety timeout
    setTimeout(resolve, 5000)
  })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.klaira.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await startServer()

  registerHandlers()
  createWindow()
  startWatcher()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopWatcher()
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
