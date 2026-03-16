import type { AIResponse } from '../../../server/types'

declare global {
  interface Window {
    klaira: {
      getAssetsPath: () => string
      setMonitoring: (enabled: boolean) => void
      executeAction: (action: object) => void
      minimize: () => void
      setAlwaysOnTop: (value: boolean) => void
      onIntervention: (callback: (response: AIResponse) => void) => () => void
    }
  }
}

export {}
