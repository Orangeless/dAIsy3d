import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

const CFG = {
  backendUrl: "http://localhost:3001/api/ask",
  assetsBase: "",
  avatarWidth: 640,
  avatarHeight: 848,
  avatarUIScale: 0.52,
  avatarPos: { right: 32, bottom: 18 },
  inputPos: { right: 32, bottom: 18 },
  bubbleMode: "fixed",
  bubbleFixed: { x: window.innerWidth - 380 - 18, y: 60 },
  bubbleOffset: { dx: -360, dy: -140 },
  bubbleMaxWidth: 360,
  bubbleMaxHeight: 220,
  uiMaxWidth: 380,
  highlightMinMs: 3000,
  highlightMaxMs: 10000,
  vrmPath: "assets/anim/dAIsy.vrm",
};

// Animation manifest
const HELLO_PATH   = "assets/anim/hello.vrma";
const PICKUP_PATH  = "assets/anim/picked_up.vrma";
const IDLE_DEFS    = [
  { path: "assets/anim/idle1.vrma",      pause: false },
  { path: "assets/anim/idle2.vrma",      pause: false },
  { path: "assets/anim/idle3pause.vrma", pause: true  },
  { path: "assets/anim/idle4pause.vrma", pause: true  },
];
const POINT_DEFS   = [
  { path: "assets/anim/point longer.vrma" },
  { path: "assets/anim/point2.vrma"       },
];

const resolveAsset = (p) => CFG.assetsBase + p;
const estimateTalkMs = (text) => {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2000, Math.min(15000, Math.round((words / 160) * 60000)));
};

