import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '../hooks/useChat'
import type { EmotionState } from '../../../server/types'

const EMOTION_COLORS: Record<EmotionState, string> = {
  idle: '#7eb8f7',
  listening: '#c77dff',
  thinking: '#ffd700',
  speaking: '#ff6b9d',
  playful: '#ff6b9d',
  focused: '#7eb8f7',
  concerned: '#ffaa44',
  teasing: '#c77dff',
  happy: '#ff6b9d',
  surprised: '#ffd700'
}

interface ChatPanelProps {
  messages: ChatMessage[]
  isLoading: boolean
  currentEmotion: EmotionState
  onSend: (text: string) => void
  onClose: () => void
}

export function ChatPanel({ messages, isLoading, currentEmotion, onSend, onClose }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    onSend(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const accentColor = EMOTION_COLORS[currentEmotion]

  return (
    <div className="flex flex-col no-drag" style={{ height: '320px' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 drag-region"
        style={{ borderBottom: `1px solid ${accentColor}30` }}
      >
        <div className="flex items-center gap-2 no-drag">
          <div
            className="w-2 h-2 rounded-full transition-colors duration-500"
            style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
          />
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Klaira
          </span>
        </div>
        <button
          className="no-drag text-xs px-2 py-1 rounded opacity-40 hover:opacity-80 transition-opacity"
          style={{ color: 'rgba(255,255,255,0.8)' }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 chat-scroll space-y-2"
      >
        {messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Say something...
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user' ? 'msg-user' : 'msg-klaira'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="msg-klaira px-4 py-2.5">
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1 h-1 rounded-full animate-bounce"
                    style={{
                      background: accentColor,
                      animationDelay: `${i * 0.15}s`
                    }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="klaira-input flex-1 px-3 py-2 text-sm"
            placeholder="Type something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-30"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, #c77dff)`,
              color: 'white'
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}
