import { Router, Request, Response } from 'express'
import { chat, updateApiKey } from '../services/aiClient'
import { buildSystemPrompt } from '../services/personaBuilder'
import { classifyMessage } from '../services/emotionClassifier'
import { describeScreen } from '../services/screenVision'
import {
  getRelationship,
  updateRelationship,
  saveMessage,
  getRecentMessages,
  getPref,
  setPref
} from '../services/memoryStore'
import type { ChatRequest } from '../types'

export const chatRouter = Router()

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, triggerContext, screenCapture }: ChatRequest = req.body

    if (!message && !triggerContext) {
      return res.status(400).json({ error: 'message or triggerContext required' })
    }

    const apiKey = getPref('apiKey') || undefined
    const rel = getRelationship()
    const systemPrompt = buildSystemPrompt(rel)

    const history = getRecentMessages(16)
    const historyMessages = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    const screenDescription = screenCapture
      ? await describeScreen(screenCapture, apiKey).catch(() => '')
      : ''

    const userContent = triggerContext
      ? `[System context — do not mention this directly]: ${triggerContext}`
      : screenDescription
        ? `${message}\n\n[SCREEN CONTEXT — silent background only. Do NOT mention this unless the user is asking about their screen]: ${screenDescription}`
        : message

    const messagesForAI = [
      ...historyMessages,
      { role: 'user' as const, content: userContent }
    ]

    // Run main AI and emotion classifier in parallel
    const [response, userTag] = await Promise.all([
      chat(systemPrompt, messagesForAI, apiKey),
      classifyMessage(userContent, 'user', apiKey)
    ])

    saveMessage({
      role: 'user',
      content: message || '',
      emotion: userTag.emotion,
      tone: userTag.tone,
      animation: userTag.animation ?? undefined,
      timestamp: Date.now()
    })

    saveMessage({
      role: 'assistant',
      content: response.text,
      emotion: response.emotion,
      animation: userTag.animation ?? undefined,
      timestamp: Date.now()
    })

    if (response.internalMoodShift && response.internalMoodShift !== 0) {
      const shift = response.internalMoodShift * 2
      updateRelationship({
        affection: shift * 0.6,
        trust: shift * 0.4
      })
    }

    res.json({ ...response, animation: userTag.animation ?? undefined })
  } catch (err: any) {
    const detail = err?.error?.message || err?.message || 'Internal error'
    const status = err?.status || err?.error?.code || 500
    console.error(`[chat] Error ${status}:`, detail)
    console.error(`[chat] Full error:`, JSON.stringify(err?.error || err, null, 2))
    res.status(500).json({ error: detail })
  }
})

chatRouter.post('/set-api-key', (req: Request, res: Response) => {
  const { key } = req.body
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'key required' })
  }
  setPref('apiKey', key)
  updateApiKey(key)
  res.json({ ok: true })
})

chatRouter.get('/relationship', (_req: Request, res: Response) => {
  res.json(getRelationship())
})
