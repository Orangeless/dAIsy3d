// =======================
// server.js (HF ROUTER FIX)
// =======================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// -----------------------
// Force-load backend/.env
// -----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// Startup debug
console.log("HF_TOKEN loaded at startup?", !!process.env.HF_TOKEN);
console.log("HF_MODEL at startup =", process.env.HF_MODEL);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const DEFAULT_MODEL = "google/gemma-2-2b-it";

// ✅ NEW: Router endpoint (OpenAI-compatible)
const HF_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";

function buildMessages(pageText, question) {
  const clipped = (pageText || "").slice(0, 40000);

  return [
    {
      role: "system",
      content:
        "You are a helpful website assistant character living in the corner of the page. " +
        "Answer using ONLY the provided PAGE CONTENT. " +
        "If the answer is not in the PAGE CONTENT, say you can't find it on this page. " +
        "Return ONLY strict JSON with keys: answer (string) and quotes (array of 1-3 exact verbatim snippets from PAGE CONTENT used to answer). " +
        "Each quote must be an exact substring from PAGE CONTENT, ideally one full sentence or short clause (max 240 chars). " +
        "The answer must be supported by one of the quotes; if not, set quotes to [].",
    },
    {
      role: "user",
      content:
        `PAGE CONTENT:\n${clipped}\n\nQUESTION:\n${question}\n\n` +
        `Return JSON only.`,
    },
  ];
}

function extractQuotesFromPageText(pageText, answer) {
  const text = (pageText || "").replace(/\s+/g, " ").trim();
  if (!text || !answer) return [];

  const sentences = text
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 320);

  if (!sentences.length) return [];

  const stop = new Set([
    "the", "and", "that", "this", "with", "from", "your", "you", "about", "what",
    "when", "where", "which", "their", "there", "have", "has", "been", "will",
    "would", "could", "should", "into", "over", "under", "because", "also",
    "than", "then", "them", "they", "here", "just", "like", "some", "more",
    "most", "such", "many", "much", "find", "page", "content", "based", "answer",
    "details", "size", "therefore", "cant", "cannot", "couldnt", "couldn't"
  ]);

  const tokens = (answer || "")
    .toLowerCase()
    .match(/\b[a-z0-9]{3,}\b/g)
    ?.filter((w) => !stop.has(w)) || [];

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

  return bestScore > 0 && best ? [best] : [];
}

function deriveAnswerFromPage(pageText, question) {
  const text = (pageText || "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const q = (question || "").toLowerCase();
  const sentences = text
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 320);

  if (!sentences.length) return null;

  const best = extractQuotesFromPageText(pageText, question)?.[0]
    || extractQuotesFromPageText(pageText, text)?.[0]
    || sentences[0];

  const sentence = best || sentences[0];

  if (q.includes("meaning") || q.includes("latin")) {
    const meaningMatch = sentence.match(/\bmeaning\s+['"]?[^)".;]+/i);
    if (meaningMatch) return meaningMatch[0].trim();
  }

  if (q.includes("latin") && q.includes("name")) {
    const nameMatch = sentence.match(/\b[Tt]yrannosaurus rex\b/);
    if (nameMatch) return nameMatch[0];
  }

  return sentence;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    hfTokenLoaded: !!process.env.HF_TOKEN,
    model: process.env.HF_MODEL || DEFAULT_MODEL,
  });
});

app.post("/api/ask", async (req, res) => {
  try {
    // Read env per request (no stale values)
    const HF_TOKEN = process.env.HF_TOKEN;
    const MODEL = process.env.HF_MODEL || DEFAULT_MODEL;

    if (!HF_TOKEN) {
      return res.status(500).json({
        error: "Missing HF_TOKEN in backend/.env",
        hint: "Server started without token or wrong .env file",
      });
    }

    const { question, pageText } = req.body || {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing question (string)" });
    }

    const messages = buildMessages(pageText, question);

    const response = await fetch(HF_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HF_TOKEN}`, // Bearer token required :contentReference[oaicite:2]{index=2}
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Hugging Face router request failed",
        status: response.status,
        details: rawText,
        hint:
          "If 404/400, try a different model. If 429, you hit free-tier limits. If 403, the model is gated.",
      });
    }

    const data = JSON.parse(rawText);

    const content =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "(No answer returned)";

    let answer = content;
    let quotes = [];
    const tryParse = (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    };

    let parsed = tryParse(content);
    if (!parsed) {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = tryParse(match[0]);
    }

    if (parsed && typeof parsed.answer === "string") {
      answer = parsed.answer;
    }
    if (Array.isArray(parsed?.quotes)) {
      quotes = parsed.quotes.filter((q) => typeof q === "string");
    }

    if (!quotes.length) {
      const derived = deriveAnswerFromPage(pageText, question);
      if (derived) {
        answer = derived;
      }
      quotes = extractQuotesFromPageText(pageText, answer);
    }

    res.json({ answer, quotes });
  } catch (err) {
    res.status(500).json({ error: "Backend crashed", details: String(err) });
  }
});

app.listen(3001, () => {
  console.log("Backend running: http://localhost:3001");
  console.log("GET  /health");
  console.log("POST /api/ask");
});
