interface WindowContext {
  activeApp: string
  windowTitle: string
  durationMs: number
  recentSwitchCount: number
  totalSessionMs: number
  idleMs: number
}

interface InterventionRule {
  id: string
  check: (ctx: WindowContext) => boolean
  triggerMessage: string
  priority: number
}

const RULES: InterventionRule[] = [
  {
    id: 'stuck_coding',
    priority: 1,
    check: (ctx) =>
      ctx.durationMs > 5 * 60_000 &&
      (ctx.activeApp.toLowerCase().includes('code') ||
       ctx.activeApp.toLowerCase().includes('cursor') ||
       ctx.windowTitle.toLowerCase().includes('.js') ||
       ctx.windowTitle.toLowerCase().includes('.ts') ||
       ctx.windowTitle.toLowerCase().includes('.py')),
    triggerMessage:
      'The user has been working in their code editor for over 5 minutes on the same file. They might be stuck on something or deeply focused.'
  },
  {
    id: 'app_switching',
    priority: 2,
    check: (ctx) => ctx.recentSwitchCount >= 6,
    triggerMessage:
      "The user has been switching between apps rapidly. They might be distracted, overwhelmed, or searching for something."
  },
  {
    id: 'long_session',
    priority: 3,
    check: (ctx) => ctx.totalSessionMs > 90 * 60_000,
    triggerMessage:
      'The user has been working for over 90 minutes. A gentle reminder about taking a break might be nice.'
  },
  {
    id: 'idle_check',
    priority: 4,
    check: (ctx) => ctx.idleMs > 20 * 60_000,
    triggerMessage:
      "The user hasn't been active for 20 minutes. They may have stepped away or are thinking."
  }
]

let lastInterventionTime = 0
const COOLDOWN_MS = 10 * 60_000

export function checkForIntervention(ctx: WindowContext): string | null {
  const now = Date.now()
  if (now - lastInterventionTime < COOLDOWN_MS) return null

  const sorted = [...RULES].sort((a, b) => a.priority - b.priority)
  for (const rule of sorted) {
    if (rule.check(ctx)) {
      lastInterventionTime = now
      return rule.triggerMessage
    }
  }

  return null
}

export function resetCooldown(): void {
  lastInterventionTime = 0
}
