import { useState, useEffect, useCallback } from 'react'
import { VRMViewer } from './components/VRMViewer'
import { ChatPanel } from './components/ChatPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { PrivacyBadge } from './components/PrivacyBadge'
import { useChat } from './hooks/useChat'

type Panel = 'none' | 'chat' | 'settings'

export function App() {
  const [panel, setPanel] = useState<Panel>('none')
  const [monitoring, setMonitoring] = useState(true)

  const { messages, isLoading, currentEmotion, currentEnergy, sendMessage, addIntervention } =
    useChat()

  // Listen for proactive interventions from main process
  useEffect(() => {
    const unsub = window.klaira.onIntervention((response) => {
      addIntervention(response)
      setPanel('chat')
    })
    return unsub
  }, [addIntervention])

  const toggleMonitoring = useCallback(() => {
    const next = !monitoring
    setMonitoring(next)
    window.klaira.setMonitoring(next)
  }, [monitoring])

  const handleCharacterClick = useCallback(() => {
    setPanel((prev) => (prev === 'chat' ? 'none' : 'chat'))
  }, [])

  return (
    <div
      className="glass-panel flex flex-col overflow-hidden select-none"
      style={{ width: '380px', height: '600px' }}
    >
      {/* Top bar */}
      <div
        className="drag-region flex items-center justify-between px-3 py-2"
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

      {/* VRM character view */}
      <VRMViewer
        emotion={currentEmotion}
        energy={currentEnergy}
        onCharacterClick={handleCharacterClick}
      />

      {/* Bottom panel area */}
      <div className="flex-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {panel === 'chat' && (
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            currentEmotion={currentEmotion}
            onSend={sendMessage}
            onClose={() => setPanel('none')}
          />
        )}

        {panel === 'settings' && (
          <SettingsPanel onClose={() => setPanel('none')} />
        )}

        {panel === 'none' && (
          <div
            className="h-full flex items-center justify-center"
            style={{ color: 'rgba(255,255,255,0.15)' }}
          >
            <p className="text-xs">click klaira to chat</p>
          </div>
        )}
      </div>
    </div>
  )
}
