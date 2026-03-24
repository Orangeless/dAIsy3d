/**
 * JSON file-based persistence — no native dependencies.
 * Device-level prefs (API key, userId) live in DATA_PATH/prefs.json.
 * Per-user data (messages, relationship) lives in DATA_PATH/users/{userId}/.
 */
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import type { Message, RelationshipState } from '../types'

const DATA_PATH = process.env.KLAIRA_DATA_PATH || path.join(process.cwd(), 'data')
const MAX_MESSAGES = 100

// ─── helpers ──────────────────────────────────────────────────────────────────

const deviceFile = (name: string) => path.join(DATA_PATH, name)

function userDir(): string {
  return path.join(DATA_PATH, 'users', getUserId())
}

function userFile(name: string): string {
  return path.join(userDir(), name)
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
    }
  } catch {
    // corrupted — return fallback
  }
  return fallback
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

// ─── device-level prefs (API key, userId) ─────────────────────────────────────

function readPrefs(): Record<string, string> {
  return readJson<Record<string, string>>(deviceFile('prefs.json'), {})
}

function writePrefs(prefs: Record<string, string>): void {
  writeJson(deviceFile('prefs.json'), prefs)
}

export function getPref(key: string): string | null {
  return readPrefs()[key] ?? null
}

export function setPref(key: string, value: string): void {
  const prefs = readPrefs()
  prefs[key] = value
  writePrefs(prefs)
}

// ─── user identity ─────────────────────────────────────────────────────────────

function getUserId(): string {
  const existing = getPref('userId')
  if (existing) return existing
  const id = randomUUID()
  setPref('userId', id)
  return id
}

// ─── init ──────────────────────────────────────────────────────────────────────

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

  // Ensure device-level prefs exist
  if (!fs.existsSync(deviceFile('prefs.json'))) {
    writeJson(deviceFile('prefs.json'), {})
  }

  // Ensure per-user directory + files exist
  const uid = getUserId()
  const uDir = path.join(DATA_PATH, 'users', uid)
  if (!fs.existsSync(uDir)) {
    fs.mkdirSync(uDir, { recursive: true })
  }
  if (!fs.existsSync(path.join(uDir, 'relationship.json'))) {
    writeJson(path.join(uDir, 'relationship.json'), DEFAULT_RELATIONSHIP)
  }
  if (!fs.existsSync(path.join(uDir, 'messages.json'))) {
    writeJson(path.join(uDir, 'messages.json'), [])
  }

  console.log(`[memoryStore] User data dir: ${uDir}`)
}

// ─── relationship ──────────────────────────────────────────────────────────────

export function getRelationship(): RelationshipState {
  return readJson(userFile('relationship.json'), DEFAULT_RELATIONSHIP)
}

export function updateRelationship(delta: Partial<{
  affection: number
  trust: number
  attachmentStyle: string
  lastUserMood: string
  userName: string
}>): void {
  const rel = getRelationship()
  writeJson(userFile('relationship.json'), {
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
  writeJson(userFile('relationship.json'), { ...rel, sessionCount: rel.sessionCount + 1 })
}

// ─── messages ──────────────────────────────────────────────────────────────────

export function saveMessage(msg: Message): void {
  const messages = readJson<Message[]>(userFile('messages.json'), [])
  messages.push(msg)
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES)
  }
  writeJson(userFile('messages.json'), messages)
}

export function getRecentMessages(limit = 20): Message[] {
  const messages = readJson<Message[]>(userFile('messages.json'), [])
  return messages.slice(-limit)
}

// ─── misc ──────────────────────────────────────────────────────────────────────

export function logContext(_app: string, _title: string, _durationMs: number): void {
  // Not persisted in Phase 1
}
