export type EmotionState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'playful'
  | 'focused'
  | 'concerned'
  | 'teasing'
  | 'happy'
  | 'surprised'

export interface AIResponse {
  text: string
  emotion: EmotionState
  energy: number
  action?: {
    type: 'open_url' | 'open_app' | 'copy_to_clipboard' | 'search_web'
    parameters: Record<string, string>
  }
  internalMoodShift?: number
}

export interface ChatRequest {
  message: string
  triggerContext?: string
}

export interface RelationshipState {
  affection: number
  trust: number
  attachmentStyle: 'playful' | 'caring' | 'tsundere' | 'devoted'
  lastUserMood: string
  sessionCount: number
  userName: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  emotion?: EmotionState
  timestamp: number
}
