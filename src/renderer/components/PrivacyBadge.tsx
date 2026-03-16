interface PrivacyBadgeProps {
  monitoring: boolean
  onToggle: () => void
}

export function PrivacyBadge({ monitoring, onToggle }: PrivacyBadgeProps) {
  return (
    <button
      onClick={onToggle}
      title={monitoring ? 'Screen monitoring active — click to disable' : 'Screen monitoring off — click to enable'}
      className="no-drag flex items-center gap-1.5 px-2 py-1 rounded-full text-xs transition-all duration-200"
      style={{
        background: monitoring
          ? 'rgba(255, 107, 157, 0.15)'
          : 'rgba(255, 255, 255, 0.05)',
        border: monitoring
          ? '1px solid rgba(255, 107, 157, 0.35)'
          : '1px solid rgba(255, 255, 255, 0.1)',
        color: monitoring
          ? 'rgba(255, 107, 157, 0.9)'
          : 'rgba(255, 255, 255, 0.35)'
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${monitoring ? 'animate-pulse' : ''}`}
        style={{ background: monitoring ? '#ff6b9d' : 'rgba(255,255,255,0.3)' }}
      />
      {monitoring ? 'watching' : 'idle'}
    </button>
  )
}
