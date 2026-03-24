import { useState, useCallback, useEffect, useRef } from 'react'
import type { AIResponse, EmotionState } from '../../../server/types'
import { emotionEngine } from '../engine/emotionEngine'
import { triggerAnimation } from '../engine/animationManager'

// In dev, use relative URL through Vite proxy (same origin). In production, use absolute.
const SERVER = import.meta.env.DEV ? '' : 'http://127.0.0.1:3847'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  emotion?: EmotionState
  timestamp: number
}

interface UseChatReturn {
  messages: ChatMessage[]
  isLoading: boolean
  currentEmotion: EmotionState
  currentEnergy: number
  sendMessage: (text: string) => Promise<void>
  addIntervention: (response: AIResponse) => void
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentEmotion, setCurrentEmotion] = useState<EmotionState>('idle')
  const [currentEnergy, setCurrentEnergy] = useState(0.5)
  const talkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ~130 words per minute speaking rate
  const startTalking = useCallback((text: string) => {
    if (talkTimerRef.current) clearTimeout(talkTimerRef.current)
    const words = text.trim().split(/\s+/).length
    const ms = Math.max(1500, (words / 130) * 60_000)
    emotionEngine.setTalking(true)
    talkTimerRef.current = setTimeout(() => emotionEngine.setTalking(false), ms)
  }, [])

  useEffect(() => {
    return () => {
      if (talkTimerRef.current) clearTimeout(talkTimerRef.current)
      emotionEngine.setTalking(false)
    }
  }, [])

  const addIntervention = useCallback((response: AIResponse) => {
    const msg: ChatMessage = {
      id: `${Date.now()}-intervention`,
      role: 'assistant',
      text: response.text,
      emotion: response.emotion,
      timestamp: Date.now()
    }
    setMessages((prev) => [...prev, msg])
    setCurrentEmotion(response.emotion)
    setCurrentEnergy(response.energy)
    startTalking(response.text)
    if (response.animation) triggerAnimation(response.animation)

    if (response.action) {
      window.klaira.executeAction(response.action)
    }
  }, [startTalking])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text,
      timestamp: Date.now()
    }

    emotionEngine.setTalking(false)
    if (talkTimerRef.current) clearTimeout(talkTimerRef.current)
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setCurrentEmotion('listening')
    setCurrentEnergy(0.5)

    try {
      let screenCapture: string | null = null
      try {
        screenCapture = await window.klaira.captureScreen()
      } catch { /* non-fatal */ }

      const res = await fetch(`${SERVER}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ...(screenCapture ? { screenCapture } : {}) })
      })

      if (!res.ok) throw new Error(`Server error: ${res.status}`)

      const data: AIResponse = await res.json()

      const assistantMsg: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        text: data.text,
        emotion: data.emotion,
        timestamp: Date.now()
      }

      setMessages((prev) => [...prev, assistantMsg])
      setCurrentEmotion(data.emotion)
      setCurrentEnergy(data.energy)
      startTalking(data.text)
      if (data.animation) triggerAnimation(data.animation)

      if (data.action) {
        window.klaira.executeAction(data.action)
      }
    } catch (err) {
      console.error('[useChat] Error:', err)
      const errorMsg: ChatMessage = {
        id: `${Date.now()}-error`,
        role: 'assistant',
        text: "I couldn't reach my backend. Check that the server is running.",
        emotion: 'concerned',
        timestamp: Date.now()
      }
      setMessages((prev) => [...prev, errorMsg])
      setCurrentEmotion('concerned')
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, startTalking])

  return { messages, isLoading, currentEmotion, currentEnergy, sendMessage, addIntervention }
}
