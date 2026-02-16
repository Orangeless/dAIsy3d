(() => {
  // =========================================================
  // EyeAI Injector
  // FINAL ARCHITECTURE:
  // - Idle state = paused video frame (NOT PNG)
  // - Animation state = same video element playing
  // - Rare idles override temporarily
  // - UI is scaled WITHOUT touching internal resolution
  // =========================================================

  const CFG = {
    backendUrl: "http://localhost:3001/api/ask",
    assetsBase: "",

    // Native resolution (do NOT change)
    avatarWidth: 640,
    avatarHeight: 848,

    // Visual size on screen (only knob you touch)
    avatarUIScale: 0.82,
    avatarFollowInput: true,

    avatarPos: { right: 32, bottom: 92 },
    inputPos: { right: 32, bottom: 18 },

    bubbleMode: "fixed",
    bubbleFixed: { x: window.innerWidth - 380 - 18, y: 60 },
    bubbleOffset: { dx: -360, dy: -140 },

    bubbleMaxWidth: 360,
    bubbleMaxHeight: 220,
    uiMaxWidth: 380,
    avatarDockOffsetY: -372,
    avatarDockOffsetX: -90,
    avatarDockMinRight: -320,
    avatarMinBottom: -640,
    avatarMinRight: -2000,

    idleMainEverySecondsMin: 30,
    idleMainEverySecondsMax: 60,

    idleRareEverySecondsMin: 120,
    idleRareEverySecondsMax: 240,
    idleRareDurationSecondsMin: 5,
    idleRareDurationSecondsMax: 5,

    // Canonical idle clip (used for STILL + animation)
    idleMainVideo: "assets/anim/Standing_Idle.fbx",

    idleRareVideos: [],

    videos: {
      talkingMid: ["assets/anim/Standing_Idle.fbx"],
    },
    resultAnimation: "assets/anim/Pointing.fbx",
    resultCrossfadeMs: 110,
    greetingAnimation: "assets/anim/greeting.fbx",
    carriedAnimation: "assets/anim/carried.fbx",
    standUpAnimation: "assets/anim/Standing Up.fbx",
    dragCrossfadeMs: 70,
    standToIdleCrossfadeMs: 180,
    carriedLoopFrames: 20,
    carriedLoopFps: 30,
    characterTextures: {
      baseColor: "assets/anim/Meshy_AI_Emerald_Elegance_0216113256_texture.png",
      normal: "assets/anim/Meshy_AI_Emerald_Elegance_0216113256_texture_normal.png",
      roughness: "assets/anim/Meshy_AI_Emerald_Elegance_0216113256_texture_roughness.png",
      metalness: "assets/anim/Meshy_AI_Emerald_Elegance_0216113256_texture_metallic.png",
    },

    videoReadyTimeoutMs: 2500,
    highlightMinMs: 3000,
    highlightMaxMs: 10000,
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const nowMs = () => Date.now();
  const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randMs = (a, b) => (Math.random() * (b - a) + a) * 1000;
  const resolveAsset = (p) => `${CFG.assetsBase}${p || ""}`.replace(/ /g, "%20");
  const isFbxAsset = (p) => /\.fbx$/i.test(p || "");

  const pickClip = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

  const estimateTalkMs = (text) => {
    const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
    const wpm = 160;
    const ms = (words / wpm) * 60000;
    return Math.max(2000, Math.min(15000, Math.round(ms)));
  };

  // -----------------------------
  // Guard
  // -----------------------------
  const ROOT_ID = "eyeai-root";
  if (document.getElementById(ROOT_ID)) return;

  // -----------------------------
  // CSS (external)
  // -----------------------------
  const styleLinkId = "eyeai-style-link";
  if (!document.getElementById(styleLinkId)) {
    const link = document.createElement("link");
    link.id = styleLinkId;
    link.rel = "stylesheet";
    link.href = resolveAsset("eyeai.css");
    document.head.appendChild(link);
  }

  // -----------------------------
  // DOM
  // -----------------------------
  const root = document.createElement("div");
  root.id = ROOT_ID;

  const DPR = window.devicePixelRatio || 1;

  const shell = document.createElement("div");
  shell.className = "eyeai-shell";
  shell.style.right = `${CFG.avatarPos.right}px`;
  shell.style.bottom = `${CFG.avatarPos.bottom}px`;
  shell.style.position = "fixed";

  const vtuber = document.createElement("div");
  vtuber.className = "eyeai-vtuber";
  vtuber.style.width = `${CFG.avatarWidth}px`;
  vtuber.style.height = `${CFG.avatarHeight}px`;
  vtuber.style.transform = `scale(${CFG.avatarUIScale / DPR})`;
  vtuber.style.transformOrigin = "bottom right";
  vtuber.style.zoom = DPR;

  const frame = document.createElement("div");
  frame.className = "eyeai-frame";

  let avatarFollowInput = !!CFG.avatarFollowInput;
  let avatarManuallyMoved = false;
  let ctrlDown = false;

  const dragHint = document.createElement("div");
  dragHint.className = "eyeai-drag-hint";
  dragHint.textContent = avatarFollowInput ? "Ctrl+Drag to move" : "Drag me";
  dragHint.style.display = "none";

  const closeBtn = document.createElement("button");
  closeBtn.className = "eyeai-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";

  // Idle still video (paused)
  const idleStill = document.createElement("video");
  idleStill.className = "eyeai-layer";
  idleStill.muted = true;
  idleStill.playsInline = true;
  idleStill.autoplay = false;
  idleStill.loop = false;
  idleStill.preload = "auto";
  if (!isFbxAsset(CFG.idleMainVideo)) {
    idleStill.src = resolveAsset(CFG.idleMainVideo);
  }

  // Active animation video
  const animVideo = document.createElement("video");
  animVideo.className = "eyeai-layer";
  animVideo.muted = true;
  animVideo.playsInline = true;
  animVideo.autoplay = false;
  animVideo.loop = true;
  animVideo.preload = "auto";
  animVideo.setAttribute("playsinline", "");
  animVideo.style.display = "none";

  // 3D layer (used for FBX clips)
  const threeLayer = document.createElement("canvas");
  threeLayer.className = "eyeai-layer";
  threeLayer.style.display = "none";
  threeLayer.style.opacity = "1";
  threeLayer.style.transition = "opacity 240ms ease";
  threeLayer.style.pointerEvents = "auto";
  threeLayer.style.touchAction = "none";
  threeLayer.style.cursor = "grab";

  vtuber.appendChild(idleStill);
  vtuber.appendChild(animVideo);
  vtuber.appendChild(threeLayer);
  vtuber.appendChild(frame);
  vtuber.appendChild(dragHint);

  // UI (separate draggable shell)
  const uiShell = document.createElement("div");
  uiShell.className = "eyeai-ui-shell";
  uiShell.style.right = `${CFG.inputPos.right}px`;
  uiShell.style.bottom = `${CFG.inputPos.bottom}px`;

  const ui = document.createElement("div");
  ui.className = "eyeai-ui";
  ui.style.width = `${CFG.uiMaxWidth}px`;

  const input = document.createElement("input");
  input.className = "eyeai-input";
  input.placeholder = "Ask…";

  const askBtn = document.createElement("button");
  askBtn.className = "eyeai-btn";
  askBtn.textContent = "Ask";
  const standBtn = document.createElement("button");
  standBtn.className = "eyeai-btn eyeai-stand-btn";
  standBtn.type = "button";
  standBtn.textContent = "Stand Up";
  standBtn.style.display = "none";

  ui.appendChild(input);
  ui.appendChild(askBtn);
  ui.appendChild(standBtn);

  uiShell.appendChild(ui);

  const bubble = document.createElement("div");
  bubble.className = "eyeai-bubble";
  bubble.style.maxWidth = `${CFG.bubbleMaxWidth}px`;
  bubble.style.maxHeight = `${CFG.bubbleMaxHeight}px`;
  const bubbleClose = document.createElement("button");
  bubbleClose.className = "eyeai-bubble-close";
  bubbleClose.type = "button";
  bubbleClose.textContent = "×";
  bubble.appendChild(bubbleClose);
  const bubbleBody = document.createElement("div");
  bubbleBody.className = "eyeai-bubble-body";
  bubble.appendChild(bubbleBody);
  const bubbleCollapsed = document.createElement("div");
  bubbleCollapsed.className = "eyeai-bubble-collapsed";
  bubbleCollapsed.textContent = "Show answer";
  bubble.appendChild(bubbleCollapsed);

  shell.appendChild(vtuber);
  closeBtn.style.display = "none";

  root.appendChild(shell);
  root.appendChild(uiShell);
  root.appendChild(bubble);
  document.body.appendChild(root);
  let startupSequenceActive = false;

  function syncAvatarToUi() {
    if (!avatarFollowInput) return;
    const rect = uiShell.getBoundingClientRect();
    const minDockRight = Number.isFinite(CFG.avatarDockMinRight) ? CFG.avatarDockMinRight : -320;
    const right = Math.max(minDockRight, window.innerWidth - rect.right + (CFG.avatarDockOffsetX || 0));
    const minBottom = Number.isFinite(CFG.avatarMinBottom) ? CFG.avatarMinBottom : -260;
    const bottom = Math.max(minBottom, window.innerHeight - rect.top + 2 + (CFG.avatarDockOffsetY || 0));
    shell.style.right = `${right}px`;
    shell.style.bottom = `${bottom}px`;
  }
  syncAvatarToUi();
  requestAnimationFrame(syncAvatarToUi);

  // Ensure the idle still frame is loaded and visible on startup
  idleStill.load();
  queueMicrotask(() => {
    runStartupSequence();
  });

  // -----------------------------
  // Idle still setup
  // -----------------------------
  let idleStillHold = false;
  idleStill.addEventListener("loadeddata", () => {
    if (idleStillHold) return;
    idleStill.currentTime = 0;
    idleStill.pause();
  });

  // -----------------------------
  // Video helpers
  // -----------------------------
  let animTimeHandler = null;
  const threeState = {
    ready: false,
    failed: false,
    initPromise: null,
    THREE: null,
    FBXLoader: null,
    SkeletonUtils: null,
    renderer: null,
    scene: null,
    camera: null,
    loader: null,
    mixer: null,
    clock: null,
    currentRoot: null,
    currentAction: null,
    currentDurationMs: 5000,
    clipCache: new Map(),
    textureLoader: null,
    textureCache: new Map(),
    controls: null,
    orbiting: false,
    playRange: null,
    rafId: 0,
  };

  async function loadTextureCached(src) {
    if (!src || !threeState.textureLoader || !threeState.THREE) return null;
    const key = resolveAsset(src);
    if (threeState.textureCache.has(key)) return threeState.textureCache.get(key);
    const texture = await threeState.textureLoader.loadAsync(key);
    texture.wrapS = threeState.THREE.RepeatWrapping;
    texture.wrapT = threeState.THREE.RepeatWrapping;
    texture.generateMipmaps = true;
    texture.minFilter = threeState.THREE.LinearMipmapLinearFilter;
    texture.magFilter = threeState.THREE.LinearFilter;
    const maxAniso = threeState.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    texture.anisotropy = Math.min(8, maxAniso);
    texture.needsUpdate = true;
    threeState.textureCache.set(key, texture);
    return texture;
  }

  function fitCameraToModel(root) {
    const THREE = threeState.THREE;
    if (!THREE || !root) return;
    const initialBox = new THREE.Box3().setFromObject(root);
    if (initialBox.isEmpty()) return;
    const initialSize = initialBox.getSize(new THREE.Vector3());
    const srcHeight = Math.max(0.001, initialSize.y || 0.001);
    const targetHeight = CFG.avatarHeight * 0.9;
    const autoScale = targetHeight / srcHeight;
    root.scale.multiplyScalar(autoScale);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.y -= center.y;
    root.position.z -= center.z;

    const fitHeight = Math.max(1, size.y * 1.5);
    const fitWidth = Math.max(1, size.x * 1.6);
    const fov = THREE.MathUtils.degToRad(threeState.camera.fov);
    const camZHeight = Math.abs((fitHeight * 0.5) / Math.tan(fov / 2));
    const fovH = 2 * Math.atan(Math.tan(fov / 2) * threeState.camera.aspect);
    const camZWidth = Math.abs((fitWidth * 0.5) / Math.tan(fovH / 2));
    let camZ = Math.max(camZHeight, camZWidth) * 1.4;
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    threeState.camera.near = Math.max(0.05, camZ / 280);
    threeState.camera.far = Math.max(1200, camZ * 10);
    threeState.camera.updateProjectionMatrix();
    threeState.camera.position.set(0, 0, camZ);
    const targetY = -maxDim * 0.08;
    threeState.camera.lookAt(0, targetY, 0);
    if (threeState.controls) {
      threeState.controls.target.set(0, targetY, 0);
      threeState.controls.minDistance = camZ * 0.45;
      threeState.controls.maxDistance = camZ * 2.8;
      threeState.controls.update();
    }
  }

  function renderThreeLoop() {
    if (!threeState.ready) return;
    const delta = Math.min(0.05, threeState.clock.getDelta());
    if (threeState.mixer) threeState.mixer.update(delta);
    if (threeState.currentAction && threeState.playRange) {
      const { startSec, endSec, loop } = threeState.playRange;
      if (endSec > startSec + 0.001 && threeState.currentAction.time >= endSec) {
        if (loop) {
          threeState.currentAction.time = startSec;
        } else {
          threeState.currentAction.paused = true;
          if (carriedMode && !carriedReachedHoldPose) {
            carriedReachedHoldPose = true;
            standBtn.style.display = "inline-flex";
          }
        }
      }
    }
    if (threeState.controls) threeState.controls.update();
    threeState.renderer.render(threeState.scene, threeState.camera);
    threeState.rafId = requestAnimationFrame(renderThreeLoop);
  }

  function startThreeLoop() {
    if (!threeState.ready || threeState.rafId) return;
    threeState.clock.start();
    threeState.rafId = requestAnimationFrame(renderThreeLoop);
  }

  async function ensureThreeReady() {
    if (threeState.ready) return true;
    if (threeState.failed) return false;
    if (threeState.initPromise) return threeState.initPromise;

    threeState.initPromise = (async () => {
      try {
        const THREE = await import("https://esm.sh/three@0.160.0");
        const { FBXLoader } = await import("https://esm.sh/three@0.160.0/examples/jsm/loaders/FBXLoader.js");
        const SkeletonUtils = await import("https://esm.sh/three@0.160.0/examples/jsm/utils/SkeletonUtils.js");
        const { OrbitControls } = await import("https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js");

        threeState.THREE = THREE;
        threeState.FBXLoader = FBXLoader;
        threeState.SkeletonUtils = SkeletonUtils;

        const renderer = new THREE.WebGLRenderer({
          canvas: threeLayer,
          alpha: true,
          antialias: true,
          logarithmicDepthBuffer: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(CFG.avatarWidth, CFG.avatarHeight, false);
        renderer.setClearColor(0x000000, 0);
        renderer.sortObjects = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, CFG.avatarWidth / CFG.avatarHeight, 0.1, 2000);
        camera.position.set(0, 85, 260);
        camera.lookAt(0, 80, 0);
        const controls = new OrbitControls(camera, threeLayer);
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.rotateSpeed = 0.65;
        controls.zoomSpeed = 0.85;
        controls.target.set(0, 0, 0);
        controls.minPolarAngle = 0.2;
        controls.maxPolarAngle = Math.PI - 0.2;
        controls.addEventListener("start", () => {
          threeState.orbiting = true;
          threeLayer.style.cursor = "grabbing";
        });
        controls.addEventListener("end", () => {
          threeState.orbiting = false;
          threeLayer.style.cursor = "grab";
        });
        controls.enabled = !ctrlDown;

        const hemi = new THREE.HemisphereLight(0xfff2df, 0x7a5f4a, 0.95);
        scene.add(hemi);
        const ambient = new THREE.AmbientLight(0xfff6eb, 0.18);
        scene.add(ambient);
        const key = new THREE.DirectionalLight(0xfff1e0, 1.45);
        key.position.set(3, 7, 6);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xfff8f0, 0.5);
        fill.position.set(-4, 2, -3);
        scene.add(fill);
        const rim = new THREE.DirectionalLight(0xffe7d0, 0.32);
        rim.position.set(0, 5, -6);
        scene.add(rim);

        threeState.renderer = renderer;
        threeState.scene = scene;
        threeState.camera = camera;
        threeState.loader = new FBXLoader();
        threeState.textureLoader = new THREE.TextureLoader();
        threeState.clock = new THREE.Clock();
        threeState.controls = controls;
        threeState.ready = true;
        startThreeLoop();
        return true;
      } catch (err) {
        console.warn("FBX runtime unavailable, falling back to video mode", err);
        threeState.failed = true;
        return false;
      }
    })();

    return threeState.initPromise;
  }

  async function loadFbxClip(src) {
    const key = resolveAsset(src);
    let cached = threeState.clipCache.get(key);
    if (!cached) {
      cached = await threeState.loader.loadAsync(key);
      threeState.clipCache.set(key, cached);
    }
    const clone = (threeState.SkeletonUtils.clone || ((obj) => obj.clone(true)))(cached);
    const clips = (cached.animations && cached.animations.length ? cached.animations : clone.animations) || [];
    const clip = clips[0] || null;
    const durationMs = clip ? Math.max(1000, Math.round(clip.duration * 1000)) : 5000;
    const texCfg = CFG.characterTextures || {};
    const [baseColorTex, normalTex, roughnessTex, metalnessTex] = await Promise.all([
      loadTextureCached(texCfg.baseColor),
      loadTextureCached(texCfg.normal),
      loadTextureCached(texCfg.roughness),
      loadTextureCached(texCfg.metalness),
    ]);
    if (baseColorTex && threeState.THREE?.SRGBColorSpace) {
      baseColorTex.colorSpace = threeState.THREE.SRGBColorSpace;
    }
    if (normalTex && threeState.THREE?.NoColorSpace) normalTex.colorSpace = threeState.THREE.NoColorSpace;
    if (roughnessTex && threeState.THREE?.NoColorSpace) roughnessTex.colorSpace = threeState.THREE.NoColorSpace;
    if (metalnessTex && threeState.THREE?.NoColorSpace) metalnessTex.colorSpace = threeState.THREE.NoColorSpace;
    let hasRenderableMesh = false;
    clone.traverse((obj) => {
      if (!obj || (!obj.isMesh && !obj.isSkinnedMesh)) return;
      hasRenderableMesh = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (baseColorTex) mat.map = baseColorTex;
        if (normalTex) mat.normalMap = normalTex;
        if (roughnessTex) mat.roughnessMap = roughnessTex;
        if (metalnessTex) mat.metalnessMap = metalnessTex;
        if (normalTex) mat.normalScale?.set?.(1, 1);
        if (roughnessTex) mat.roughness = 1;
        if (metalnessTex) mat.metalness = 1;
        if (mat.map) mat.map.needsUpdate = true;
        if (mat.normalMap) mat.normalMap.needsUpdate = true;
        if (mat.roughnessMap) mat.roughnessMap.needsUpdate = true;
        if (mat.metalnessMap) mat.metalnessMap.needsUpdate = true;
        if (mat.map && threeState.THREE?.SRGBColorSpace) mat.map.colorSpace = threeState.THREE.SRGBColorSpace;
        if (mat.emissiveMap && threeState.THREE?.SRGBColorSpace) {
          mat.emissiveMap.colorSpace = threeState.THREE.SRGBColorSpace;
        }
        if (mat.color && mat.color.setRGB) mat.color.setRGB(1, 1, 1);
        mat.needsUpdate = true;
      }
    });
    if (!hasRenderableMesh) {
      throw new Error(`FBX has animation data but no renderable mesh: ${src}`);
    }
    return { root: clone, clip, durationMs };
  }

  function stopFbx() {
    if (!threeState.ready) return;
    if (threeState.currentAction) {
      threeState.currentAction.stop();
      threeState.currentAction = null;
    }
    if (threeState.currentRoot) {
      threeState.scene.remove(threeState.currentRoot);
      threeState.currentRoot = null;
    }
    threeState.mixer = null;
    threeState.playRange = null;
    threeState.currentDurationMs = 5000;
    threeLayer.style.display = "none";
  }

  async function playFbx(src, loop = true, opts = {}) {
    const ready = await ensureThreeReady();
    if (!ready) return false;
    try {
      const { root, clip, durationMs } = await loadFbxClip(src);
      stopFbx();
      threeState.scene.add(root);
      fitCameraToModel(root);
      threeState.currentRoot = root;
      threeState.currentDurationMs = durationMs;
      threeState.mixer = new threeState.THREE.AnimationMixer(root);
      if (clip) {
        const clipDuration = Math.max(0.001, clip.duration || 0.001);
        let startSec = Math.max(0, Number(opts.rangeStartSec) || 0);
        let endSec = Math.min(clipDuration, Number(opts.rangeEndSec) || clipDuration);
        if (opts.halfOnly) {
          const frames = Math.max(1, Number(CFG.carriedLoopFrames) || 5);
          const fps = Math.max(1, Number(CFG.carriedLoopFps) || 30);
          const frameWindowSec = frames / fps;
          startSec = 0;
          endSec = Math.min(clipDuration, frameWindowSec);
        }
        if (endSec <= startSec + 0.001) {
          startSec = 0;
          endSec = clipDuration;
        }
        threeState.playRange = { startSec, endSec, loop };
        const action = threeState.mixer.clipAction(clip);
        action.reset();
        action.clampWhenFinished = !loop;
        action.setLoop(loop ? threeState.THREE.LoopRepeat : threeState.THREE.LoopOnce, loop ? Infinity : 1);
        action.time = startSec;
        action.play();
        threeState.currentAction = action;
      } else {
        threeState.playRange = null;
      }
      animVideo.style.display = "none";
      idleStill.style.display = "none";
      threeLayer.style.display = "block";
      startThreeLoop();
      return true;
    } catch (err) {
      console.warn("FBX play failed", err);
      return false;
    }
  }

  async function crossfadeToFbx(src, loop = true, playOpts = {}) {
    const ms = Math.max(60, Number(playOpts.fadeMs) || Number(CFG.dragCrossfadeMs) || 240);
    threeLayer.style.transition = `opacity ${ms}ms ease`;
    threeLayer.style.opacity = "0";
    await sleepMs(Math.round(ms * 0.55));
    const ok = await playFbx(src, loop, playOpts);
    if (!ok) {
      threeLayer.style.opacity = "1";
      return false;
    }
    threeLayer.style.opacity = "0";
    requestAnimationFrame(() => {
      threeLayer.style.opacity = "1";
    });
    await sleepMs(ms);
    return true;
  }

  async function runStartupSequence() {
    startupSequenceActive = true;
    try {
      const greeting = CFG.greetingAnimation;
      if (greeting && isFbxAsset(greeting)) {
        const played = await playFbx(greeting, false);
        if (played) {
          const duration = Math.max(300, threeState.currentDurationMs || 1200);
          await sleepMs(duration);
          const faded = await crossfadeToFbx(CFG.idleMainVideo, true);
          if (!faded) {
            await holdIdleStill(CFG.idleMainVideo);
          }
          return;
        }
      }
      await holdIdleStill(CFG.idleMainVideo);
    } finally {
      startupSequenceActive = false;
    }
  }

  async function playVideo(src, loop = true) {
    if (isFbxAsset(src)) return playFbx(src, loop);
    if (document.visibilityState === "hidden") return;
    stopFbx();
    idleStill.style.display = "none";
    animVideo.src = resolveAsset(src);
    animVideo.loop = loop;
    if (animTimeHandler) {
      animVideo.removeEventListener("timeupdate", animTimeHandler);
      animTimeHandler = null;
    }
    try {
      await animVideo.play();
    } catch (err) {
      if (err && err.name !== "AbortError") {
        console.warn("Video play failed", err);
      }
      return;
    }
    animVideo.style.display = "block";
  }

  function stopVideo() {
    if (animTimeHandler) {
      animVideo.removeEventListener("timeupdate", animTimeHandler);
      animTimeHandler = null;
    }
    animVideo.pause();
    animVideo.style.display = "none";
  }

  async function holdIdleStill(src) {
    if (isFbxAsset(src)) {
      await playFbx(src, true);
      return;
    }
    try {
      stopFbx();
      idleStillHold = true;
      idleStill.src = resolveAsset(src);
      await waitForMetadata(idleStill);
      const last = Math.max(0, (idleStill.duration || 0) - 0.05);
      idleStill.currentTime = last;
      idleStill.pause();
      idleStill.style.display = "block";
      animVideo.style.display = "none";
    } catch {
      // no-op
    }
  }

  function waitForMetadata(video) {
    if (video.readyState >= 1 && !isNaN(video.duration)) return Promise.resolve();
    return new Promise((resolve) => {
      const onMeta = () => {
        video.removeEventListener("loadedmetadata", onMeta);
        resolve();
      };
      video.addEventListener("loadedmetadata", onMeta);
    });
  }

  async function playSegment(video, startSec, endSec, loop) {
    if (document.visibilityState === "hidden") return false;
    await waitForMetadata(video);
    const dur = video.duration || 0;
    const start = Math.max(0, Math.min(startSec, dur));
    const end = Math.max(start, Math.min(endSec, dur));
    if (end <= start) return false;

    let resolveDone;
    const done = new Promise((resolve) => {
      resolveDone = resolve;
    });

    const onTime = () => {
      if (video.currentTime >= end) {
        if (loop) {
          video.currentTime = start;
        } else {
          video.pause();
          video.removeEventListener("timeupdate", onTime);
          if (animTimeHandler === onTime) animTimeHandler = null;
          resolveDone(true);
        }
      }
    };

    if (animTimeHandler) {
      video.removeEventListener("timeupdate", animTimeHandler);
      animTimeHandler = null;
    }
    video.currentTime = start;
    video.addEventListener("timeupdate", onTime);
    animTimeHandler = onTime;
    try {
      await video.play();
    } catch (err) {
      if (err && err.name !== "AbortError") {
        console.warn("Video segment play failed", err);
      }
      return false;
    }
    if (loop) return true;
    return await done;
  }

  async function playLoopFor(src, ms) {
    if (!src) return false;
    if (isFbxAsset(src)) {
      const ok = await playFbx(src, true);
      if (!ok) return false;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return true;
    }
    stopFbx();
    stopVideo();
    animVideo.src = resolveAsset(src);
    animVideo.loop = true;
    animVideo.style.display = "block";
    await waitForMetadata(animVideo);
    try {
      await animVideo.play();
    } catch (err) {
      if (err && err.name !== "AbortError") {
        console.warn("Video play failed", err);
      }
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
    animVideo.loop = false;
    return true;
  }

  // -----------------------------
  // Scheduler
  // -----------------------------
  const idlePool = [CFG.idleMainVideo, ...CFG.idleRareVideos];
  let nextIdle = nowMs() + 3000;
  let until = 0;

  let talkTimer = null;
  let talkToken = 0;
  let animationHold = false;
  let highlightTimer = null;
  let activeHighlights = [];
  let bubbleCustomPos = null;
  let idlePlaying = false;
  let carriedMode = false;
  let carriedToken = 0;
  let carriedReachedHoldPose = false;

  async function enterCarriedMode() {
    if (carriedMode) return;
    carriedMode = true;
    carriedReachedHoldPose = false;
    standBtn.style.display = "none";
    animationHold = true;
    until = 0;
    const myToken = ++carriedToken;
    const clip = CFG.carriedAnimation || CFG.idleMainVideo;
    const ok = await crossfadeToFbx(clip, false);
    if (!ok && carriedToken === myToken) {
      carriedMode = false;
      releaseToIdle();
      standBtn.style.display = "none";
      return;
    }
  }

  async function cancelCarriedModeEarly() {
    if (!carriedMode) return;
    carriedMode = false;
    carriedReachedHoldPose = false;
    standBtn.style.display = "none";
    const myToken = ++carriedToken;
    await crossfadeToFbx(CFG.idleMainVideo, true, { fadeMs: Math.max(90, Number(CFG.dragCrossfadeMs) || 90) });
    if (carriedToken !== myToken) return;
    animationHold = false;
    until = 0;
    nextIdle = nowMs() + 3000;
  }

  async function exitCarriedMode() {
    if (!carriedMode) return;
    carriedMode = false;
    carriedReachedHoldPose = false;
    standBtn.style.display = "none";
    const myToken = ++carriedToken;
    const standUp = CFG.standUpAnimation;
    if (standUp && isFbxAsset(standUp)) {
      const bridgeOk = await crossfadeToFbx(standUp, false, {
        fadeMs: Math.max(120, Number(CFG.dragCrossfadeMs) || 120),
      });
      if (carriedToken !== myToken) return;
      if (bridgeOk) {
        const dur = Math.max(250, threeState.currentDurationMs || 900);
        const blendLead = Math.max(80, Number(CFG.standToIdleCrossfadeMs) || 180);
        await sleepMs(Math.max(0, dur - blendLead));
      }
    }
    if (carriedToken !== myToken) return;
    const ok = await crossfadeToFbx(CFG.idleMainVideo, true, {
      fadeMs: Math.max(120, Number(CFG.standToIdleCrossfadeMs) || 180),
    });
    if (carriedToken !== myToken) return;
    if (!ok) {
      releaseToIdle();
      return;
    }
    animationHold = false;
    until = 0;
    nextIdle = nowMs() + 3000;
  }

  function releaseToIdle() {
    stopVideo();
    carriedMode = false;
    carriedReachedHoldPose = false;
    carriedToken += 1;
    standBtn.style.display = "none";
    animationHold = false;
    until = 0;
    nextIdle = nowMs() + 3000;
    holdIdleStill(CFG.idleMainVideo);
  }

  async function tick() {
    if (startupSequenceActive) return;
    if (animationHold) return;
    const t = nowMs();
    if (t < until) return;

    if (t >= nextIdle) {
      if (idlePlaying) return;
      idlePlaying = true;
      const clip = idlePool[Math.floor(Math.random() * idlePool.length)];
      if (isFbxAsset(clip)) {
        try {
          const played = await playFbx(clip, false);
          if (!played) {
            nextIdle = t + 5000;
            return;
          }
          const durMs = Math.max(1000, threeState.currentDurationMs || 5000);
          await new Promise((resolve) => setTimeout(resolve, durMs));
          await holdIdleStill(CFG.idleMainVideo);
          until = t + durMs;
          nextIdle = t + randMs(CFG.idleMainEverySecondsMin, CFG.idleMainEverySecondsMax);
          return;
        } finally {
          idlePlaying = false;
        }
      }
      stopFbx();
      stopVideo();
      animVideo.src = resolveAsset(clip);
      animVideo.loop = false;
      await waitForMetadata(animVideo);
      const durMs = Math.max(1000, Math.round((animVideo.duration || 5) * 1000));
      animVideo.style.display = "block";
      try {
        const played = await playSegment(animVideo, 0, (animVideo.duration || 5), false);
        if (!played) {
          animVideo.style.display = "none";
          nextIdle = t + 5000;
          return;
        }
        await holdIdleStill(clip);
        stopVideo();
        until = t + durMs;
        nextIdle = t + randMs(CFG.idleMainEverySecondsMin, CFG.idleMainEverySecondsMax);
        return;
      } finally {
        idlePlaying = false;
      }
    }

    stopVideo();
  }

  const tickInterval = setInterval(tick, 250);

  // -----------------------------
  // Ask handling
  // -----------------------------
  function positionBubble() {
    if (bubbleCustomPos) {
      bubble.style.left = `${bubbleCustomPos.x}px`;
      bubble.style.top = `${bubbleCustomPos.y}px`;
      bubble.style.right = "auto";
      bubble.style.bottom = "auto";
      return;
    }
    if (CFG.bubbleMode === "fixed") {
      const x = window.innerWidth - CFG.bubbleMaxWidth - 18;
      const y = 60;
      bubble.style.left = `${x}px`;
      bubble.style.top = `${y}px`;
      bubble.style.right = "auto";
      bubble.style.bottom = "auto";
      return;
    }

    const rect = shell.getBoundingClientRect();
    const anchorX = rect.right;
    const anchorY = rect.top;
    bubble.style.left = `${anchorX + CFG.bubbleOffset.dx}px`;
    bubble.style.top = `${anchorY + CFG.bubbleOffset.dy}px`;
    bubble.style.right = "auto";
    bubble.style.bottom = "auto";
  }

  function showBubble(text) {
    bubble.classList.remove("eyeai-collapsed");
    bubbleBody.textContent = text;
    positionBubble();
    bubble.style.display = "block";
  }

  function minimizeBubble() {
    bubble.classList.add("eyeai-collapsed");
  }

  function restoreBubble() {
    bubble.classList.remove("eyeai-collapsed");
  }

  function clearHighlights() {
    if (highlightTimer) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }
    for (const span of activeHighlights) {
      if (!span || !span.parentNode) continue;
      const parent = span.parentNode;
      const text = document.createTextNode(span.textContent || "");
      parent.replaceChild(text, span);
      if (parent.normalize) parent.normalize();
    }
    activeHighlights = [];
  }

  function sanitizeForMatch(text) {
    return (text || "")
      .replace(/\*\*/g, "")
      .replace(/[`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function wrapTextRange(node, start, end) {
    const text = node.nodeValue || "";
    const before = text.slice(0, start);
    const middle = text.slice(start, end);
    const after = text.slice(end);
    const parent = node.parentNode;
    if (!parent) return null;
    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    const mark = document.createElement("span");
    mark.className = "eyeai-highlight";
    mark.textContent = middle;
    frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));
    parent.replaceChild(frag, node);
    return mark;
  }

  function buildKeywords(text) {
    const stop = new Set([
      "the", "and", "that", "this", "with", "from", "your", "you", "about", "what",
      "when", "where", "which", "their", "there", "have", "has", "been", "will",
      "would", "could", "should", "into", "over", "under", "because", "also",
      "than", "then", "them", "they", "here", "just", "like", "some", "more",
      "most", "such", "many", "much", "find", "page", "content", "based", "answer",
      "details", "size", "therefore", "cant", "cannot", "couldnt", "couldn't"
    ]);
    const words = (text || "").toLowerCase().match(/\b[a-z0-9]{3,}\b/g) || [];
    const unique = [];
    const seen = new Set();
    for (const w of words) {
      if (stop.has(w) || seen.has(w)) continue;
      seen.add(w);
      unique.push(w);
      if (unique.length >= 8) break;
    }
    return unique;
  }

  function findTextMatch(phrase) {
    const needle = (phrase || "").trim();
    if (!needle) return null;
    const lowerNeedle = needle.toLowerCase();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (parent.closest(`#${ROOT_ID}`)) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          if (tag === "TEXTAREA" || tag === "INPUT") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";
      const idx = text.toLowerCase().indexOf(lowerNeedle);
      if (idx !== -1) return { node, start: idx, end: idx + needle.length };
    }
    return null;
  }

  function getPageText() {
    const nodes = collectTextNodes();
    let text = "";
    for (const node of nodes) {
      const value = node.nodeValue || "";
      if (!value.trim()) continue;
      text += value + " ";
      if (text.length > 200000) break;
    }
    return text.replace(/\s+/g, " ").trim();
  }

  function findBestKeywordMatch(keywords) {
    if (!keywords || !keywords.length) return null;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (parent.closest(`#${ROOT_ID}`)) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          if (tag === "TEXTAREA" || tag === "INPUT") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let best = null;
    let bestScore = 0;
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue || "").toLowerCase();
      let score = 0;
      let firstMatch = null;
      for (const kw of keywords) {
        const idx = text.indexOf(kw);
        if (idx !== -1) {
          score += 1;
          if (!firstMatch) {
            firstMatch = { start: idx, end: idx + kw.length };
          }
        }
      }
      if (score > bestScore && firstMatch) {
        bestScore = score;
        best = { node, start: firstMatch.start, end: firstMatch.end };
      }
    }
    return best;
  }

  function normalizeForMatch(text) {
    const src = text || "";
    let out = "";
    let lastSpace = false;
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      const isAlnum = /[a-z0-9]/i.test(ch);
      if (isAlnum) {
        out += ch.toLowerCase();
        lastSpace = false;
      } else {
        if (!lastSpace) {
          out += " ";
          lastSpace = true;
        }
      }
    }
    return out.trim();
  }

  function collectTextNodes() {
    const nodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (parent.closest(`#${ROOT_ID}`)) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          if (tag === "TEXTAREA" || tag === "INPUT") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
      if (nodes.length > 5000) break;
    }
    return nodes;
  }

  function buildNormalizedIndex(nodes, limit = 200000) {
    let text = "";
    const map = [];
    let lastWasSpace = false;

    for (const node of nodes) {
      const value = node.nodeValue || "";
      for (let i = 0; i < value.length; i += 1) {
        const ch = value[i];
        const isAlnum = /[a-z0-9]/i.test(ch);
        if (isAlnum) {
          text += ch.toLowerCase();
          map.push({ node, offset: i });
          lastWasSpace = false;
        } else if (!lastWasSpace) {
          text += " ";
          map.push({ node, offset: i });
          lastWasSpace = true;
        }
        if (text.length >= limit) return { text, map };
      }
      if (!lastWasSpace && text.length) {
        text += " ";
        map.push({ node, offset: (value.length ? value.length - 1 : 0) });
        lastWasSpace = true;
      }
      if (text.length >= limit) return { text, map };
    }

    return { text, map };
  }

  function wrapTextNodePortion(node, start, end) {
    const text = node.nodeValue || "";
    const before = text.slice(0, start);
    const middle = text.slice(start, end);
    const after = text.slice(end);
    const parent = node.parentNode;
    if (!parent || !middle) return null;
    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    const mark = document.createElement("span");
    mark.className = "eyeai-highlight";
    mark.textContent = middle;
    frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));
    parent.replaceChild(frag, node);
    return mark;
  }

  function highlightQuoteExact(quote) {
    const cleanedQuote = normalizeForMatch(sanitizeForMatch(quote));
    if (!cleanedQuote) return false;
    const nodes = collectTextNodes();
    const { text, map } = buildNormalizedIndex(nodes);
    const idx = text.indexOf(cleanedQuote);
    if (idx === -1) return false;

    const startMap = map[idx];
    const endMap = map[idx + cleanedQuote.length - 1];
    if (!startMap || !endMap) return false;

    const startIndex = nodes.indexOf(startMap.node);
    const endIndex = nodes.indexOf(endMap.node);
    if (startIndex === -1 || endIndex === -1) return false;

    for (let i = startIndex; i <= endIndex; i += 1) {
      const node = nodes[i];
      if (!node || !node.parentNode) continue;
      if (i === startIndex && i === endIndex) {
        const mark = wrapTextNodePortion(node, startMap.offset, endMap.offset + 1);
        if (mark) activeHighlights.push(mark);
      } else if (i === startIndex) {
        const mark = wrapTextNodePortion(node, startMap.offset, (node.nodeValue || "").length);
        if (mark) activeHighlights.push(mark);
      } else if (i === endIndex) {
        const mark = wrapTextNodePortion(node, 0, endMap.offset + 1);
        if (mark) activeHighlights.push(mark);
      } else {
        const mark = wrapTextNodePortion(node, 0, (node.nodeValue || "").length);
        if (mark) activeHighlights.push(mark);
      }
    }

    if (activeHighlights.length) {
      activeHighlights[0].scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
    return false;
  }

  function highlightQuotes(quotes, durationMs) {
    if (!quotes || !quotes.length) return false;
    let hit = false;
    for (const quote of quotes) {
      if (highlightQuoteExact(quote)) {
        hit = true;
        break;
      }
    }

    if (!hit) return false;
    const clippedMs = Math.min(CFG.highlightMaxMs, Math.max(CFG.highlightMinMs, durationMs));
    highlightTimer = setTimeout(() => {
      clearHighlights();
    }, clippedMs);
    return true;
  }

  function extractQuoteFromPage(answer) {
    const pageText = getPageText();
    if (!pageText) return null;
    const sentences = pageText
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20 && s.length <= 320);

    if (!sentences.length) return null;

    const tokens = buildKeywords(answer);
    const numbers = (answer || "").match(/\b\d+(\.\d+)?\b/g) || [];
    let best = null;
    let bestScore = 0;

    for (const s of sentences) {
      const lower = s.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (lower.includes(t)) score += 2;
      }
      for (const n of numbers) {
        if (lower.includes(n)) score += 3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }

    return bestScore > 0 ? best : null;
  }

  function highlightRelevantText(answer, question, durationMs) {
    clearHighlights();
    const cleanedAnswer = sanitizeForMatch(answer);
    const sentences = (cleanedAnswer || "")
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);

    let match = null;
    for (const sentence of sentences) {
      match = findTextMatch(sentence);
      if (match) break;
    }

    if (!match) {
      const keywords = buildKeywords(`${question} ${cleanedAnswer}`);
      match = findBestKeywordMatch(keywords);
    }

    if (!match) return false;
    const mark = wrapTextRange(match.node, match.start, match.end);
    if (!mark) return false;
    activeHighlights.push(mark);
    mark.scrollIntoView({ behavior: "smooth", block: "center" });

    const clippedMs = Math.min(CFG.highlightMaxMs, Math.max(CFG.highlightMinMs, durationMs));
    highlightTimer = setTimeout(() => {
      clearHighlights();
    }, clippedMs);
    return true;
  }

  bubbleClose.addEventListener("click", (e) => {
    e.stopPropagation();
    minimizeBubble();
    releaseToIdle();
    clearHighlights();
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    releaseToIdle();
    clearInterval(tickInterval);
    root.style.display = "none";
    clearHighlights();
  });

  let bubbleDragged = false;

  bubble.addEventListener("click", () => {
    if (bubbleDragged) {
      bubbleDragged = false;
      return;
    }
    minimizeBubble();
  });

  bubbleCollapsed.addEventListener("click", (e) => {
    e.stopPropagation();
    restoreBubble();
  });

  async function handleAsk() {
    const question = input.value.trim();
    if (!question) return;

    input.disabled = true;
    askBtn.disabled = true;
    showBubble("Thinking...");

    animationHold = true;
    if (talkTimer) clearTimeout(talkTimer);
    talkToken += 1;
    const myToken = talkToken;
    clearHighlights();
    bubbleCustomPos = null;

    // No thinking clip (removed per request)

    try {
      const pageText = getPageText();

      const res = await fetch(CFG.backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, pageText }),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      const data = await res.json();
      console.log("AI response:", data);
      console.log("quotes:", data?.quotes);

      let answer =
        data?.answer ??
        data?.response ??
        (typeof data === "string" ? data : JSON.stringify(data));
      const quotes = Array.isArray(data?.quotes) ? data.quotes : [];

      showBubble(answer || "No response.");
      input.value = "";

      const durationMs = estimateTalkMs(answer);
      let quoteHit = highlightQuotes(quotes, durationMs);
      if (!quoteHit) {
        const fallbackQuote = extractQuoteFromPage(answer);
        if (fallbackQuote) {
          quoteHit = highlightQuotes([fallbackQuote], durationMs);
        }
      }
      const resultClip = CFG.resultAnimation || pickClip(CFG.videos?.talkingMid);
      const fadeMs = Math.max(60, Number(CFG.resultCrossfadeMs) || 110);

      if (resultClip && isFbxAsset(resultClip)) {
        const entered = await crossfadeToFbx(resultClip, false, { fadeMs });
        if (!entered) {
          releaseToIdle();
          return;
        }
        if (talkToken !== myToken) return;
        const playMs = Math.max(240, threeState.currentDurationMs || 1000);
        await sleepMs(playMs);
        if (talkToken !== myToken) return;
        await crossfadeToFbx(CFG.idleMainVideo, true, { fadeMs });
        releaseToIdle();
      } else if (resultClip) {
        const midMs = Math.max(2000, durationMs);
        await playLoopFor(resultClip, midMs);
        if (talkToken !== myToken) return;
        await holdIdleStill(CFG.idleMainVideo);
        releaseToIdle();
      } else {
        releaseToIdle();
      }
    } catch (err) {
      showBubble("Sorry, I couldn't reach the server.");
      console.error(err);
      releaseToIdle();
    } finally {
      input.disabled = false;
      askBtn.disabled = false;
    }
  }

  askBtn.addEventListener("click", handleAsk);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAsk();
  });

  window.addEventListener("resize", () => {
    syncAvatarToUi();
    if (bubble.style.display !== "none") positionBubble();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopVideo();
      animationHold = false;
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Control") return;
    ctrlDown = true;
    if (threeState.controls) threeState.controls.enabled = false;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key !== "Control") return;
    ctrlDown = false;
    if (!avatarManuallyMoved) {
      avatarFollowInput = true;
      syncAvatarToUi();
    }
    if (!dragOn && carriedMode && !carriedReachedHoldPose) {
      cancelCarriedModeEarly();
    }
    if (threeState.controls) threeState.controls.enabled = !dragOn;
  });

  // -----------------------------
  // Drag to move (answer bubble)
  // -----------------------------
  let bubbleDragOn = false;
  let bubbleDragStartX = 0;
  let bubbleDragStartY = 0;
  let bubbleStartLeft = 0;
  let bubbleStartTop = 0;

  function onBubbleDragStart(e) {
    if (e.target === bubbleClose) return;
    bubbleDragOn = true;
    const pt = e.touches ? e.touches[0] : e;
    const rect = bubble.getBoundingClientRect();
    bubbleDragStartX = pt.clientX;
    bubbleDragStartY = pt.clientY;
    bubbleStartLeft = rect.left;
    bubbleStartTop = rect.top;
    bubble.style.cursor = "grabbing";
  }

  function onBubbleDragMove(e) {
    if (!bubbleDragOn) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - bubbleDragStartX;
    const dy = pt.clientY - bubbleDragStartY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) bubbleDragged = true;
    const newLeft = Math.max(8, bubbleStartLeft + dx);
    const newTop = Math.max(8, bubbleStartTop + dy);
    bubbleCustomPos = { x: newLeft, y: newTop };
    positionBubble();
  }

  function onBubbleDragEnd() {
    bubbleDragOn = false;
    bubble.style.cursor = "grab";
  }

  bubble.addEventListener("mousedown", onBubbleDragStart);
  window.addEventListener("mousemove", onBubbleDragMove);
  window.addEventListener("mouseup", onBubbleDragEnd);
  bubble.addEventListener("touchstart", onBubbleDragStart, { passive: true });
  window.addEventListener("touchmove", onBubbleDragMove, { passive: true });
  window.addEventListener("touchend", onBubbleDragEnd);

  // -----------------------------
  // Drag to move (avatar)
  // -----------------------------
  let dragOn = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startRight = CFG.avatarPos.right;
  let startBottom = CFG.avatarPos.bottom;

  function onDragStart(e) {
    if (e.target === threeLayer && !ctrlDown) return;
    if (threeState.orbiting && !ctrlDown) return;
    if (avatarFollowInput && !ctrlDown) return;
    if (e.target === input || e.target === askBtn) return;
    if (ctrlDown) {
      avatarFollowInput = false;
      if (threeState.controls) threeState.controls.enabled = false;
      enterCarriedMode();
    }
    dragOn = true;
    const pt = e.touches ? e.touches[0] : e;
    dragStartX = pt.clientX;
    dragStartY = pt.clientY;
    startRight = parseFloat(shell.style.right || CFG.avatarPos.right);
    startBottom = parseFloat(shell.style.bottom || CFG.avatarPos.bottom);
  }

  function onDragMove(e) {
    if (!dragOn) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - dragStartX;
    const dy = pt.clientY - dragStartY;
    const minRight = Number.isFinite(CFG.avatarMinRight) ? CFG.avatarMinRight : -2000;
    const newRight = Math.max(minRight, startRight - dx);
    const minBottom = Number.isFinite(CFG.avatarMinBottom) ? CFG.avatarMinBottom : -260;
    const newBottom = Math.max(minBottom, startBottom - dy);
    shell.style.right = `${newRight}px`;
    shell.style.bottom = `${newBottom}px`;
    avatarManuallyMoved = true;
    if (bubble.style.display !== "none") positionBubble();
  }

  function onDragEnd() {
    dragOn = false;
    if (carriedMode && !carriedReachedHoldPose) {
      cancelCarriedModeEarly();
    }
    if (avatarFollowInput) syncAvatarToUi();
    if (threeState.controls) threeState.controls.enabled = !ctrlDown;
  }

  shell.addEventListener("mousedown", onDragStart);
  threeLayer.addEventListener("mousedown", onDragStart);
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
  shell.addEventListener("touchstart", onDragStart, { passive: true });
  threeLayer.addEventListener("touchstart", onDragStart, { passive: true });
  window.addEventListener("touchmove", onDragMove, { passive: true });
  window.addEventListener("touchend", onDragEnd);
  standBtn.addEventListener("click", async () => {
    await exitCarriedMode();
  });

  // -----------------------------
  // Drag to move (ask UI only)
  // -----------------------------
  let uiDragOn = false;
  let uiDragStartX = 0;
  let uiDragStartY = 0;
  let uiStartRight = CFG.inputPos.right;
  let uiStartBottom = CFG.inputPos.bottom;

  function onUiDragStart(e) {
    if (e.target === input || e.target === askBtn) return;
    uiDragOn = true;
    const pt = e.touches ? e.touches[0] : e;
    uiDragStartX = pt.clientX;
    uiDragStartY = pt.clientY;
    uiStartRight = parseFloat(uiShell.style.right || CFG.inputPos.right);
    uiStartBottom = parseFloat(uiShell.style.bottom || CFG.inputPos.bottom);
  }

  function onUiDragMove(e) {
    if (!uiDragOn) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - uiDragStartX;
    const dy = pt.clientY - uiDragStartY;
    const newRight = Math.max(0, uiStartRight - dx);
    const newBottom = Math.max(0, uiStartBottom - dy);
    uiShell.style.right = `${newRight}px`;
    uiShell.style.bottom = `${newBottom}px`;
    syncAvatarToUi();
  }

  function onUiDragEnd() {
    uiDragOn = false;
  }

  uiShell.addEventListener("mousedown", onUiDragStart);
  window.addEventListener("mousemove", onUiDragMove);
  window.addEventListener("mouseup", onUiDragEnd);
  uiShell.addEventListener("touchstart", onUiDragStart, { passive: true });
  window.addEventListener("touchmove", onUiDragMove, { passive: true });
  window.addEventListener("touchend", onUiDragEnd);

})();
