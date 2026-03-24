import { useRef } from 'react'
import { useVRM } from '../hooks/useVRM'
import type { EmotionState } from '../../../server/types'

interface VRMViewerProps {
  emotion: EmotionState
  energy: number
  onCharacterClick: () => void
}

export function VRMViewer({ emotion, energy, onCharacterClick }: VRMViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useVRM({ canvasRef, emotion, energy })

  return (
    <div
      className="absolute inset-0 cursor-pointer select-none"
      onClick={onCharacterClick}
      title="Click to chat with Klaira"
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
        <div
          className="w-1.5 h-1.5 rounded-full animate-pulse-soft"
          style={{ background: 'var(--klaira-pink)' }}
        />
      </div>
    </div>
  )
}