const ROOT_ID = "eyeai-root";
if (document.getElementById(ROOT_ID)) {
} else {

  const styleLinkId = "eyeai-style-link";
  if (!document.getElementById(styleLinkId)) {
    const link = document.createElement("link");
    link.id = styleLinkId; link.rel = "stylesheet";
    link.href = resolveAsset("eyeai.css");
    document.head.appendChild(link);
  }

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
  vtuber.style.zoom = DPR.toString();

  const frame = document.createElement("div");
  frame.className = "eyeai-frame";
  const dragHint = document.createElement("div");
  dragHint.className = "eyeai-drag-hint";
  dragHint.textContent = "Drag me";

  const vrmCanvas = document.createElement("canvas");
  vrmCanvas.className = "eyeai-layer";
  vrmCanvas.width = CFG.avatarWidth;
  vrmCanvas.height = CFG.avatarHeight;

  vtuber.appendChild(vrmCanvas);
  vtuber.appendChild(frame);
  vtuber.appendChild(dragHint);

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

  ui.appendChild(input); ui.appendChild(askBtn);
  uiShell.appendChild(ui);

  const bubble = document.createElement("div");
  bubble.className = "eyeai-bubble";
  bubble.style.maxWidth = `${CFG.bubbleMaxWidth}px`;
  bubble.style.maxHeight = `${CFG.bubbleMaxHeight}px`;
  const bubbleClose = document.createElement("button");
  bubbleClose.className = "eyeai-bubble-close"; bubbleClose.type = "button"; bubbleClose.textContent = "×";
  bubble.appendChild(bubbleClose);
  const bubbleBody = document.createElement("div");
  bubbleBody.className = "eyeai-bubble-body";
  bubble.appendChild(bubbleBody);
  const bubbleCollapsed = document.createElement("div");
  bubbleCollapsed.className = "eyeai-bubble-collapsed"; bubbleCollapsed.textContent = "Show answer";
  bubble.appendChild(bubbleCollapsed);

  shell.appendChild(vtuber);
  root.appendChild(shell); root.appendChild(uiShell); root.appendChild(bubble);
  document.body.appendChild(root);

  // -------------------------------------------------------
  // Three.js / VRM
  // -------------------------------------------------------
  let vrmModel = null, vrmMixer = null, threeRenderer = null,
      threeScene = null, threeCamera = null;
  let isTalking = false, blinkTimer = 0, blinkState = "open",
      blinkProgress = 0, mouthPhase = 0, lastTimestamp = null;

  // =====================================================================
  // ANIMATION STATE
  //
  // animState:
  //   'idle'                          — hello clamped base + subtle procedural
  //   'hello'                         — startup wave
  //   'idle_play'                     — random idle clip playing straight through
  //   'idle_pause_in'                 — pause-idle first half
  //   'idle_pause_hold'               — pause-idle frozen at midpoint
  //   'idle_pause_out'                — pause-idle second half
  //   'pointing_in'                   — pointing first half (while talking)
  //   'pointing_hold'                 — pointing frozen at midpoint (still talking)
  //   'pointing_out'                  — pointing second half (talking done)
  //   'picked_up_in'                  — picked-up first half
  //   'picked_up_hold'                — picked-up frozen at midpoint (ctrl held)
  //   'picked_up_out'                 — picked-up second half (released)
  // =====================================================================

  // --- Hello ---
  let helloAction = null, helloTimer = 0, helloFinished = false, HELLO_TOTAL = 2.0;

  // --- Loaded clip banks ---
  let idleAnimData  = []; // { action, duration, pause }[]
  let pointAnimData = []; // { action, duration }[]
  let pickedUpData  = null; // { action, duration }

  // --- Runtime animation state ---
  let animState      = 'idle';
  let currentAction  = null;  // active VRMA action (idle/pointing/pickup)
  let currentTotal   = 0;     // clip duration of currentAction
  let animTimer      = 0;     // time elapsed in current phase
  let pauseHoldTimer = 0;     // countdown for pause-hold phases
  let idleWaitTimer  = 6.0;   // countdown to next random idle anim

  // --- Generic clip loader ---
  function loadClip(vrm, path, onLoaded) {
    const loader = new GLTFLoader();
    loader.register(p => new VRMAnimationLoaderPlugin(p));
    loader.load(resolveAsset(path), (gltf) => {
      const anims = gltf.userData.vrmAnimations;
      if (!anims?.length) { console.error(`EyeAI: no animations in ${path}`); return; }
      const clip   = createVRMAnimationClip(anims[0], vrm);
      const action = vrmMixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
      const dur = clip.duration > 0 ? clip.duration : 2.0;
      console.log(`EyeAI: loaded ${path} (${dur.toFixed(2)}s)`);
      onLoaded(action, dur);
    }, undefined, e => console.error(`EyeAI: load error ${path}:`, e));
  }

  // --- Play helpers ---
  function playAction(action, clamp = false) {
    action.reset();
    action.paused = false;
    action.clampWhenFinished = clamp;
    action.play();
  }

  function stopCurrent() {
    if (currentAction) { currentAction.stop(); currentAction = null; }
  }

  function restoreHelloBase() {
    if (helloAction && helloFinished) helloAction.enabled = true;
  }

  function suppressHelloBase() {
    if (helloAction && helloFinished) helloAction.enabled = false;
  }

  // --- Hello ---
  function startHello() {
    animState = 'hello'; helloTimer = 0;
    playAction(helloAction, true); // clamp = hold last frame
  }

  // --- Random idle ---
  function playRandomIdle() {
    if (!idleAnimData.length) return;
    const chosen = idleAnimData[Math.floor(Math.random() * idleAnimData.length)];
    suppressHelloBase();
    currentAction = chosen.action;
    currentTotal  = chosen.duration;
    animTimer     = 0;
    playAction(currentAction, true);
    animState = chosen.pause ? 'idle_pause_in' : 'idle_play';
  }

  // --- Pointing (random between available clips) ---
  function startPointing() {
    if (!pointAnimData.length) return;
    stopCurrent();
    suppressHelloBase();
    const chosen  = pointAnimData[Math.floor(Math.random() * pointAnimData.length)];
    currentAction = chosen.action;
    currentTotal  = chosen.duration;
    animTimer     = 0;
    playAction(currentAction, true);
    animState = 'pointing_in';
  }

  // --- Picked up ---
  function startPickedUp() {
    if (!pickedUpData) return;
    if (animState.startsWith('picked_up')) return;
    if (animState.startsWith('pointing'))  return; // don't interrupt response
    stopCurrent();
    suppressHelloBase();
    currentAction = pickedUpData.action;
    currentTotal  = pickedUpData.duration;
    animTimer     = 0;
    playAction(currentAction, true);
    animState = 'picked_up_in';
  }

  function putDown() {
    if (animState === 'picked_up_hold') {
      currentAction.paused = false;
      animState = 'picked_up_out';
      animTimer = 0;
    } else if (animState === 'picked_up_in') {
      // Released before reaching midpoint — skip to out immediately
      stopCurrent(); restoreHelloBase();
      animState = 'idle'; idleWaitTimer = 3;
    }
  }

  // -------------------------------------------------------
  // Three.js init
  // -------------------------------------------------------
  function initThree() {
    threeRenderer = new THREE.WebGLRenderer({ canvas: vrmCanvas, alpha: true, antialias: true });
    threeRenderer.setSize(CFG.avatarWidth, CFG.avatarHeight);
    threeRenderer.setPixelRatio(1);
    threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    threeScene = new THREE.Scene();
    threeScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(1,2,2); threeScene.add(dl);
    const fl = new THREE.DirectionalLight(0xffffff, 0.4); fl.position.set(-1,0,1); threeScene.add(fl);
    threeCamera = new THREE.PerspectiveCamera(48, CFG.avatarWidth/CFG.avatarHeight, 0.1, 30);
    threeCamera.position.set(0, 0.95, 3.25);
    threeCamera.lookAt(0, 0.90, 0);
    loadVRM();
    renderLoop(performance.now());
    vrmCanvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      threeCamera.fov = Math.max(18, Math.min(72, threeCamera.fov + e.deltaY * 0.05));
      threeCamera.updateProjectionMatrix();
    }, { passive: false });
  }

  function loadVRM() {
    const loader = new GLTFLoader();
    loader.register(p => new VRMLoaderPlugin(p));
    loader.load(resolveAsset(CFG.vrmPath), (gltf) => {
      const vrm = gltf.userData.vrm;
      if (!vrm) { console.error("EyeAI: VRM not found."); return; }
      vrmModel = vrm;
      if (vrm.scene) { vrm.scene.rotation.y = 0; threeScene.add(vrm.scene); }
      vrmMixer = new THREE.AnimationMixer(vrm.scene);
      initProceduralAnim(vrm.humanoid);
      loadAllAnimations(vrm);
      console.log("EyeAI: VRM loaded.");
    }, undefined, e => console.error("EyeAI: VRM load error:", e));
  }

  function loadAllAnimations(vrm) {
    // Hello — plays immediately, holds last frame as idle base
    loadClip(vrm, HELLO_PATH, (action, dur) => {
      HELLO_TOTAL = dur; helloAction = action;
      helloAction.clampWhenFinished = true;
      startHello();
    });
    // Idle pool
    IDLE_DEFS.forEach(def => {
      loadClip(vrm, def.path, (action, dur) => {
        idleAnimData.push({ action, duration: dur, pause: def.pause });
      });
    });
    // Pointing pool
    POINT_DEFS.forEach(def => {
      loadClip(vrm, def.path, (action, dur) => {
        pointAnimData.push({ action, duration: dur });
      });
    });
    // Picked up
    loadClip(vrm, PICKUP_PATH, (action, dur) => {
      pickedUpData = { action, duration: dur };
    });
  }

  function renderLoop(timestamp) {
    requestAnimationFrame(renderLoop);
    if (!threeRenderer || !threeScene || !threeCamera) return;
    const dt = Math.min(lastTimestamp !== null ? (timestamp - lastTimestamp) / 1000 : 0.016, 0.1);
    lastTimestamp = timestamp;
    if (vrmMixer) vrmMixer.update(dt);          // 1. VRMA writes normalized bones
    if (vrmModel) { animateVRM(dt); vrmModel.update(dt); } // 2. proc + transfer to raw
    threeRenderer.render(threeScene, threeCamera);
  }

  // =====================================================================
  // PROCEDURAL IDLE ANIMATION
  // =====================================================================
  const procAnim = {
    time: 0, idleBlend: 0,
    spineZ: 0, spineY: 0, neckX: 0, neckY: 0, headX: 0, headY: 0,
    leftArmZ: 0, leftArmX: 0, rightArmZ: 0, rightArmX: 0,
    leftForeArmZ: 0, rightForeArmZ: 0,
    sSpineY: 0, sSpineZ: 0, sNeckX: 0, sNeckY: 0, sHeadX: 0, sHeadY: 0,
    sLeftArmZ: 0, sLeftArmX: 0, sRightArmZ: 0, sRightArmX: 0,
    sLeftForeArmZ: 0, sRightForeArmZ: 0,
    bones: null,
  };

  const lp = (cur, tgt, sp) => cur + (tgt - cur) * Math.min(1, sp);

  function initProceduralAnim(humanoid) {
    if (!humanoid) return;
    procAnim.bones = {
      spine:         humanoid.getNormalizedBoneNode("spine"),
      chest:         humanoid.getNormalizedBoneNode("chest"),
      neck:          humanoid.getNormalizedBoneNode("neck"),
      head:          humanoid.getNormalizedBoneNode("head"),
      leftUpperArm:  humanoid.getNormalizedBoneNode("leftUpperArm"),
      rightUpperArm: humanoid.getNormalizedBoneNode("rightUpperArm"),
      leftLowerArm:  humanoid.getNormalizedBoneNode("leftLowerArm"),
      rightLowerArm: humanoid.getNormalizedBoneNode("rightLowerArm"),
    };
    procAnim.time = 0; procAnim.idleBlend = 0;
  }

  function updateProceduralAnim(dt) {
    const B = procAnim.bones;
    if (!B) return;
    const t = procAnim.time += dt;
    procAnim.idleBlend = lp(procAnim.idleBlend, 1, dt * 2.5);
    const idle = procAnim.idleBlend;

    const breathe   = Math.sin(t * 1.15) * 0.018;
    const sway      = Math.sin(t * 0.42) * 0.012;
    const headNod   = Math.sin(t * 0.78) * 0.025;
    const headDrift = Math.sin(t * 0.31) * 0.018;
    const armFloat  = Math.sin(t * 0.9)  * 0.04;

    procAnim.spineZ        = breathe * idle;
    procAnim.spineY        = sway    * idle;
    procAnim.neckX         = headNod   * 0.5 * idle;
    procAnim.neckY         = headDrift * 0.5 * idle;
    procAnim.headX         = headNod   * idle;
    procAnim.headY         = headDrift * idle;
    procAnim.leftArmZ      = (-1.34 + armFloat * 0.10) * idle;
    procAnim.rightArmZ     = ( 1.34 - armFloat * 0.10) * idle;
    procAnim.leftArmX      = 0.02 * idle;
    procAnim.rightArmX     = 0.02 * idle;
    procAnim.leftForeArmZ  =  0.04 * idle;
    procAnim.rightForeArmZ = -0.04 * idle;

    const s = Math.min(1, dt * 8);
    procAnim.sSpineY        = lp(procAnim.sSpineY,        procAnim.spineY,        s);
    procAnim.sSpineZ        = lp(procAnim.sSpineZ,        procAnim.spineZ,        s);
    procAnim.sNeckX         = lp(procAnim.sNeckX,         procAnim.neckX,         s);
    procAnim.sNeckY         = lp(procAnim.sNeckY,         procAnim.neckY,         s);
    procAnim.sHeadX         = lp(procAnim.sHeadX,         procAnim.headX,         s);
    procAnim.sHeadY         = lp(procAnim.sHeadY,         procAnim.headY,         s);
    procAnim.sLeftArmZ      = lp(procAnim.sLeftArmZ,      procAnim.leftArmZ,      s * 0.7);
    procAnim.sLeftArmX      = lp(procAnim.sLeftArmX,      procAnim.leftArmX,      s * 0.7);
    procAnim.sRightArmZ     = lp(procAnim.sRightArmZ,     procAnim.rightArmZ,     s * 0.7);
    procAnim.sRightArmX     = lp(procAnim.sRightArmX,     procAnim.rightArmX,     s * 0.7);
    procAnim.sLeftForeArmZ  = lp(procAnim.sLeftForeArmZ,  procAnim.leftForeArmZ,  s * 0.6);
    procAnim.sRightForeArmZ = lp(procAnim.sRightForeArmZ, procAnim.rightForeArmZ, s * 0.6);

    // Only write bones when truly idle — all other states have mixer handling them.
    if (animState === 'idle') {
      if (helloFinished) {
        // Hello last frame is the base. Only add subtle life on top (absolute, not additive).
        if (B.chest) B.chest.scale.y = 1 + idle * 0.022 * (Math.sin(t * 1.15) * 0.5 + 0.5);
        if (B.neck)  { B.neck.rotation.x = procAnim.sNeckX; B.neck.rotation.z = procAnim.sNeckY; }
        if (B.head)  { B.head.rotation.x = procAnim.sHeadX; B.head.rotation.z = procAnim.sHeadY; }
      } else {
        // Before hello: full procedural idle
        if (B.spine)         { B.spine.rotation.y = procAnim.sSpineY; B.spine.rotation.x = procAnim.sSpineZ; }
        if (B.chest)         { B.chest.rotation.y = procAnim.sSpineY * 0.5; B.chest.rotation.x = procAnim.sSpineZ * 0.5 + idle * 0.009; B.chest.scale.y = 1 + idle * 0.022 * (Math.sin(t * 1.15) * 0.5 + 0.5); }
        if (B.neck)          { B.neck.rotation.x = procAnim.sNeckX; B.neck.rotation.z = procAnim.sNeckY; }
        if (B.head)          { B.head.rotation.x = procAnim.sHeadX; B.head.rotation.z = procAnim.sHeadY; }
        if (B.leftUpperArm)  { B.leftUpperArm.rotation.z = procAnim.sLeftArmZ;  B.leftUpperArm.rotation.x = procAnim.sLeftArmX; }
        if (B.rightUpperArm) { B.rightUpperArm.rotation.z = procAnim.sRightArmZ; B.rightUpperArm.rotation.x = procAnim.sRightArmX; }
        if (B.leftLowerArm)  B.leftLowerArm.rotation.z = procAnim.sLeftForeArmZ;
        if (B.rightLowerArm) B.rightLowerArm.rotation.z = procAnim.sRightForeArmZ;
      }
    }
  }

  // =====================================================================
  // PER-FRAME VRM UPDATE
  // =====================================================================
  function animateVRM(dt) {
    if (!vrmModel) return;
    const expressions = vrmModel.expressionManager;

    // ---- Hello ----
    if (animState === 'hello') {
      helloTimer += dt;
      if (helloTimer >= HELLO_TOTAL) {
        helloFinished = true;
        animState = 'idle';
        idleWaitTimer = 5 + Math.random() * 5;
      }
    }

    // ---- Random idle scheduling ----
    if (animState === 'idle' && helloFinished && !isTalking) {
      idleWaitTimer -= dt;
      if (idleWaitTimer <= 0 && idleAnimData.length) playRandomIdle();
    }

    // ---- Idle play (straight-through) ----
    if (animState === 'idle_play') {
      animTimer += dt;
      if (animTimer >= currentTotal) {
        stopCurrent(); restoreHelloBase();
        animState = 'idle'; idleWaitTimer = 8 + Math.random() * 12;
      }
    }

    // ---- Idle pause animations ----
    if (animState === 'idle_pause_in') {
      animTimer += dt;
      if (animTimer >= currentTotal / 2) {
        currentAction.paused = true;
        pauseHoldTimer = 1.5 + Math.random() * 1.5; // 1.5–3 s hold
        animState = 'idle_pause_hold'; animTimer = 0;
      }
    }
    if (animState === 'idle_pause_hold') {
      pauseHoldTimer -= dt;
      if (pauseHoldTimer <= 0) {
        currentAction.paused = false;
        animState = 'idle_pause_out'; animTimer = 0;
      }
    }
    if (animState === 'idle_pause_out') {
      animTimer += dt;
      if (animTimer >= currentTotal / 2) {
        stopCurrent(); restoreHelloBase();
        animState = 'idle'; idleWaitTimer = 8 + Math.random() * 12;
      }
    }

    // ---- Pointing ----
    if (animState === 'pointing_in') {
      animTimer += dt;
      if (animTimer >= currentTotal / 2) {
        currentAction.paused = true;
        animState = 'pointing_hold'; animTimer = 0;
      }
    }
    if (animState === 'pointing_hold' && !isTalking) {
      currentAction.paused = false;
      animState = 'pointing_out'; animTimer = 0;
    }
    if (animState === 'pointing_out') {
      animTimer += dt;
      if (animTimer >= currentTotal / 2) {
        stopCurrent(); restoreHelloBase();
        animState = 'idle'; idleWaitTimer = 3 + Math.random() * 5;
      }
    }

    // ---- Picked up ----
    if (animState === 'picked_up_in') {
      animTimer += dt;
      if (animTimer >= currentTotal / 2) {
        currentAction.paused = true;
        animState = 'picked_up_hold'; animTimer = 0;
      }
    }
    // 'picked_up_hold' waits for putDown() (ctrl release / mouse up)
    if (animState === 'picked_up_out') {
      animTimer += dt;
      if (animTimer >= currentTotal / 2) {
        stopCurrent(); restoreHelloBase();
        animState = 'idle'; idleWaitTimer = 2 + Math.random() * 3;
      }
    }

    updateProceduralAnim(dt);

    if (!expressions) return;

    // ---- Blink ----
    blinkTimer -= dt;
    if (blinkState === "open" && blinkTimer <= 0) { blinkState = "closing"; blinkProgress = 0; blinkTimer = 0.12; }
    if (blinkState === "closing") {
      blinkProgress += dt / 0.06; const v = Math.min(1, blinkProgress);
      safeSetExpression(expressions, "blink", v);
      if (v >= 1) { blinkState = "opening"; blinkProgress = 0; }
    } else if (blinkState === "opening") {
      blinkProgress += dt / 0.08; const v = Math.min(1, blinkProgress);
      safeSetExpression(expressions, "blink", 1 - v);
      if (v >= 1) { blinkState = "open"; blinkProgress = 0; blinkTimer = 2.5 + Math.random() * 3.5; }
    }

    // ---- Talking mouth ----
    if (isTalking) {
      mouthPhase += dt * 6;
      const mv = (Math.sin(mouthPhase * Math.PI * 2) * 0.5 + 0.5) * 0.75;
      safeSetExpression(expressions, "aa", mv);
      safeSetExpression(expressions, "oh", mv * 0.3);
      safeSetExpression(expressions, "relaxed", 0);
    } else {
      const ca = safeGetExpression(expressions, "aa");
      safeSetExpression(expressions, "aa", ca > 0.01 ? Math.max(0, ca - dt * 4) : 0);
      const co = safeGetExpression(expressions, "oh");
      safeSetExpression(expressions, "oh", co > 0.01 ? Math.max(0, co - dt * 4) : 0);
      safeSetExpression(expressions, "relaxed", 0.25);
    }
  }

  function safeSetExpression(mgr, name, value) { try { if (mgr.setValue) mgr.setValue(name, value); } catch(_) {} }
  function safeGetExpression(mgr, name) { try { if (mgr.getValue) return mgr.getValue(name) || 0; } catch(_) {} return 0; }

  // -------------------------------------------------------
  // State
  // -------------------------------------------------------
  let talkTimer = null, talkToken = 0, highlightTimer = null,
      activeHighlights = [], bubbleCustomPos = null;

  function releaseToIdle() { isTalking = false; }

  // -------------------------------------------------------
  // Bubble helpers
  // -------------------------------------------------------
  function positionBubble() {
    if (bubbleCustomPos) {
      bubble.style.left = `${bubbleCustomPos.x}px`; bubble.style.top = `${bubbleCustomPos.y}px`;
      bubble.style.right = "auto"; bubble.style.bottom = "auto"; return;
    }
    if (CFG.bubbleMode === "fixed") {
      bubble.style.left = `${window.innerWidth - CFG.bubbleMaxWidth - 18}px`;
      bubble.style.top = "60px"; bubble.style.right = "auto"; bubble.style.bottom = "auto"; return;
    }
    const rect = shell.getBoundingClientRect();
    bubble.style.left = `${rect.right + CFG.bubbleOffset.dx}px`;
    bubble.style.top  = `${rect.top  + CFG.bubbleOffset.dy}px`;
    bubble.style.right = "auto"; bubble.style.bottom = "auto";
  }
  function showBubble(text) { bubble.classList.remove("eyeai-collapsed"); bubbleBody.textContent = text; positionBubble(); bubble.style.display = "block"; }
  function minimizeBubble() { bubble.classList.add("eyeai-collapsed"); }
  function restoreBubble()  { bubble.classList.remove("eyeai-collapsed"); }

  function clearHighlights() {
    if (highlightTimer) { clearTimeout(highlightTimer); highlightTimer = null; }
    for (const span of activeHighlights) {
      if (!span || !span.parentNode) continue;
      const p = span.parentNode, tn = document.createTextNode(span.textContent || "");
      p.replaceChild(tn, span); if (p.normalize) p.normalize();
    }
    activeHighlights = [];
  }

  function sanitizeForMatch(text) { return (text || "").replace(/\*\*/g, "").replace(/[`~]/g, "").replace(/\s+/g, " ").trim(); }
  function buildKeywords(text) {
    const stop = new Set(["the","and","that","this","with","from","your","you","about","what","when","where","which","their","there","have","has","been","will","would","could","should","into","over","under","because","also","than","then","them","they","here","just","like","some","more","most","such","many","much","find","page","content","based","answer","details","size","therefore","cant","cannot","couldnt","couldn't"]);
    const words = (text || "").toLowerCase().match(/\b[a-z0-9]{3,}\b/g) || [];
    const unique = [], seen = new Set();
    for (const w of words) { if (stop.has(w) || seen.has(w)) continue; seen.add(w); unique.push(w); if (unique.length >= 8) break; }
    return unique;
  }

  function makeTextWalker() {
    return document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(node) {
      if (!node || !node.parentElement) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (p.closest(`#${ROOT_ID}`)) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA" || tag === "INPUT") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
  }
  function collectTextNodes() { const nodes = [], w = makeTextWalker(); let n; while ((n = w.nextNode())) { nodes.push(n); if (nodes.length > 5000) break; } return nodes; }
  function getPageText() { const nodes = collectTextNodes(); let text = ""; for (const n of nodes) { const v = n.nodeValue || ""; if (!v.trim()) continue; text += v + " "; if (text.length > 200000) break; } return text.replace(/\s+/g, " ").trim(); }

  function buildNormalizedIndex(nodes, limit = 200000) {
    let text = ""; const map = []; let lastWasSpace = false;
    for (const node of nodes) {
      const value = node.nodeValue || "";
      for (let i = 0; i < value.length; i++) {
        const ch = value[i], isAlnum = /[a-z0-9]/i.test(ch);
        if (isAlnum) { text += ch.toLowerCase(); map.push({node, offset: i}); lastWasSpace = false; }
        else if (!lastWasSpace) { text += " "; map.push({node, offset: i}); lastWasSpace = true; }
        if (text.length >= limit) return {text, map};
      }
      if (!lastWasSpace && text.length) { text += " "; map.push({node, offset: value.length ? value.length - 1 : 0}); lastWasSpace = true; }
      if (text.length >= limit) return {text, map};
    }
    return {text, map};
  }
  function normalizeForMatch(text) { const src = text || ""; let out = "", ls = false; for (let i = 0; i < src.length; i++) { const ch = src[i], ia = /[a-z0-9]/i.test(ch); if (ia) { out += ch.toLowerCase(); ls = false; } else if (!ls) { out += " "; ls = true; } } return out.trim(); }
  function wrapTextNodePortion(node, start, end) {
    const text = node.nodeValue || "", before = text.slice(0, start), middle = text.slice(start, end), after = text.slice(end), parent = node.parentNode;
    if (!parent || !middle) return null;
    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    const mark = document.createElement("span"); mark.className = "eyeai-highlight"; mark.textContent = middle; frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));
    parent.replaceChild(frag, node); return mark;
  }
  function highlightQuoteExact(quote) {
    const cq = normalizeForMatch(sanitizeForMatch(quote)); if (!cq) return false;
    const nodes = collectTextNodes(), {text, map} = buildNormalizedIndex(nodes), idx = text.indexOf(cq);
    if (idx === -1) return false;
    const sm = map[idx], em = map[idx + cq.length - 1]; if (!sm || !em) return false;
    const si = nodes.indexOf(sm.node), ei = nodes.indexOf(em.node); if (si === -1 || ei === -1) return false;
    for (let i = si; i <= ei; i++) {
      const node = nodes[i]; if (!node || !node.parentNode) continue;
      let mark;
      if (i === si && i === ei) mark = wrapTextNodePortion(node, sm.offset, em.offset + 1);
      else if (i === si) mark = wrapTextNodePortion(node, sm.offset, (node.nodeValue || "").length);
      else if (i === ei) mark = wrapTextNodePortion(node, 0, em.offset + 1);
      else mark = wrapTextNodePortion(node, 0, (node.nodeValue || "").length);
      if (mark) activeHighlights.push(mark);
    }
    if (activeHighlights.length) { activeHighlights[0].scrollIntoView({behavior: "smooth", block: "center"}); return true; }
    return false;
  }
  function highlightQuotes(quotes, durationMs) {
    if (!quotes || !quotes.length) return false;
    let hit = false; for (const q of quotes) { if (highlightQuoteExact(q)) { hit = true; break; } }
    if (!hit) return false;
    highlightTimer = setTimeout(clearHighlights, Math.min(CFG.highlightMaxMs, Math.max(CFG.highlightMinMs, durationMs)));
    return true;
  }
  function extractQuoteFromPage(answer) {
    const pageText = getPageText(); if (!pageText) return null;
    const sentences = pageText.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length >= 20 && s.length <= 320);
    if (!sentences.length) return null;
    const tokens = buildKeywords(answer), numbers = (answer || "").match(/\b\d+(\.\d+)?\b/g) || [];
    let best = null, bestScore = 0;
    for (const s of sentences) {
      const lower = s.toLowerCase(); let score = 0;
      for (const tk of tokens) if (lower.includes(tk)) score += 2;
      for (const n of numbers) if (lower.includes(n)) score += 3;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return bestScore > 0 ? best : null;
  }

  bubbleClose.addEventListener("click", (e) => { e.stopPropagation(); minimizeBubble(); releaseToIdle(); clearHighlights(); });
  let bubbleDragged = false;
  bubble.addEventListener("click", () => { if (bubbleDragged) { bubbleDragged = false; return; } minimizeBubble(); });
  bubbleCollapsed.addEventListener("click", (e) => { e.stopPropagation(); restoreBubble(); });

  async function handleAsk() {
    const question = input.value.trim(); if (!question) return;
    input.disabled = true; askBtn.disabled = true; showBubble("Thinking...");
    if (talkTimer) clearTimeout(talkTimer);
    talkToken += 1; const myToken = talkToken; clearHighlights(); bubbleCustomPos = null;
    try {
      const pageText = getPageText();
      const res = await fetch(CFG.backendUrl, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({question, pageText})});
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try { const ed = await res.json(); const parts = []; if (ed?.error) parts.push(ed.error); if (typeof ed?.status === "number") parts.push(`upstream ${ed.status}`); if (ed?.hint) parts.push(ed.hint); if (parts.length) message = parts.join(" | "); } catch(_) {}
        throw new Error(message);
      }
      const data = await res.json();
      let answer = data?.answer ?? data?.response ?? (typeof data === "string" ? data : JSON.stringify(data));
      const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
      showBubble(answer || "No response."); input.value = "";
      const durationMs = estimateTalkMs(answer);
      let quoteHit = highlightQuotes(quotes, durationMs);
      if (!quoteHit) { const fq = extractQuoteFromPage(answer); if (fq) quoteHit = highlightQuotes([fq], durationMs); }
      isTalking = true;
      startPointing();
      talkTimer = setTimeout(() => { if (talkToken !== myToken) return; releaseToIdle(); }, durationMs);
    } catch(err) {
      showBubble(err?.message || "Sorry, I couldn't reach the server."); console.error(err); releaseToIdle();
    } finally {
      input.disabled = false; askBtn.disabled = false;
    }
  }

  askBtn.addEventListener("click", handleAsk);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") handleAsk(); });
  window.addEventListener("resize", () => { if (bubble.style.display !== "none") positionBubble(); });

  // -------------------------------------------------------
  // Bubble drag
  // -------------------------------------------------------
  let bdo = false, bdsx = 0, bdsy = 0, bsl = 0, bst = 0;
  function onBubbleDragStart(e) { if (e.target === bubbleClose) return; bdo = true; const pt = e.touches ? e.touches[0] : e; const rect = bubble.getBoundingClientRect(); bdsx = pt.clientX; bdsy = pt.clientY; bsl = rect.left; bst = rect.top; bubble.style.cursor = "grabbing"; }
  function onBubbleDragMove(e) { if (!bdo) return; const pt = e.touches ? e.touches[0] : e; const dx = pt.clientX - bdsx, dy = pt.clientY - bdsy; if (Math.abs(dx) > 2 || Math.abs(dy) > 2) bubbleDragged = true; bubbleCustomPos = {x: Math.max(8, bsl + dx), y: Math.max(8, bst + dy)}; positionBubble(); }
  function onBubbleDragEnd() { bdo = false; bubble.style.cursor = "grab"; }
  bubble.addEventListener("mousedown", onBubbleDragStart);
  window.addEventListener("mousemove", onBubbleDragMove);
  window.addEventListener("mouseup", onBubbleDragEnd);
  bubble.addEventListener("touchstart", onBubbleDragStart, {passive: true});
  window.addEventListener("touchmove", onBubbleDragMove, {passive: true});
  window.addEventListener("touchend", onBubbleDragEnd);

  // -------------------------------------------------------
  // Avatar drag / spin / picked-up
  // -------------------------------------------------------
  let dragOn = false, isSpinning = false, isPickedUp = false,
      dragStartX = 0, dragStartY = 0,
      startRight = CFG.avatarPos.right, startBottom = CFG.avatarPos.bottom,
      startModelRot = 0, startModelTilt = 0, modelTilt = 0;

  function onDragStart(e) {
    if (e.target === input || e.target === askBtn) return;
    dragOn = true;
    const onCanvas = e.target === vrmCanvas;
    isPickedUp = onCanvas && e.ctrlKey;
    isSpinning  = onCanvas && !e.ctrlKey;
    const pt = e.touches ? e.touches[0] : e;
    dragStartX = pt.clientX; dragStartY = pt.clientY;
    startRight = parseFloat(shell.style.right  || CFG.avatarPos.right);
    startBottom = parseFloat(shell.style.bottom || CFG.avatarPos.bottom);
    startModelRot  = vrmModel ? vrmModel.scene.rotation.y : 0;
    startModelTilt = modelTilt;
    if (isPickedUp) startPickedUp();
  }
  function onDragMove(e) {
    if (!dragOn) return;
    const pt = e.touches ? e.touches[0] : e, dx = pt.clientX - dragStartX, dy = pt.clientY - dragStartY;
    if (isSpinning && vrmModel) {
      vrmModel.scene.rotation.y = startModelRot + dx * 0.01;
      modelTilt = Math.max(-0.40, Math.min(0.25, startModelTilt + dy * 0.0045));
      vrmModel.scene.rotation.x = modelTilt;
    } else {
      // Both regular shell-drag and picked-up move the shell
      shell.style.right  = `${Math.max(0, startRight  - dx)}px`;
      shell.style.bottom = `${Math.max(0, startBottom - dy)}px`;
      if (bubble.style.display !== "none") positionBubble();
    }
  }
  function onDragEnd() {
    if (isPickedUp) putDown();
    dragOn = false; isSpinning = false; isPickedUp = false;
  }

  shell.addEventListener("mousedown", onDragStart);
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
  shell.addEventListener("touchstart", onDragStart, {passive: true});
  window.addEventListener("touchmove", onDragMove, {passive: true});
  window.addEventListener("touchend", onDragEnd);
  window.addEventListener("keyup", (e) => { if (e.key === "Control" && isPickedUp) { putDown(); isPickedUp = false; } });
  window.addEventListener("blur", () => { if (isPickedUp) { putDown(); isPickedUp = false; } });

  // -------------------------------------------------------
  // UI drag
  // -------------------------------------------------------
  let udo = false, udsx = 0, udsy = 0, usr = CFG.inputPos.right, usb = CFG.inputPos.bottom;
  function onUiDragStart(e) { if (e.target === input || e.target === askBtn) return; udo = true; const pt = e.touches ? e.touches[0] : e; udsx = pt.clientX; udsy = pt.clientY; usr = parseFloat(uiShell.style.right || CFG.inputPos.right); usb = parseFloat(uiShell.style.bottom || CFG.inputPos.bottom); }
  function onUiDragMove(e) { if (!udo) return; const pt = e.touches ? e.touches[0] : e; uiShell.style.right = `${Math.max(0, usr - (pt.clientX - udsx))}px`; uiShell.style.bottom = `${Math.max(0, usb - (pt.clientY - udsy))}px`; }
  function onUiDragEnd() { udo = false; }
  uiShell.addEventListener("mousedown", onUiDragStart);
  window.addEventListener("mousemove", onUiDragMove);
  window.addEventListener("mouseup", onUiDragEnd);
  uiShell.addEventListener("touchstart", onUiDragStart, {passive: true});
  window.addEventListener("touchmove", onUiDragMove, {passive: true});
  window.addEventListener("touchend", onUiDragEnd);

  // -------------------------------------------------------
  // Init
  // -------------------------------------------------------
  initThree();
}
