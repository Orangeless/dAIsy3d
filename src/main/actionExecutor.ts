import { shell } from 'electron'

type ActionType = 'open_url' | 'search_web' | 'copy_to_clipboard' | 'open_app'

interface Action {
  type: ActionType
  parameters: Record<string, string>
}

const ALLOWED_URL_PROTOCOLS = ['https:', 'http:']

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)
  } catch {
    return false
  }
}

export async function executeAction(action: Action): Promise<void> {
  switch (action.type) {
    case 'open_url': {
      const url = action.parameters.url
      if (!url || !isSafeUrl(url)) {
        console.warn('[actionExecutor] Blocked unsafe URL:', url)
        return
      }
      await shell.openExternal(url)
      break
    }

    case 'search_web': {
      const query = action.parameters.query
      if (!query) return
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`
      await shell.openExternal(url)
      break
    }

    case 'copy_to_clipboard': {
      const { clipboard } = await import('electron')
      const text = action.parameters.text
      if (text) clipboard.writeText(text)
      break
    }

    default:
      console.warn('[actionExecutor] Unknown action type:', action.type)
  }
}
