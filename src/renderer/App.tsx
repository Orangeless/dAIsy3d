import { useState, useEffect, useCallback } from 'react'
import { VRMViewer } from './components/VRMViewer'
import { ChatPanel } from './components/ChatPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { PrivacyBadge } from './components/PrivacyBadge'
import { useChat } from './hooks/useChat'

const WIN_H = 420
const WIN_NARROW = 265   // character only
const WIN_WIDE   = 555   // character + chat panel

type Panel = 'none' | 'chat' | 'settings'

export function App() {
  const [panel, setPanel] = useState<Panel>('none')
  const [monitoring, setMonitoring] = useState(true)

  const { messages, isLoading, currentEmotion, currentEnergy, sendMessage, addIntervention } =
    useChat()

  useEffect(() => {
    const unsub = window.klaira.onIntervention((response) => {
      addIntervention(response)
      setPanel('chat')
      window.klaira.resizeWindow(WIN_WIDE, WIN_H)
    })
    return unsub
  }, [addIntervention])

  const toggleMonitoring = useCallback(() => {
    const next = !monitoring
    setMonitoring(next)
    window.klaira.setMonitoring(next)
  }, [monitoring])

  const handleCharacterClick = useCallback(() => {
    setPanel((prev) => {
      const next = prev === 'chat' ? 'none' : 'chat'
      window.klaira.resizeWindow(next === 'chat' ? WIN_WIDE : WIN_NARROW, WIN_H)
      return next
    })
  }, [])

  return (
    <div
      className="glass-panel flex flex-col overflow-hidden select-none"
      style={{ width: `${panel === 'chat' ? WIN_WIDE : WIN_NARROW}px`, height: `${WIN_H}px` }}
    >
      {/* Top bar */}
      <div
        className="drag-region flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="no-drag flex items-center gap-2">
          <PrivacyBadge monitoring={monitoring} onToggle={toggleMonitoring} />
        </div>
        <div className="no-drag flex items-center gap-2">
          <button
            onClick={() => setPanel((p) => (p === 'settings' ? 'none' : 'settings'))}
            className="text-xs px-2 py-1 rounded opacity-40 hover:opacity-70 transition-opacity"
            style={{ color: 'rgba(255,255,255,0.8)' }}
            title="Settings"
          >
            ⚙
          </button>
          <button
            onClick={() => window.klaira.minimize()}
            className="text-xs px-2 py-1 rounded opacity-40 hover:opacity-70 transition-opacity"
            style={{ color: 'rgba(255,255,255,0.8)' }}
            title="Minimize"
          >
            −
          </button>
        </div>
      </div>

      {/* Content area — chat panel left, VRM right (fixed width) */}
      <div className="flex flex-row flex-1 overflow-hidden">
        {/* Chat panel — slides in to the left of the character */}
        {panel === 'chat' && (
          <div className="no-drag flex-shrink-0" style={{ width: '290px' }}>
            <ChatPanel
              messages={messages}
              isLoading={isLoading}
              currentEmotion={currentEmotion}
              onSend={sendMessage}
              onClose={() => {
                setPanel('none')
                window.klaira.resizeWindow(WIN_NARROW, WIN_H)
              }}
            />
          </div>
        )}

        {/* VRM area — fixed 400px, never changes size */}
        <div className="relative flex-shrink-0" style={{ width: `${WIN_NARROW}px` }}>
          <VRMViewer
            emotion={currentEmotion}
            energy={currentEnergy}
            onCharacterClick={handleCharacterClick}
          />
          {panel === 'settings' && (
            <div className="absolute inset-0 no-drag" style={{ zIndex: 10 }}>
              <SettingsPanel onClose={() => setPanel('none')} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
