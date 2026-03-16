/**
 * JSON file-based persistence — no native dependencies.
 * Three flat files: messages.json, relationship.json, prefs.json
 * Drop-in replacement for the SQLite version — same exported API.
 */
import path from 'path'
import fs from 'fs'
import type { Message, RelationshipState } from '../types'

const DATA_PATH = process.env.KLAIRA_DATA_PATH || path.join(process.cwd(), 'data')
const MAX_MESSAGES = 100

const f = (name: string) => path.join(DATA_PATH, name)

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
    }
  } catch {
    // Corrupted file — return fallback and let it be overwritten
  }
  return fallback
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const DEFAULT_RELATIONSHIP: RelationshipState = {
  affection: 20,
  trust: 20,
  attachmentStyle: 'playful',
  lastUserMood: 'neutral',
  sessionCount: 0,
  userName: ''
}

export function initDb(): void {
  if (!fs.existsSync(DATA_PATH)) {
    fs.mkdirSync(DATA_PATH, { recursive: true })
  }
  if (!fs.existsSync(f('relationship.json'))) {
    writeJson(f('relationship.json'), DEFAULT_RELATIONSHIP)
  }
  if (!fs.existsSync(f('messages.json'))) {
    writeJson(f('messages.json'), [])
  }
  if (!fs.existsSync(f('prefs.json'))) {
    writeJson(f('prefs.json'), {})
  }
}

export function getRelationship(): RelationshipState {
  return readJson(f('relationship.json'), DEFAULT_RELATIONSHIP)
}

export function updateRelationship(delta: Partial<{
  affection: number
  trust: number
  attachmentStyle: string
  lastUserMood: string
  userName: string
}>): void {
  const rel = getRelationship()
  writeJson(f('relationship.json'), {
    ...rel,
    affection: delta.affection !== undefined
      ? Math.max(0, Math.min(100, rel.affection + delta.affection))
      : rel.affection,
    trust: delta.trust !== undefined
      ? Math.max(0, Math.min(100, rel.trust + delta.trust))
      : rel.trust,
    attachmentStyle: delta.attachmentStyle ?? rel.attachmentStyle,
    lastUserMood: delta.lastUserMood ?? rel.lastUserMood,
    userName: delta.userName ?? rel.userName
  })
}

export function incrementSession(): void {
  const rel = getRelationship()
  writeJson(f('relationship.json'), { ...rel, sessionCount: rel.sessionCount + 1 })
}

export function saveMessage(msg: Message): void {
  const messages = readJson<Message[]>(f('messages.json'), [])
  messages.push(msg)
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES)
  }
  writeJson(f('messages.json'), messages)
}

export function getRecentMessages(limit = 20): Message[] {
  const messages = readJson<Message[]>(f('messages.json'), [])
  return messages.slice(-limit)
}

export function getPref(key: string): string | null {
  const prefs = readJson<Record<string, string>>(f('prefs.json'), {})
  return prefs[key] ?? null
}

export function setPref(key: string, value: string): void {
  const prefs = readJson<Record<string, string>>(f('prefs.json'), {})
  prefs[key] = value
  writeJson(f('prefs.json'), prefs)
}

export function logContext(_app: string, _title: string, _durationMs: number): void {
  // Not persisted in Phase 1
}
