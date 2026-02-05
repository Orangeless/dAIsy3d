(() => {
  // =========================================================
  // EyeAI Injector (Static Idle PNG + MP4 animations)
  // FIXED: idle animations now actually show (no broken-icon flash)
  // - Keeps idle.png visible by default
  // - Only hides PNG AFTER the video has loaded a frame (loadeddata/canplay)
  // - Does NOT remove video src on idle (prevents broken icon flicker)
  // =========================================================

  // -----------------------------
  // (A) CONFIG (EDIT ONLY HERE)
  // -----------------------------
  const CFG = {
    backendUrl: "http://localhost:3001/api/ask",

    // IMPORTANT:
    // You are using paths like "assets/video/idle.png" already.
    // So keep assetsBase empty to avoid double paths.
    assetsBase: "",

    // Avatar box size (px)
    avatarSize: 260,

    // Where the avatar sits
    avatarPos: { right: 18, bottom: 18 },

    // Input row position
    inputPos: { right: 18, bottom: 18 },

    bubbleMode: "fixed",
    bubbleFixed: { x: window.innerWidth - 380 - 18, y: 60 },
    bubbleOffset: { dx: -360, dy: -140 },

    bubbleMaxWidth: 360,
    bubbleMaxHeight: 220,
    uiMaxWidth: 380,

    // Often "main motion idle": every 20–40s
    idleMainEverySecondsMin: 20,
    idleMainEverySecondsMax: 40,

    // Rare idle: every 120–240s
    idleRareEverySecondsMin: 120,
    idleRareEverySecondsMax: 240,

    // Rare idle duration: 6–10s
    idleRareDurationSecondsMin: 6,
    idleRareDurationSecondsMax: 10,

    // Files
    idleStillPng: "assets/video/idle.png",

    // Main motion idle videos
    idleMainVideos: [
      "assets/video/idle_main.mp4",  // 2s
      "assets/video/idle_main1.mp4", // 5s
    ],

    // Fixed durations (seconds)
    idleMainFixedDurationsSec: {
      "assets/video/idle_main.mp4": 2,
      "assets/video/idle_main1.mp4": 5,
    },

    // Rare idle videos
    idleRareVideos: [
      "assets/video/idle1.mp4",
      "assets/video/idle2.mp4",
    ],

    // State videos (while thinking/talking/etc)
    // FIX: make these consistent with your served folder (assets/video/...)
    videos: {
      thinking: ["assets/video/explaining_negative.mp4"],
      talking: ["assets/video/explaining_positive.mp4"],
      pointing: ["assets/video/pointing.mp4"],
      goodbye: ["assets/video/goodbye.mp4"],
    },

    // Video readiness timeout (ms) before we give up and keep PNG
    videoReadyTimeoutMs: 2500,
  };

  // -----------------------------
  // (B) Helpers
  // -----------------------------
  function injectStyle(cssText) {
    const el = document.createElement("style");
    el.textContent = cssText;
    document.documentElement.appendChild(el);
    return el;
  }

  function nowMs() {
    return Date.now();
  }

  function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function randMs(minSeconds, maxSeconds) {
    return randInt(minSeconds, maxSeconds) * 1000;
  }

  function resolveAsset(rel) {
    return CFG.assetsBase + rel;
  }

  function pickRandom(list) {
    if (!list || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  // -----------------------------
  // (C) Single-root guard
  // -----------------------------
  const ROOT_ID = "eyeai-root";
  if (document.getElementById(ROOT_ID)) return;

  // -----------------------------
  // (D) CSS (all injected)
  // -----------------------------
  injectStyle(`
    #${ROOT_ID}{
      position:fixed;
      left:0; top:0;
      width:0; height:0;
      z-index:1000000;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    #${ROOT_ID} .eyeai-vtuber{
      position:fixed;
      width:${CFG.avatarSize}px;
      height:${CFG.avatarSize}px;
      border-radius:18px;
      overflow:hidden;
      background:transparent;
      pointer-events:none;
    }

    #${ROOT_ID} .eyeai-avatar-layer{
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
    }

    #${ROOT_ID} video.eyeai-video{
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
      opacity:0; /* hidden by default */
      transition: opacity 300ms linear;
    }

    #${ROOT_ID} img.eyeai-idlepng{
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
      opacity:1;
      transition: opacity 120ms linear;
    }

    #${ROOT_ID} .eyeai-bubble{
      position:fixed;
      left:0; top:0;
      display:none;
      max-width:${CFG.bubbleMaxWidth}px;
      max-height:${CFG.bubbleMaxHeight}px;
      padding:12px 14px;
      padding-right:40px;
      border-radius:16px;
      background: rgba(20,20,22,0.92);
      color: rgba(255,255,255,0.92);
      box-shadow: 0 10px 30px rgba(0,0,0,0.22);
      line-height:1.35;
      pointer-events:auto;
      user-select:text;
    }

    #${ROOT_ID} .eyeai-text{
      font-size:14px;
      overflow:auto;
      max-height:${CFG.bubbleMaxHeight}px;
      padding-right:4px;
      white-space:pre-wrap;
      word-break:break-word;
    }

    #${ROOT_ID} .eyeai-close{
      position:absolute;
      top:8px;
      right:8px;
      width:26px;
      height:26px;
      border-radius:10px;
      border:none;
      background: rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.9);
      cursor:pointer;
      pointer-events:auto;
    }
    #${ROOT_ID} .eyeai-close:hover{ background: rgba(255,255,255,0.18); }

    #${ROOT_ID} .eyeai-tail{
      position:fixed;
      width:14px;
      height:14px;
      background: rgba(20,20,22,0.92);
      transform: rotate(45deg);
      display:none;
      pointer-events:none;
      box-shadow: 0 10px 30px rgba(0,0,0,0.12);
    }

    #${ROOT_ID} .eyeai-ui{
      position:fixed;
      width:${CFG.uiMaxWidth}px;
      display:flex;
      gap:8px;
      align-items:center;
      pointer-events:auto;
    }

    #${ROOT_ID} .eyeai-input{
      flex:1;
      padding:10px 12px;
      border-radius:14px;
      border: 1px solid rgba(0,0,0,0.12);
      outline:none;
      background: rgba(255,255,255,0.92);
      font-size:14px;
    }

    #${ROOT_ID} .eyeai-btn{
      padding:10px 12px;
      border-radius:14px;
      border:none;
      cursor:pointer;
      font-size:14px;
      background: rgba(0,0,0,0.85);
      color: white;
    }
    #${ROOT_ID} .eyeai-btn:hover{ background: rgba(0,0,0,0.75); }
  `);

  // -----------------------------
  // (E) DOM creation
  // -----------------------------
  const root = document.createElement("div");
  root.id = ROOT_ID;

  const vtuber = document.createElement("div");
  vtuber.className = "eyeai-vtuber";
  vtuber.style.right = `${CFG.avatarPos.right}px`;
  vtuber.style.bottom = `${CFG.avatarPos.bottom}px`;

  const idlePng = document.createElement("img");
  idlePng.className = "eyeai-idlepng eyeai-avatar-layer";
  idlePng.alt = "idle";
  idlePng.src = resolveAsset(CFG.idleStillPng);

  const video = document.createElement("video");
  video.className = "eyeai-video eyeai-avatar-layer";
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.loop = true;
  video.preload = "auto";

  vtuber.appendChild(idlePng);
  vtuber.appendChild(video);

  const bubble = document.createElement("div");
  bubble.className = "eyeai-bubble";

  const closeBtn = document.createElement("button");
  closeBtn.className = "eyeai-close";
  closeBtn.title = "Close";
  closeBtn.textContent = "✕";

  const bubbleText = document.createElement("div");
  bubbleText.className = "eyeai-text";

  bubble.appendChild(closeBtn);
  bubble.appendChild(bubbleText);

  const tail = document.createElement("div");
  tail.className = "eyeai-tail";

  const ui = document.createElement("div");
  ui.className = "eyeai-ui";
  ui.style.right = `${CFG.inputPos.right}px`;
  ui.style.bottom = `${CFG.inputPos.bottom}px`;

  const input = document.createElement("input");
  input.className = "eyeai-input";
  input.placeholder = "Ask about this page…";

  const askBtn = document.createElement("button");
  askBtn.className = "eyeai-btn";
  askBtn.textContent = "Ask";

  const speakBtn = document.createElement("button");
  speakBtn.className = "eyeai-btn";
  speakBtn.textContent = "Speak";

  ui.appendChild(input);
  ui.appendChild(askBtn);
  ui.appendChild(speakBtn);

  root.appendChild(vtuber);
  root.appendChild(bubble);
  root.appendChild(tail);
  root.appendChild(ui);
  document.body.appendChild(root);

  // -----------------------------
  // (F) Bubble positioning
  // -----------------------------
  function positionBubble() {
    if (CFG.bubbleMode === "fixed") {
      bubble.style.left = `${CFG.bubbleFixed.x}px`;
      bubble.style.top = `${CFG.bubbleFixed.y}px`;
      tail.style.left = `${CFG.bubbleFixed.x + 40}px`;
      tail.style.top = `${CFG.bubbleFixed.y + bubble.offsetHeight - 10}px`;
      return;
    }
    const rect = vtuber.getBoundingClientRect();
    const x = rect.left + CFG.bubbleOffset.dx;
    const y = rect.top + CFG.bubbleOffset.dy;
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
    tail.style.left = `${rect.left + 40}px`;
    tail.style.top = `${rect.top + 90}px`;
  }

  function showBubble(text) {
    bubbleText.textContent = text || "";
    bubble.style.display = "block";
    tail.style.display = "block";
    positionBubble();
  }

  function hideBubble() {
    bubble.style.display = "none";
    tail.style.display = "none";
  }

  closeBtn.addEventListener("click", hideBubble);
  window.addEventListener("resize", () => {
    CFG.bubbleFixed.x = window.innerWidth - CFG.bubbleMaxWidth - 18;
    positionBubble();
  });
  window.addEventListener("scroll", positionBubble, { passive: true });

  // -----------------------------
  // (G) Page text extraction
  // -----------------------------
  function extractPageText() {
    const text = document.body?.innerText || "";
    return text.replace(/\s+/g, " ").trim().slice(0, 40000);
  }

  // -----------------------------
  // (H) Backend call
  // -----------------------------
  async function askBackend(question) {
    const pageText = extractPageText();
    let r;
    try {
      r = await fetch(CFG.backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, pageText }),
      });
    } catch (e) {
      throw new Error("Failed to fetch backend. Run `npm start`. Details: " + String(e));
    }

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.details || data?.error || `HTTP ${r.status}`);
    return data.answer || "(no answer)";
  }

  // -----------------------------
  // (I) Avatar switching
  // -----------------------------
  const AVATAR = {
    state: "idle",
    gestureUnlocked: false,
    nextMainAt: nowMs() + randMs(CFG.idleMainEverySecondsMin, CFG.idleMainEverySecondsMax),
    mainUntil: 0,
    nextRareAt: nowMs() + randMs(CFG.idleRareEverySecondsMin, CFG.idleRareEverySecondsMax),
    rareUntil: 0,
  };

  function showPngIdle() {
    idlePng.style.opacity = "1";
    video.style.opacity = "0";
    // IMPORTANT: do NOT remove src (that was causing the broken-icon flash)
    video.pause();
    try { video.currentTime = 0; } catch {}
  }

  async function tryPlay() {
    try {
      await video.play();
      return true;
    } catch {
      return false;
    }
  }

  function waitForVideoReady(timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onErr);
      };
      const finishOk = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve(true);
      };
      const finishErr = (err) => {
        if (done) return;
        done = true;
        cleanup();
        reject(err || new Error("video error"));
      };
      const onReady = () => finishOk();
      const onErr = () => finishErr(new Error("Failed to load video: " + (video.currentSrc || video.src)));

      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("canplay", onReady, { once: true });
      video.addEventListener("error", onErr, { once: true });

      // If already ready, resolve immediately
      if (video.readyState >= 2) finishOk();

      setTimeout(() => {
        if (!done) finishErr(new Error("Timed out waiting for video ready"));
      }, timeoutMs);
    });
  }

  async function setVideoSrc(rel, { loop = true } = {}) {
    if (!rel) return;

    // Keep PNG visible until we KNOW the video is ready
    video.style.opacity = "0";
    idlePng.style.opacity = "1";

    video.loop = loop;

    const full = resolveAsset(rel);

    // Swap source if needed
    if (!video.src || video.src !== full) {
      video.src = full;
      video.load();
    } else {
      // same source; restart it
      try { video.currentTime = 0; } catch {}
    }

    try {
      await waitForVideoReady(CFG.videoReadyTimeoutMs);

      const ok = await tryPlay();
      if (!ok) {
        showPngIdle();
        return;
      }

      // Only now show the video
      idlePng.style.opacity = "0";
      video.style.opacity = "1";
    } catch (e) {
      // If load fails, stay on PNG (no flicker)
      console.warn(String(e));
      showPngIdle();
    }
  }

  async function setState(state) {
    AVATAR.state = state;

    if (state === "idle") {
      showPngIdle();
      return;
    }

    const rel = (CFG.videos[state] && CFG.videos[state][0]) || null;
    if (rel) await setVideoSrc(rel, { loop: true });
  }

  function unlockOnGesture() {
    if (AVATAR.gestureUnlocked) return;
    AVATAR.gestureUnlocked = true;
    tryPlay();
    window.removeEventListener("pointerdown", unlockOnGesture);
    window.removeEventListener("keydown", unlockOnGesture);
  }
  window.addEventListener("pointerdown", unlockOnGesture);
  window.addEventListener("keydown", unlockOnGesture);

  // -----------------------------
  // (J) Idle scheduler
  // -----------------------------
  async function idleSchedulerTick() {
    if (AVATAR.state !== "idle") return;
    const t = nowMs();

    if (AVATAR.rareUntil && t >= AVATAR.rareUntil) {
      AVATAR.rareUntil = 0;
      showPngIdle();
      AVATAR.nextRareAt = t + randMs(CFG.idleRareEverySecondsMin, CFG.idleRareEverySecondsMax);
      return;
    }

    if (AVATAR.mainUntil && t >= AVATAR.mainUntil) {
      AVATAR.mainUntil = 0;
      showPngIdle();
      AVATAR.nextMainAt = t + randMs(CFG.idleMainEverySecondsMin, CFG.idleMainEverySecondsMax);
      return;
    }

    if (!AVATAR.rareUntil && !AVATAR.mainUntil) {
      if (t >= AVATAR.nextRareAt && CFG.idleRareVideos.length > 0) {
        const clip = pickRandom(CFG.idleRareVideos);
        const dur = randMs(CFG.idleRareDurationSecondsMin, CFG.idleRareDurationSecondsMax);
        AVATAR.rareUntil = t + dur;
        await setVideoSrc(clip, { loop: true });
        return;
      }

      if (t >= AVATAR.nextMainAt && CFG.idleMainVideos.length > 0) {
        const clip = pickRandom(CFG.idleMainVideos);
        const sec = (CFG.idleMainFixedDurationsSec && CFG.idleMainFixedDurationsSec[clip]) || 4;
        const dur = sec * 1000;
        AVATAR.mainUntil = t + dur;
        await setVideoSrc(clip, { loop: true });
        return;
      }
    }
  }

  // -----------------------------
  // (K) TTS
  // -----------------------------
  let lastAnswer = "";

  function speak(text) {
    if (!text) return;
    speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.05;

    u.onstart = () => setState("talking");
    u.onend = () => setState("idle");
    u.onerror = () => setState("idle");

    speechSynthesis.speak(u);
  }

  // -----------------------------
  // (L) Main ask flow
  // -----------------------------
  async function runAsk() {
    const q = (input.value || "").trim() || "Summarize this page in 3 bullet points.";
    showBubble("Thinking...");
    await setState("thinking");

    try {
      const ans = await askBackend(q);
      lastAnswer = ans;
      showBubble(ans);
      speak(ans);
    } catch (e) {
      showBubble("Error: " + e.message);
      setState("idle");
    }
  }

  askBtn.addEventListener("click", runAsk);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runAsk();
  });
  speakBtn.addEventListener("click", () => speak(lastAnswer || bubbleText.textContent || ""));

  // -----------------------------
  // (M) Start
  // -----------------------------
  (async () => {
    showPngIdle();
    showBubble("Ask me about this page 👇");
    setInterval(idleSchedulerTick, 250);
  })();
})();
