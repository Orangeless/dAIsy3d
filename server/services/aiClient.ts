import OpenAI from 'openai'
import type { AIResponse, EmotionState } from '../types'

let client: OpenAI | null = null

function getClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('No API key configured')

  if (!client || (apiKey && client.apiKey !== key)) {
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': 'https://klaira.app',
        'X-Title': 'Klaira Desktop Companion'
      }
    })
  }
  return client
}

export function updateApiKey(key: string): void {
  client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: {
      'HTTP-Referer': 'https://klaira.app',
      'X-Title': 'Klaira Desktop Companion'
    }
  })
}

export async function chat(
  systemPrompt: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  apiKey?: string
): Promise<AIResponse> {
  const ai = getClient(apiKey)
  const model = process.env.AI_MODEL || 'deepseek/deepseek-v3.2'

  const completion = await ai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    max_tokens: 600,
    temperature: 0.85
  })

  const raw = completion.choices[0]?.message?.content ?? ''
  return parseResponse(raw)
}

function parseResponse(raw: string): AIResponse {
  const validEmotions: EmotionState[] = [
    'idle', 'listening', 'thinking', 'speaking',
    'playful', 'focused', 'concerned', 'teasing', 'happy', 'surprised'
  ]

  try {
    const parsed = JSON.parse(raw)
    return {
      text: String(parsed.text || '...'),
      emotion: validEmotions.includes(parsed.emotion) ? parsed.emotion : 'idle',
      energy: typeof parsed.energy === 'number' ? Math.max(0, Math.min(1, parsed.energy)) : 0.5,
      action: parsed.action ?? undefined,
      internalMoodShift: typeof parsed.internalMoodShift === 'number' ? parsed.internalMoodShift : 0
    }
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        return parseResponse(jsonMatch[0])
      } catch {}
    }

    return {
      text: raw.replace(/```[\s\S]*?```/g, '').trim() || '...',
      emotion: 'idle',
      energy: 0.5,
      internalMoodShift: 0
    }
  }
}
