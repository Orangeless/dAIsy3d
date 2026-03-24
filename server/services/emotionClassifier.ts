import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'
import type { EmotionState } from '../types'

interface AnimationEntry {
  name: string
  description: string
  emotions: string[]
}

interface EmotionTag {
  emotion: EmotionState
  tone: string
  animation: string | null
}

const VALID_EMOTIONS = new Set<EmotionState>([
  'idle', 'listening', 'thinking', 'speaking',
  'playful', 'focused', 'concerned', 'teasing', 'happy', 'surprised'
])

const FALLBACK: EmotionTag = { emotion: 'idle', tone: 'neutral', animation: null }

const CLASSIFIER_MODEL = 'meta-llama/llama-3.1-8b-instruct'

let _registry: AnimationEntry[] | null = null
let _validAnimations: Set<string> | null = null

function loadRegistry(): AnimationEntry[] {
  if (_registry) return _registry
  const registryPath = path.join(process.cwd(), 'assets', 'animations', 'registry.json')
  try {
    _registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as AnimationEntry[]
    _validAnimations = new Set(_registry.map((e) => e.name))
    return _registry
  } catch {
    console.warn('[EmotionClassifier] Could not load animation registry — animation picking disabled')
    _registry = []
    _validAnimations = new Set()
    return _registry
  }
}

function buildPrompt(text: string, role: 'user' | 'assistant'): string {
  const registry = loadRegistry()

  const animList = registry
    .map((e) => `  "${e.name}" — ${e.description} (suits: ${e.emotions.join(', ')})`)
    .join('\n')

  return `You are an animation director for an anime AI companion named Klaira.
Given a message, classify its emotional tone and pick the single most fitting body animation.

Available animations:
${animList}

Message role: ${role}
Message: "${text.slice(0, 300)}"

Rules:
- Pick animation=null for routine small-talk that should stay on the base idle loop
- Only pick an animation if the message has a clear emotional quality worth expressing
- Respond ONLY with valid JSON on one line, no explanation

Required JSON format:
{"emotion":"<idle|listening|thinking|speaking|playful|focused|concerned|teasing|happy|surprised>","tone":"<2-4 word description>","animation":"<name from list above, or null>"}`
}

export async function classifyMessage(
  text: string,
  role: 'user' | 'assistant',
  apiKey?: string
): Promise<EmotionTag> {
  const key = apiKey || process.env.OPENROUTER_API_KEY
  if (!key || !text.trim()) return FALLBACK

  try {
    const ai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: key,
      defaultHeaders: {
        'HTTP-Referer': 'https://klaira.app',
        'X-Title': 'Klaira Desktop Companion'
      }
    })

    const completion = await ai.chat.completions.create({
      model: CLASSIFIER_MODEL,
      messages: [{ role: 'user', content: buildPrompt(text, role) }],
      max_tokens: 100,
      temperature: 0.1
    })

    const raw = completion.choices[0]?.message?.content?.trim() ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return FALLBACK

    const parsed = JSON.parse(jsonMatch[0])

    const emotion: EmotionState = VALID_EMOTIONS.has(parsed.emotion) ? parsed.emotion : 'idle'
    const tone: string = typeof parsed.tone === 'string' ? parsed.tone.slice(0, 40) : 'neutral'

    let animation: string | null = null
    if (parsed.animation && parsed.animation !== 'null') {
      const candidate = String(parsed.animation)
      animation = _validAnimations?.has(candidate) ? candidate : null
    }

    return { emotion, tone, animation }
  } catch (err) {
    console.warn('[EmotionClassifier] Classification failed, using fallback:', (err as Error).message)
    return FALLBACK
  }
}
