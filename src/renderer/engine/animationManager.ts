import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import type { VRM } from '@pixiv/three-vrm'

// Clips that play on top of the base idle loop, then return to it
const VARIATION_NAMES = ['idle1', 'idle2', 'idle3pause', 'idle4pause']

const REST_ANIM_NAMES = [
  'idle1', 'idle2', 'idle3pause', 'idle4pause',
  'hello', 'picked_up', 'point longer', 'point2', 'pointing2sec'
]

// How often to interrupt idle_main with a variation (ms)
const VARIATION_MIN_MS = 20_000
const VARIATION_MAX_MS = 30_000

export class AnimationManager {
  private mixer: THREE.AnimationMixer | null = null
  private clips = new Map<string, THREE.AnimationClip>()
  private currentAction: THREE.AnimationAction | null = null
  private currentName: string | null = null
  private baseIdleAction: THREE.AnimationAction | null = null
  private _ready = false
  private _variationTimer: ReturnType<typeof setTimeout> | null = null
  // Tracks active 'finished' listeners so we can cancel them when an animation is interrupted
  private _finishedListeners = new Map<THREE.AnimationAction, (e: any) => void>()

  async init(vrm: VRM): Promise<void> {
    this.mixer = new THREE.AnimationMixer(vrm.scene)

    const BASE = import.meta.env.DEV ? '' : 'http://127.0.0.1:3847'
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser))

    // Load idle_main FIRST so the character is never stuck in T-pose
    await this.loadClip('idle_main', loader, vrm, BASE)
    this.startBaseIdle()

    // Load the rest in parallel in the background
    Promise.allSettled(
      REST_ANIM_NAMES.map((name) => this.loadClip(name, loader, vrm, BASE))
    ).then(() => {
      this._ready = true
      if (this.clips.has('hello')) {
        this.playOnce('hello', () => this.scheduleNextVariation())
      } else {
        this.scheduleNextVariation()
      }
    })
  }

  private loadClip(name: string, loader: GLTFLoader, vrm: VRM, BASE: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const url = `${BASE}/animations/${encodeURIComponent(name + '.vrma')}`
      loader.load(
        url,
        (gltf) => {
          const vrmAnims: any[] = gltf.userData.vrmAnimations ?? []
          if (vrmAnims.length > 0) {
            try {
              const clip = createVRMAnimationClip(vrmAnims[0], vrm as any)
              clip.name = name
              this.clips.set(name, clip)
              console.log(`[Anim] ✓ ${name} (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`)
              resolve()
              return
            } catch (e) {
              console.warn(`[Anim] createVRMAnimationClip failed for ${name}:`, e)
            }
          }
          // Fallback: raw GLTF tracks
          if (gltf.animations.length > 0) {
            const clip = gltf.animations[0]
            clip.name = name
            this.clips.set(name, clip)
            console.log(`[Anim] ✓ ${name} via raw tracks (${clip.duration.toFixed(2)}s)`)
          } else {
            console.warn(`[Anim] No animation data in ${name}.vrma`)
          }
          resolve()
        },
        undefined,
        (err) => {
          console.warn(`[Anim] Load failed: ${name}`, err)
          resolve()
        }
      )
    })
  }

  /** Start idle_main looping as the persistent base animation */
  private startBaseIdle(): void {
    if (!this.mixer || !this.clips.has('idle_main')) return
    const clip = this.clips.get('idle_main')!
    const action = this.mixer.clipAction(clip)
    action.reset()
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.setEffectiveWeight(1)
    action.play()
    this.baseIdleAction = action
  }

  /**
   * Play a clip once over the base idle, then call onDone when finished.
   * Crossfades from whichever action is currently dominant (not always baseIdle,
   * which may have weight ~0 if a variation is already playing).
   */
  private playOnce(name: string, onDone?: () => void): void {
    if (!this.mixer || !this.clips.has(name)) {
      onDone?.()
      return
    }

    // Cancel the stale finished-listener for any currently-playing action so it
    // doesn't fire later and fight the new animation or double-invoke scheduleNextVariation.
    if (this.currentAction) {
      const stale = this._finishedListeners.get(this.currentAction)
      if (stale) {
        this.mixer.removeEventListener('finished', stale)
        this._finishedListeners.delete(this.currentAction)
      }
    }

    const clip = this.clips.get(name)!
    const action = this.mixer.clipAction(clip)
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true

    // Stop whatever is currently playing and immediately start the new clip at full weight.
    // The base idle keeps ticking in the background at weight 0 so it's ready to resume.
    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.stop()
    }
    if (this.baseIdleAction && this.baseIdleAction !== action) {
      this.baseIdleAction.setEffectiveWeight(0)
    }
    action.setEffectiveWeight(1)
    action.play()

    this.currentAction = action
    this.currentName = name

    if (onDone) {
      const onFinished = (e: any) => {
        if (e.action !== action) return
        this.mixer!.removeEventListener('finished', onFinished)
        this._finishedListeners.delete(action)
        this.currentAction = null
        this.currentName = null
        // Resume base idle at full weight
        action.stop()
        if (this.baseIdleAction) {
          this.baseIdleAction.setEffectiveWeight(1)
        }
        onDone()
      }
      this._finishedListeners.set(action, onFinished)
      this.mixer.addEventListener('finished', onFinished)
    }
  }

  private scheduleNextVariation(): void {
    if (this._variationTimer) clearTimeout(this._variationTimer)
    const delay = VARIATION_MIN_MS + Math.random() * (VARIATION_MAX_MS - VARIATION_MIN_MS)
    this._variationTimer = setTimeout(() => this.playVariation(), delay)
  }

  private playVariation(): void {
    if (!this._ready) return
    const available = VARIATION_NAMES.filter((n) => this.clips.has(n))
    if (available.length === 0) { this.scheduleNextVariation(); return }

    const candidates = available.filter((n) => n !== this.currentName)
    const name = candidates[Math.floor(Math.random() * candidates.length)]

    this.playOnce(name, () => this.scheduleNextVariation())
  }

  /** Externally trigger a named clip (e.g. hello, picked_up, pointing2sec) */
  play(name: string): void {
    // Cancel any pending variation timer — variation will reschedule after this clip finishes
    if (this._variationTimer) clearTimeout(this._variationTimer)
    this.playOnce(name, () => this.scheduleNextVariation())
  }

  update(delta: number): void {
    this.mixer?.update(delta)
  }

  dispose(): void {
    if (this._variationTimer) clearTimeout(this._variationTimer)
    if (this.mixer) {
      for (const listener of this._finishedListeners.values()) {
        this.mixer.removeEventListener('finished', listener)
      }
    }
    this._finishedListeners.clear()
    this.mixer?.stopAllAction()
    this.mixer = null
    this.clips.clear()
    this.currentAction = null
    this.currentName = null
    this.baseIdleAction = null
    this._ready = false
  }
}

// ─── module-level singleton access ──────────────────────────────────────────
// Lets useChat trigger animations without prop-drilling through the component tree.

let _activeManager: AnimationManager | null = null

export function setActiveManager(mgr: AnimationManager): void {
  _activeManager = mgr
}

export function triggerAnimation(name: string): void {
  _activeManager?.play(name)
}
