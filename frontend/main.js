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
    avatarUIScale: 0.4,

    avatarPos: { right: 32, bottom: 92 },
    inputPos: { right: 32, bottom: 18 },

    bubbleMode: "fixed",
    bubbleFixed: { x: window.innerWidth - 380 - 18, y: 60 },
    bubbleOffset: { dx: -360, dy: -140 },

    bubbleMaxWidth: 360,
    bubbleMaxHeight: 220,
    uiMaxWidth: 380,

    idleMainEverySecondsMin: 30,
    idleMainEverySecondsMax: 60,

    idleRareEverySecondsMin: 120,
    idleRareEverySecondsMax: 240,
    idleRareDurationSecondsMin: 5,
    idleRareDurationSecondsMax: 5,

    // Canonical idle video (used for STILL + animation)
    idleMainVideo: "assets/video/idle_main1.mp4",

    idleRareVideos: [
      "assets/video/idle1.mp4",
      "assets/video/idle2.mp4",
    ],

    videos: {
      talkingMid: ["assets/video/talking_mid.mp4"],
    },

    videoReadyTimeoutMs: 2500,
    highlightMinMs: 3000,
    highlightMaxMs: 10000,
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  const nowMs = () => Date.now();
  const randMs = (a, b) => (Math.random() * (b - a) + a) * 1000;
  const resolveAsset = (p) => CFG.assetsBase + p;

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

  const dragHint = document.createElement("div");
  dragHint.className = "eyeai-drag-hint";
  dragHint.textContent = "Drag me";

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
  idleStill.src = resolveAsset(CFG.idleMainVideo);

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

  vtuber.appendChild(idleStill);
  vtuber.appendChild(animVideo);
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

  // Ensure the idle still frame is loaded and visible on startup
  idleStill.load();
  holdIdleStill(CFG.idleMainVideo);

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

  async function playVideo(src, loop = true) {
    if (document.visibilityState === "hidden") return;
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
    try {
      idleStillHold = true;
      idleStill.src = resolveAsset(src);
      await waitForMetadata(idleStill);
      const last = Math.max(0, (idleStill.duration || 0) - 0.05);
      idleStill.currentTime = last;
      idleStill.pause();
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

  function releaseToIdle() {
    stopVideo();
    animationHold = false;
    until = 0;
    nextIdle = nowMs() + 3000;
  }

  async function tick() {
    if (animationHold) return;
    const t = nowMs();
    if (t < until) return;

    if (t >= nextIdle) {
      if (idlePlaying) return;
      idlePlaying = true;
      const clip = idlePool[Math.floor(Math.random() * idlePool.length)];
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
      const midClip = pickClip(CFG.videos?.talkingMid);

      const midMs = Math.max(2000, durationMs);

      if (midClip) {
        await playLoopFor(midClip, midMs);
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
    if (bubble.style.display !== "none") positionBubble();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      stopVideo();
      animationHold = false;
    }
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
    if (e.target === input || e.target === askBtn) return;
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
    const newRight = Math.max(0, startRight - dx);
    const newBottom = Math.max(0, startBottom - dy);
    shell.style.right = `${newRight}px`;
    shell.style.bottom = `${newBottom}px`;
    if (bubble.style.display !== "none") positionBubble();
  }

  function onDragEnd() {
    dragOn = false;
  }

  shell.addEventListener("mousedown", onDragStart);
  window.addEventListener("mousemove", onDragMove);
  window.addEventListener("mouseup", onDragEnd);
  shell.addEventListener("touchstart", onDragStart, { passive: true });
  window.addEventListener("touchmove", onDragMove, { passive: true });
  window.addEventListener("touchend", onDragEnd);

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
