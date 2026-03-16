import { contextBridge, ipcRenderer } from 'electron'
import type { AIResponse } from '../../server/types'

contextBridge.exposeInMainWorld('klaira', {
  getAssetsPath: (): string =>
    ipcRenderer.sendSync('klaira:get-assets-path'),

  setMonitoring: (enabled: boolean): void =>
    ipcRenderer.send('klaira:set-monitoring', enabled),

  executeAction: (action: object): void =>
    ipcRenderer.send('klaira:execute-action', action),

  minimize: (): void =>
    ipcRenderer.send('klaira:minimize'),

  setAlwaysOnTop: (value: boolean): void =>
    ipcRenderer.send('klaira:toggle-always-on-top', value),

  onIntervention: (callback: (response: AIResponse) => void): (() => void) => {
    const handler = (_: unknown, data: AIResponse) => callback(data)
    ipcRenderer.on('klaira:intervention', handler)
    return () => ipcRenderer.removeListener('klaira:intervention', handler)
  }
})
