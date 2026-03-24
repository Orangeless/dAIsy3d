import { BrowserWindow, screen, app } from 'electron'
import path from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null

export function createWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize

  const WIN_W = 265
  const WIN_H = 420

  mainWindow = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: width - WIN_W - 20,
    y: height - WIN_H - 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
