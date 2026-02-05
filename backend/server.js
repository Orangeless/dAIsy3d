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
        "If the answer is not in the PAGE CONTENT, say you can't find it on this page.",
    },
    {
      role: "user",
      content: `PAGE CONTENT:\n${clipped}\n\nQUESTION:\n${question}`,
    },
  ];
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

    const answer =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "(No answer returned)";

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: "Backend crashed", details: String(err) });
  }
});

app.listen(3001, () => {
  console.log("Backend running: http://localhost:3001");
  console.log("GET  /health");
  console.log("POST /api/ask");
});
