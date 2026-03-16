import { useState } from 'react'

const SERVER = 'http://127.0.0.1:3847'

interface SettingsPanelProps {
  onClose: () => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`${SERVER}/chat/set-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey.trim() })
      })

      if (!res.ok) throw new Error('Failed to save key')

      setSaved(true)
      setApiKey('')
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setError('Could not save key. Is the server running?')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col no-drag" style={{ height: '320px' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 drag-region"
        style={{ borderBottom: '1px solid rgba(199, 125, 255, 0.2)' }}
      >
        <span className="text-xs font-medium no-drag" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Settings
        </span>
        <button
          className="no-drag text-xs px-2 py-1 rounded opacity-40 hover:opacity-80 transition-opacity"
          style={{ color: 'rgba(255,255,255,0.8)' }}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        {/* API Key */}
        <div className="space-y-2">
          <label className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            OpenRouter API Key
          </label>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Get your key at openrouter.ai — uses DeepSeek V3 by default
          </p>
          <input
            type="password"
            className="klaira-input w-full px-3 py-2 text-sm"
            placeholder="sk-or-v1-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          {error && (
            <p className="text-xs" style={{ color: '#ffaa44' }}>
              {error}
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            className="w-full py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-30"
            style={{
              background: saved
                ? 'linear-gradient(135deg, #4ade80, #22d3ee)'
                : 'linear-gradient(135deg, #ff6b9d, #c77dff)',
              color: 'white'
            }}
          >
            {saved ? '✓ Saved' : saving ? 'Saving...' : 'Save Key'}
          </button>
        </div>

        {/* Model info */}
        <div
          className="rounded-xl px-3 py-2.5 text-xs space-y-1"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ color: 'rgba(199,125,255,0.9)' }}>Model:</span>{' '}
            deepseek/deepseek-v3
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>
            <span style={{ color: 'rgba(255,107,157,0.9)' }}>Provider:</span>{' '}
            OpenRouter
          </p>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', paddingTop: '4px' }}>
            All data stays on your machine. Klaira only sends chat messages to the AI.
          </p>
        </div>
      </div>
    </div>
  )
}
