import { execSync } from 'child_process'
import { checkForIntervention } from './decisionEngine'
import { getMainWindow } from './windowManager'

interface WindowInfo {
  app: string
  title: string
}

let watchInterval: NodeJS.Timeout | null = null
let enabled = false

let currentApp = ''
let currentTitle = ''
let currentStart = Date.now()
let sessionStart = Date.now()
let recentSwitches: number[] = []
let lastActive = Date.now()

function getActiveWindow(): WindowInfo {
  try {
    const ps = `
      $p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | Sort-Object WorkingSet64 -Descending | Select-Object -First 1;
      if ($p) { @{ app = $p.ProcessName; title = $p.MainWindowTitle } | ConvertTo-Json } else { '{"app":"","title":""}' }
    `.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()

    const result = execSync(
      `powershell -NoProfile -NonInteractive -Command "${ps.replace(/"/g, '\\"')}"`,
      { timeout: 2500, windowsHide: true }
    ).toString().trim()

    const parsed = JSON.parse(result || '{"app":"","title":""}')
    return { app: parsed.app || '', title: parsed.title || '' }
  } catch {
    return { app: '', title: '' }
  }
}

async function triggerIntervention(message: string): Promise<void> {
  try {
    const res = await fetch('http://127.0.0.1:3847/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '', triggerContext: message })
    })
    if (!res.ok) return
    const data = await res.json()
    const win = getMainWindow()
    win?.webContents.send('klaira:intervention', data)
  } catch {
    // Server may not be ready
  }
}

function poll(): void {
  if (!enabled) return

  const info = getActiveWindow()
  const now = Date.now()

  if (!info.app) return

  lastActive = now

  const appChanged = info.app !== currentApp || info.title !== currentTitle

  if (appChanged) {
    recentSwitches.push(now)
    recentSwitches = recentSwitches.filter(t => now - t < 2 * 60_000)
    currentApp = info.app
    currentTitle = info.title
    currentStart = now
  }

  const ctx = {
    activeApp: currentApp,
    windowTitle: currentTitle,
    durationMs: now - currentStart,
    recentSwitchCount: recentSwitches.length,
    totalSessionMs: now - sessionStart,
    idleMs: now - lastActive
  }

  const trigger = checkForIntervention(ctx)
  if (trigger) {
    triggerIntervention(trigger)
  }
}

export function startWatcher(): void {
  enabled = true
  sessionStart = Date.now()
  watchInterval = setInterval(poll, 30_000)
}

export function stopWatcher(): void {
  enabled = false
  if (watchInterval) {
    clearInterval(watchInterval)
    watchInterval = null
  }
}

export function setEnabled(value: boolean): void {
  enabled = value
  if (value && !watchInterval) {
    watchInterval = setInterval(poll, 30_000)
  } else if (!value && watchInterval) {
    clearInterval(watchInterval)
    watchInterval = null
  }
}
