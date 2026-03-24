import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { emotionEngine } from '../engine/emotionEngine'
import { AnimationManager, setActiveManager } from '../engine/animationManager'
import type { EmotionState } from '../../../server/types'

interface UseVRMOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>
  emotion: EmotionState
  energy: number
  isLoading: boolean
}

function patchVRMTextureLoading() {
  if ((window as any).__klairaPatch) return
  ;(window as any).__klairaPatch = true

  const pending = new Map<string, Promise<string>>()

  const origCOU = URL.createObjectURL.bind(URL)
  ;(URL as any).createObjectURL = (obj: Blob | MediaSource): string => {
    const url = origCOU(obj)
    if (obj instanceof Blob) {
      pending.set(url, new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => {
          fetch(url)
            .then((r) => r.blob())
            .then((b) => {
              const r2 = new FileReader()
              r2.onload = () => resolve(r2.result as string)
              r2.onerror = () => resolve('')
              r2.readAsDataURL(b)
            })
            .catch(() => resolve(''))
        }
        reader.readAsDataURL(obj)
      }))
    }
    return url
  }

  const origROU = URL.revokeObjectURL.bind(URL)
  ;(URL as any).revokeObjectURL = (url: string): void => {
    origROU(url)
    setTimeout(() => pending.delete(url), 5000)
  }

  const imgFromDataUri = (dataUri: string): Promise<HTMLImageElement> =>
    new Promise((res, rej) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = rej
      img.src = dataUri
    })

  const makeHandler = (isImageBitmap: boolean, origLoad: Function) =>
    function (this: any, url: string, onLoad: any, onProgress: any, onError: any) {
      if (!url.startsWith('blob:') || !pending.has(url)) {
        return origLoad.call(this, url, onLoad, onProgress, onError)
      }
      pending.get(url)!
        .then((dataUri) => {
          if (!dataUri) throw new Error('data URI conversion empty')
          return imgFromDataUri(dataUri)
        })
        .then(async (img) => {
          if (isImageBitmap) {
            try {
              const bmp = await createImageBitmap(img)
              onLoad?.(bmp)
            } catch {
              onLoad?.(img as any)
            }
          } else {
            onLoad?.(img)
          }
        })
        .catch((err) => {
          console.error('[VRM] texture patch failed for', url, err)
          onError?.(err)
        })
    }

  const ilProto = THREE.ImageLoader.prototype as any
  if (!ilProto._klairaPatch) {
    ilProto._klairaPatch = true
    ilProto.load = makeHandler(false, ilProto.load)
  }

  const ibmProto = (THREE.ImageBitmapLoader as any).prototype
  if (!ibmProto._klairaPatch) {
    ibmProto._klairaPatch = true
    ibmProto.load = makeHandler(true, ibmProto.load)
  }

  console.log('[VRM] Texture loading patch applied')
}

patchVRMTextureLoading()

// Module-level camera ref so App can update lookAt when window resizes
let _activeCamera: THREE.PerspectiveCamera | null = null
let _lookAt = new THREE.Vector3(0, 0.8, 0)

export function setCameraLookAt(x: number, y: number, z: number): void {
  _lookAt.set(x, y, z)
  _activeCamera?.lookAt(x, y, z)
}

export function useVRM({ canvasRef, emotion, energy }: Omit<UseVRMOptions, 'isLoading'>): void {
  const vrmRef = useRef<VRM | null>(null)
  const clockRef = useRef(new THREE.Clock())
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const animIdRef = useRef<number>(0)
  const animManagerRef = useRef<AnimationManager>(new AnimationManager())

  useEffect(() => {
    emotionEngine.setTarget(emotion, energy)
  }, [emotion, energy])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Guard against React StrictMode's double-invoke: if cleanup runs while the
    // VRM is still loading (async), the callback must be a no-op.
    let cancelled = false

    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 380
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 280

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 20)
    camera.position.set(0, 0.8, 3.5)
    camera.lookAt(0, 0.8, 0)

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.9
    rendererRef.current = renderer

    scene.add(new THREE.AmbientLight(0xfff5e8, 1.0))
    const keyLight = new THREE.DirectionalLight(0xffddb8, 2.2)
    keyLight.position.set(1.5, 2, 3)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xc4d4ff, 0.8)
    fillLight.position.set(-2, 1, 2)
    scene.add(fillLight)
    const rimLight = new THREE.DirectionalLight(0xff9de2, 0.6)
    rimLight.position.set(0, 3, -2)
    scene.add(rimLight)

    const modelUrl = import.meta.env.DEV ? '/model' : 'http://127.0.0.1:3847/model'
    const animManager = animManagerRef.current

    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))

    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) {
          VRMUtils.deepDispose(gltf.scene)
          return
        }
        const vrm = gltf.userData.vrm as VRM
        if (!vrm) {
          console.error('[VRM] Loaded but no VRM data — is klaira.vrm a valid VRM file?')
          return
        }
        VRMUtils.removeUnnecessaryVertices(gltf.scene)
        scene.add(vrm.scene)
        vrmRef.current = vrm
        console.log('[VRM] Model loaded successfully')
        animManager.init(vrm).then(() => setActiveManager(animManager)).catch((e) => console.error('[Anim] init error:', e))
      },
      (progress) => {
        if (progress.total > 0) {
          console.log(`[VRM] ${Math.round((progress.loaded / progress.total) * 100)}%`)
        }
      },
      (err) => {
        console.error('[VRM] Failed to load:', err)
      }
    )

    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate)
      const delta = clockRef.current.getDelta()
      if (vrmRef.current) {
        // Mixer writes corrected quaternions to normalized bones first,
        // then vrm.update() propagates normalized → raw for skinning.
        animManager.update(delta)
        emotionEngine.update(vrmRef.current, delta)
        vrmRef.current.update(delta)
      }
      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      if (!canvas) return
      const rw = canvas.clientWidth || canvas.parentElement?.clientWidth || 380
      const rh = canvas.clientHeight || canvas.parentElement?.clientHeight || 280
      camera.aspect = rw / rh
      camera.updateProjectionMatrix()
      renderer.setSize(rw, rh)
      camera.lookAt(0, 0.8, 0)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      cancelAnimationFrame(animIdRef.current)
      window.removeEventListener('resize', handleResize)
      animManager.dispose()
      renderer.dispose()
      if (vrmRef.current) {
        scene.remove(vrmRef.current.scene)
        VRMUtils.deepDispose(vrmRef.current.scene)
      }
    }
  }, [])
}
