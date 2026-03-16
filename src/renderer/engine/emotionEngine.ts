import type { VRM } from '@pixiv/three-vrm'
import type { EmotionState } from '../../../server/types'

interface EmotionTarget {
  expressions: { name: string; weight: number }[]
  headYaw: number
  headPitch: number
  bodyBob: number
}

const TARGETS: Record<EmotionState, EmotionTarget> = {
  idle: {
    expressions: [],
    headYaw: 0,
    headPitch: 0,
    bodyBob: 0.3
  },
  listening: {
    expressions: [],
    headYaw: 0.08,
    headPitch: -0.05,
    bodyBob: 0.2
  },
  thinking: {
    expressions: [],
    headYaw: 0.18,
    headPitch: 0.12,
    bodyBob: 0.15
  },
  speaking: {
    expressions: [
      { name: 'relaxed', weight: 0.25 }
    ],
    headYaw: 0,
    headPitch: -0.04,
    bodyBob: 0.4
  },
  playful: {
    expressions: [
      { name: 'happy', weight: 0.7 },
      { name: 'Joy', weight: 0.7 }
    ],
    headYaw: -0.2,
    headPitch: -0.08,
    bodyBob: 0.8
  },
  focused: {
    expressions: [],
    headYaw: 0,
    headPitch: 0.06,
    bodyBob: 0.1
  },
  concerned: {
    expressions: [
      { name: 'sad', weight: 0.35 },
      { name: 'Sorrow', weight: 0.35 }
    ],
    headYaw: 0.1,
    headPitch: -0.1,
    bodyBob: 0.2
  },
  teasing: {
    expressions: [
      { name: 'happy', weight: 0.45 },
      { name: 'Joy', weight: 0.45 }
    ],
    headYaw: -0.15,
    headPitch: 0.04,
    bodyBob: 0.6
  },
  happy: {
    expressions: [
      { name: 'happy', weight: 1.0 },
      { name: 'Joy', weight: 1.0 }
    ],
    headYaw: 0,
    headPitch: -0.1,
    bodyBob: 1.0
  },
  surprised: {
    expressions: [
      { name: 'surprised', weight: 0.8 },
      { name: 'Surprised', weight: 0.8 }
    ],
    headYaw: 0,
    headPitch: -0.18,
    bodyBob: 0.9
  }
}

const KNOWN_EXPRESSIONS = new Set([
  'happy', 'Joy', 'angry', 'Angry', 'sad', 'Sorrow',
  'relaxed', 'Fun', 'surprised', 'Surprised', 'neutral'
])

class EmotionEngine {
  private currentState: EmotionState = 'idle'
  private energy = 0.5
  private time = 0

  private currentHeadYaw = 0
  private currentHeadPitch = 0
  private currentExpressions: Record<string, number> = {}

  private _isTalking = false
  private _talkTime = 0
  private _currentMouth = 0

  setTarget(state: EmotionState, energy: number): void {
    this.currentState = state
    this.energy = energy
  }

  setTalking(active: boolean): void {
    this._isTalking = active
    if (!active) this._talkTime = 0
  }

  update(vrm: VRM, delta: number): void {
    this.time += delta

    const target = TARGETS[this.currentState]
    const speed = 3.0

    // Lerp head rotation
    this.currentHeadYaw += (target.headYaw - this.currentHeadYaw) * speed * delta
    this.currentHeadPitch += (target.headPitch - this.currentHeadPitch) * speed * delta

    // Breathing / idle bob
    const breathe = Math.sin(this.time * 1.2) * 0.015 * (1 + this.energy * 0.5)
    const sway = Math.sin(this.time * 0.4) * 0.008 * target.bodyBob

    // Apply head rotation via humanoid
    const head = vrm.humanoid?.getNormalizedBoneNode('head')
    if (head) {
      head.rotation.y = this.currentHeadYaw + sway
      head.rotation.x = this.currentHeadPitch + breathe * 0.3
    }

    const spine = vrm.humanoid?.getNormalizedBoneNode('spine')
    if (spine) {
      spine.rotation.z = sway * 0.5
      spine.rotation.x = breathe * 0.2
    }

    // Apply expressions
    const expressionManager = vrm.expressionManager
    if (!expressionManager) return

    const targetExpMap: Record<string, number> = {}
    for (const expr of target.expressions) {
      targetExpMap[expr.name] = expr.weight
    }

    for (const name of KNOWN_EXPRESSIONS) {
      const targetWeight = targetExpMap[name] ?? 0
      const current = this.currentExpressions[name] ?? 0
      const next = current + (targetWeight - current) * speed * delta
      this.currentExpressions[name] = next

      try {
        expressionManager.setValue(name, next)
      } catch {
        // Expression doesn't exist in this model — skip silently
      }
    }

    // Talking mouth animation — two overlapping sine waves for a natural jaw movement
    if (this._isTalking) {
      this._talkTime += delta
      const raw = Math.sin(this._talkTime * 9.5) * 0.5 + Math.sin(this._talkTime * 14.3) * 0.3
      const target = Math.max(0, raw) * 0.7
      this._currentMouth += (target - this._currentMouth) * 12 * delta
    } else {
      this._currentMouth += (0 - this._currentMouth) * 8 * delta
    }
    for (const name of ['aa', 'A']) {
      try { expressionManager.setValue(name, this._currentMouth) } catch { }
    }
  }
}

export const emotionEngine = new EmotionEngine()
export type { EmotionState }
