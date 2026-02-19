import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// =========================================================
// EyeAI Injector
// ARCHITECTURE:
// - Avatar = VRM model rendered via Three.js canvas
// - Idle state = breathing + random blink expressions
// - Talking state = mouth morph (aa/oh) while answer displays
// - UI is scaled WITHOUT touching internal resolution
// =========================================================

const CFG = {
  backendUrl: "http://localhost:3001/api/ask",
  assetsBase: "",

  // Canvas size (native resolution)
  avatarWidth: 640,
  avatarHeight: 848,

  // Visual size on screen (only knob you touch)
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

  // VRM model path
  vrmPath: "assets/anim/dAIsy.vrm",
};

// -----------------------------
// Helpers
// -----------------------------
const nowMs = () => Date.now();
const resolveAsset = (p) => CFG.assetsBase + p;

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
if (document.getElementById(ROOT_ID)) {
  // If already exists, do nothing or cleanup (but usually injector logic stops here)
} else {

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
  vtuber.style.zoom = DPR.toString();

  const frame = document.createElement("div");
  frame.className = "eyeai-frame";

  const dragHint = document.createElement("div");
  dragHint.className = "eyeai-drag-hint";
  dragHint.textContent = "Drag me";

  const closeBtn = document.createElement("button");
  closeBtn.className = "eyeai-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";

  // Three.js canvas
  const vrmCanvas = document.createElement("canvas");
  vrmCanvas.className = "eyeai-layer";
  vrmCanvas.width = CFG.avatarWidth;
  vrmCanvas.height = CFG.avatarHeight;

  vtuber.appendChild(vrmCanvas);
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

  ui.appendChild(input);
  ui.appendChild(askBtn);

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
  shell.appendChild(closeBtn);

  root.appendChild(shell);
  root.appendChild(uiShell);
  root.appendChild(bubble);
  document.body.appendChild(root);

  // -----------------------------
  // VRM / Three.js setup
  // -----------------------------
  let vrmModel = null;
  let vrmMixer = null;
  let threeRenderer = null;
  let threeScene = null;
  let threeCamera = null;
  let animFrameId = null;

  // Animation state
  let isTalking = false;
  let talkPhase = 0;
  let blinkTimer = 0;
  let blinkState = "open"; // "open" | "closing" | "opening"
  let blinkProgress = 0;
  let mouthPhase = 0;
  let lastTimestamp = null;
  let isPickedUp = false;

  function initThree() {
    // Renderer
    threeRenderer = new THREE.WebGLRenderer({
      canvas: vrmCanvas,
      alpha: true,
      antialias: true,
    });
    threeRenderer.setSize(CFG.avatarWidth, CFG.avatarHeight);
    threeRenderer.setPixelRatio(1);
    threeRenderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    threeScene = new THREE.Scene();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    threeScene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(1, 2, 2);
    threeScene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-1, 0, 1);
    threeScene.add(fillLight);

    // Camera — Full body framing
    threeCamera = new THREE.PerspectiveCamera(
      48,
      CFG.avatarWidth / CFG.avatarHeight,
      0.1,
      30
    );
    threeCamera.position.set(0, 0.95, 3.25);
    threeCamera.lookAt(0, 0.90, 0);

    // Load VRM
    loadVRM();

    // Start render loop
    renderLoop(performance.now());

    // Add wheel listener for zoom
    vrmCanvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (!threeCamera) return;
      const delta = e.deltaY * 0.05;
      // Keep zoom usable without pushing framing into aggressive crop.
      threeCamera.fov = Math.max(18, Math.min(72, threeCamera.fov + delta));
      threeCamera.updateProjectionMatrix();
    }, { passive: false });
  }

  function loadVRM() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      resolveAsset(CFG.vrmPath),
      (gltf) => {
        const vrm = gltf.userData.vrm;
        if (!vrm) {
          console.error("EyeAI: VRM data not found in loaded GLTF.");
          return;
        }

        vrmModel = vrm;

        if (vrm.scene) {
          // This model's forward direction is already correct at 0 for initial facing.
          vrm.scene.rotation.y = 0;
          threeScene.add(vrm.scene);
        }

        // Set up animation mixer
        vrmMixer = new THREE.AnimationMixer(vrm.scene);

        // Initialise procedural animation (caches bone refs, resets state)
        initProceduralAnim(vrm.humanoid);

        console.log("EyeAI: VRM model loaded successfully.");
      },
      undefined,
      (error) => {
        console.error("EyeAI: Failed to load VRM model:", error);
      }
    );
  }

  function renderLoop(timestamp) {
    animFrameId = requestAnimationFrame(renderLoop);

    if (!threeRenderer || !threeScene || !threeCamera) return;

    const delta = lastTimestamp !== null ? (timestamp - lastTimestamp) / 1000 : 0.016;
    lastTimestamp = timestamp;
    const dt = Math.min(delta, 0.1);

    if (vrmModel) {
      animateVRM(dt);
      vrmModel.update(dt);
    }

    if (vrmMixer) {
      vrmMixer.update(dt);
    }

    threeRenderer.render(threeScene, threeCamera);
  }

  // =====================================================================
  // PROCEDURAL ANIMATION
  // =====================================================================
  const procAnim = {
    time: 0,
    idleActive: false,  idleBlend: 0,
    talkActive: false,  talkBlend: 0,
    carryActive: false, carryBlend: 0,
    spineY: 0, spineZ: 0, neckX: 0, neckY: 0, headX: 0, headY: 0,
    leftArmZ: 0, leftArmX: 0, rightArmZ: 0, rightArmX: 0,
    leftForeArmZ: 0, rightForeArmZ: 0,
    sSpineY: 0, sSpineZ: 0, sNeckX: 0, sNeckY: 0, sHeadX: 0, sHeadY: 0,
    sLeftArmZ: 0, sLeftArmX: 0, sRightArmZ: 0, sRightArmX: 0,
    sLeftForeArmZ: 0, sRightForeArmZ: 0,
    nextGestureAt: 0, gesturePhase: 0, gestureArm: 'right', gestureTimer: 0, didGestureThisTalk: false,
    bones: null,
  };

  function lp(current, target, speed) {
    return current + (target - current) * Math.min(1, speed);
  }

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
    Object.assign(procAnim, {
      time: 0, idleBlend: 0, talkBlend: 0, carryBlend: 0,
      sSpineY: 0, sSpineZ: 0, sNeckX: 0, sNeckY: 0, sHeadX: 0, sHeadY: 0,
      sLeftArmZ: 0, sLeftArmX: 0, sRightArmZ: 0, sRightArmX: 0,
      sLeftForeArmZ: 0, sRightForeArmZ: 0,
      gesturePhase: 0, nextGestureAt: 0, didGestureThisTalk: false,
    });
    procAnim.idleActive = true;
  }

  function updateProceduralAnim(dt) {
    const B = procAnim.bones;
    if (!B) return;
    const t = procAnim.time += dt;

    procAnim.idleBlend  = lp(procAnim.idleBlend,  procAnim.idleActive  ? 1 : 0, dt * 2.5);
    procAnim.talkBlend  = lp(procAnim.talkBlend,  procAnim.talkActive  ? 1 : 0, dt * 3.0);
    procAnim.carryBlend = lp(procAnim.carryBlend, procAnim.carryActive ? 1 : 0, dt * 4.0);
    const idle = procAnim.idleBlend, talk = procAnim.talkBlend, carry = procAnim.carryBlend;

    // ---- Idle: breathing sway + gentle head drift ----
    const breathe   = Math.sin(t * 1.15) * 0.018;
    const sway      = Math.sin(t * 0.42) * 0.012;
    const headNod   = Math.sin(t * 0.78) * 0.025;
    const headDrift = Math.sin(t * 0.31) * 0.018;
    const armFloat  = Math.sin(t * 0.9)  * 0.04;

    procAnim.spineZ = breathe * idle;
    procAnim.spineY = sway * idle;
    procAnim.neckX  = headNod * 0.5 * idle;
    procAnim.neckY  = headDrift * 0.5 * idle;
    procAnim.headX  = headNod * idle;
    procAnim.headY  = headDrift * idle;
    // Keep a natural resting stance instead of a T-pose.
    procAnim.leftArmZ  = (-1.34 + armFloat * 0.10) * idle;
    procAnim.rightArmZ = ( 1.34 - armFloat * 0.10) * idle;
    procAnim.leftArmX  = 0.02 * idle;
    procAnim.rightArmX = 0.02 * idle;
    procAnim.leftForeArmZ  =  0.04 * idle;
    procAnim.rightForeArmZ = -0.04 * idle;

    // ---- Talk: energetic head + gesture arm ----
    if (talk > 0.01) {
      const tt = t * 2.8;
      procAnim.spineZ += Math.sin(tt * 0.5) * 0.03 * talk;
      procAnim.spineY += Math.sin(tt * 0.7 + 0.5) * 0.018 * talk;
      procAnim.headX  += Math.sin(tt) * 0.07 * talk;
      procAnim.headY  += Math.sin(tt * 0.7 + 0.5) * 0.045 * talk;
      procAnim.neckX  += Math.sin(tt) * 0.042 * talk;
      procAnim.neckY  += Math.sin(tt * 0.7 + 0.5) * 0.0225 * talk;

      if (!procAnim.didGestureThisTalk && procAnim.gesturePhase === 0) {
        procAnim.gesturePhase = 1;
        procAnim.gestureArm = Math.random() > 0.5 ? 'right' : 'left';
        procAnim.gestureTimer = t;
      }
      const ge = t - procAnim.gestureTimer;
      const gR = procAnim.gestureArm === 'right';
      if (procAnim.gesturePhase === 1) {
        const prog = Math.min(1, ge / 0.4), ang = prog * 0.9;
        if (gR) { procAnim.rightArmZ = -(0.12 + ang * 0.7) * talk; procAnim.rightArmX = ang * 0.3 * talk; procAnim.rightForeArmZ = -ang * 0.5 * talk; }
        else    { procAnim.leftArmZ  =  (0.12 + ang * 0.7) * talk; procAnim.leftArmX  = ang * 0.3 * talk; procAnim.leftForeArmZ  =  ang * 0.5 * talk; }
        if (prog >= 1) { procAnim.gesturePhase = 2; procAnim.gestureTimer = t; }
      } else if (procAnim.gesturePhase === 2) {
        if (gR) { procAnim.rightArmZ = -0.82 * talk; procAnim.rightArmX = 0.3 * talk; procAnim.rightForeArmZ = -0.5 * talk; }
        else    { procAnim.leftArmZ  =  0.82 * talk; procAnim.leftArmX  = 0.3 * talk; procAnim.leftForeArmZ  =  0.5 * talk; }
        if (ge > 1.2) { procAnim.gesturePhase = 3; procAnim.gestureTimer = t; }
      } else if (procAnim.gesturePhase === 3) {
        const prog = Math.min(1, ge / 0.5), ang = (1 - prog) * 0.9;
        if (gR) { procAnim.rightArmZ = -(0.12 + ang * 0.7) * talk; procAnim.rightArmX = ang * 0.3 * talk; procAnim.rightForeArmZ = -ang * 0.5 * talk; }
        else    { procAnim.leftArmZ  =  (0.12 + ang * 0.7) * talk; procAnim.leftArmX  = ang * 0.3 * talk; procAnim.leftForeArmZ  =  ang * 0.5 * talk; }
        if (prog >= 1) { procAnim.gesturePhase = 0; procAnim.didGestureThisTalk = true; }
      }
    } else {
      if (procAnim.gesturePhase !== 0) { procAnim.gesturePhase = 0; procAnim.nextGestureAt = 0; }
      procAnim.didGestureThisTalk = false;
    }

    // ---- Carry: limp dangle ----
    if (carry > 0.01) {
      const dangle = Math.sin(t * 3.2) * 0.06 * carry;
      const swing  = Math.sin(t * 2.1 + 1.0) * 0.08 * carry;
      const aSwing = Math.sin(t * 2.8) * 0.12 * carry;
      procAnim.spineZ += 0.28 * carry + dangle;
      procAnim.spineY += swing * 0.3;
      procAnim.headX  += 0.22 * carry + dangle * 0.5;
      procAnim.headY  += swing * 0.4;
      procAnim.neckX  += 0.18 * carry;
      const carryLeftArmZ = 0.05 + aSwing;
      const carryRightArmZ = -(0.05 - aSwing);
      const carryArmX = 0.35;
      const carryLeftForeArmZ = 0.6 + aSwing * 0.5;
      const carryRightForeArmZ = -0.6 - aSwing * 0.5;

      // Blend from current pose to carry targets to avoid a brief neutral/T-pose snap on pickup.
      procAnim.leftArmZ  = lp(procAnim.leftArmZ, carryLeftArmZ, carry);
      procAnim.rightArmZ = lp(procAnim.rightArmZ, carryRightArmZ, carry);
      procAnim.leftArmX  = lp(procAnim.leftArmX, carryArmX, carry);
      procAnim.rightArmX = lp(procAnim.rightArmX, carryArmX, carry);
      procAnim.leftForeArmZ  = lp(procAnim.leftForeArmZ, carryLeftForeArmZ, carry);
      procAnim.rightForeArmZ = lp(procAnim.rightForeArmZ, carryRightForeArmZ, carry);
    }

    // ---- Smooth ----
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

    // ---- Apply to VRM bones ----
    if (B.spine)        { B.spine.rotation.y = procAnim.sSpineY; B.spine.rotation.x = procAnim.sSpineZ; }
    if (B.chest)        { B.chest.rotation.y = procAnim.sSpineY * 0.5; B.chest.rotation.x = procAnim.sSpineZ * 0.5 + idle * 0.009; B.chest.scale.y = 1 + idle * 0.022 * (Math.sin(t * 1.15) * 0.5 + 0.5); }
    if (B.neck)         { B.neck.rotation.x = procAnim.sNeckX; B.neck.rotation.z = procAnim.sNeckY; }
    if (B.head)         { B.head.rotation.x = procAnim.sHeadX; B.head.rotation.z = procAnim.sHeadY; }
    if (B.leftUpperArm) { B.leftUpperArm.rotation.z = procAnim.sLeftArmZ; B.leftUpperArm.rotation.x = procAnim.sLeftArmX; }
    if (B.rightUpperArm){ B.rightUpperArm.rotation.z = procAnim.sRightArmZ; B.rightUpperArm.rotation.x = procAnim.sRightArmX; }
    if (B.leftLowerArm)  B.leftLowerArm.rotation.z  = procAnim.sLeftForeArmZ;
    if (B.rightLowerArm) B.rightLowerArm.rotation.z = procAnim.sRightForeArmZ;
  }

  function animateVRM(dt) {
    if (!vrmModel) return;
    const expressions = vrmModel.expressionManager;

    procAnim.talkActive  = isTalking;
    procAnim.carryActive = isPickedUp;
    procAnim.idleActive  = true;
    updateProceduralAnim(dt);

    // ---- Blink (state machine) ----
    if (expressions) {
      blinkTimer -= dt;
      if (blinkState === "open" && blinkTimer <= 0) {
        blinkState = "closing"; blinkProgress = 0; blinkTimer = 0.12;
      }
      if (blinkState === "closing") {
        blinkProgress += dt / 0.06;
        const v = Math.min(1, blinkProgress);
        safeSetExpression(expressions, "blink", v);
        if (v >= 1) { blinkState = "opening"; blinkProgress = 0; }
      } else if (blinkState === "opening") {
        blinkProgress += dt / 0.08;
        const v = Math.min(1, blinkProgress);
        safeSetExpression(expressions, "blink", 1 - v);
        if (v >= 1) { blinkState = "open"; blinkProgress = 0; blinkTimer = 2.5 + Math.random() * 3.5; }
      }

      // ---- Mouth ----
      if (isTalking) {
        mouthPhase += dt * 6;
        const mouthVal = (Math.sin(mouthPhase * Math.PI * 2) * 0.5 + 0.5) * 0.75;
        safeSetExpression(expressions, "aa", mouthVal);
        safeSetExpression(expressions, "oh", mouthVal * 0.3);
        safeSetExpression(expressions, "relaxed", 0);
      } else {
        const curAa = safeGetExpression(expressions, "aa");
        if (curAa > 0.01) safeSetExpression(expressions, "aa", Math.max(0, curAa - dt * 4));
        else safeSetExpression(expressions, "aa", 0);
        const curOh = safeGetExpression(expressions, "oh");
        if (curOh > 0.01) safeSetExpression(expressions, "oh", Math.max(0, curOh - dt * 4));
        else safeSetExpression(expressions, "oh", 0);
        safeSetExpression(expressions, "relaxed", 0.25);
      }
    }
  }

  function safeSetExpression(mgr, name, value) {
    try {
      if (mgr.setValue) mgr.setValue(name, value);
    } catch (_) { }
  }

  function safeGetExpression(mgr, name) {
    try {
      if (mgr.getValue) return mgr.getValue(name) || 0;
    } catch (_) { }
    return 0;
  }

  // -----------------------------
  // Scheduler / state
  // -----------------------------
  let talkTimer = null;
  let talkToken = 0;
  let animationHold = false;
  let highlightTimer = null;
  let activeHighlights = [];
  let bubbleCustomPos = null;

  function releaseToIdle() {
    isTalking = false;
    animationHold = false;
  }

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

  bubbleClose.addEventListener("click", (e) => {
    e.stopPropagation();
    minimizeBubble();
    releaseToIdle();
    clearHighlights();
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    releaseToIdle();
    if (animFrameId) cancelAnimationFrame(animFrameId);
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

    try {
      const pageText = getPageText();

      const res = await fetch(CFG.backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, pageText }),
      });

      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const errData = await res.json();
          const parts = [];
          if (errData?.error) parts.push(errData.error);
          if (typeof errData?.status === "number") parts.push(`upstream ${errData.status}`);
          if (errData?.hint) parts.push(errData.hint);
          if (parts.length) message = parts.join(" | ");
        } catch (_) { }
        throw new Error(message);
      }

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

      // Start talking animation — release debugger freeze so poseT can run
      isTalking = true;

      talkTimer = setTimeout(() => {
        if (talkToken !== myToken) return;
        releaseToIdle();
      }, durationMs);

    } catch (err) {
      showBubble(err?.message || "Sorry, I couldn't reach the server.");
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
    if (bubble.style.display !== "none") positionBubble();
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
    if (e.target.closest && e.target.closest("#eyeai-pose-debug")) return;
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
  let isSpinning = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startRight = CFG.avatarPos.right;
  let startBottom = CFG.avatarPos.bottom;
  let startModelRot = 0;
  let startModelTilt = 0;
  let modelTilt = 0;

  function onDragStart(e) {
    if (e.target === input || e.target === askBtn) return;
    if (e.target.closest && e.target.closest("#eyeai-pose-debug")) return;
    dragOn = true;

    const isControlPressed = e.ctrlKey;
    if (e.target === vrmCanvas && isControlPressed) {
      isPickedUp = true;
    } else {
      isPickedUp = false;
    }

    if (e.target === vrmCanvas && !isControlPressed) {
      isSpinning = true;
      startModelRot = vrmModel ? vrmModel.scene.rotation.y : 0;
      startModelTilt = modelTilt;
    } else {
      isSpinning = false;
    }

    const pt = e.touches ? e.touches[0] : e;
    dragStartX = pt.clientX;
    dragStartY = pt.clientY;
    startRight = parseFloat(shell.style.right || CFG.avatarPos.right.toString());
    startBottom = parseFloat(shell.style.bottom || CFG.avatarPos.bottom.toString());
    startModelRot = vrmModel ? vrmModel.scene.rotation.y : 0;
    startModelTilt = modelTilt;
  }

  function onDragMove(e) {
    if (!dragOn) return;
    if (e.target && e.target.closest && e.target.closest("#eyeai-pose-debug")) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - dragStartX;
    const dy = pt.clientY - dragStartY;

    if (isSpinning) {
      if (vrmModel) {
        vrmModel.scene.rotation.y = startModelRot + dx * 0.01;
        modelTilt = Math.max(-0.40, Math.min(0.25, startModelTilt + dy * 0.0045));
        vrmModel.scene.rotation.x = modelTilt;
      }
    } else {
      const newRight = Math.max(0, startRight - dx);
      const newBottom = Math.max(0, startBottom - dy);
      shell.style.right = `${newRight}px`;
      shell.style.bottom = `${newBottom}px`;
      if (bubble.style.display !== "none") positionBubble();
    }
  }

  function onDragEnd() {
    dragOn = false;
    isSpinning = false;
    isPickedUp = false;
  }

  shell.addEventListener("mousedown", onDragStart);
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
  shell.addEventListener("touchstart", onDragStart, { passive: true });
  window.addEventListener("touchmove", onDragMove, { passive: true });
  window.addEventListener("touchend", onDragEnd);
  window.addEventListener("keyup", (e) => {
    if (e.key === "Control") isPickedUp = false;
  });
  window.addEventListener("blur", () => {
    isPickedUp = false;
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
    if (e.target.closest && e.target.closest("#eyeai-pose-debug")) return;
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

  // -----------------------------
  // Init
  // -----------------------------
  initThree();

}
