# dAIsy3d 🌸

An embeddable AI-powered website assistant with a live 3D VRM avatar. Drop it onto any webpage and your users can ask questions about the page's content — answered by an LLM, with the relevant text highlighted directly on the page, while dAIsy gestures and reacts in real time.

---

## What it does

- **Page-aware Q&A** — Scrapes the current page's text and sends it alongside the user's question to a Hugging Face LLM (via the [HF Inference Router](https://huggingface.co/docs/api-inference/index)). Answers are grounded in the page content only.
- **Quote highlighting** — After answering, dAIsy highlights the exact sentence(s) from the page that support the answer, with a smooth scroll and a pulsing yellow highlight.
- **Live 3D avatar** — A fully rigged VRM character rendered with [Three.js](https://threejs.org/) and [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm). dAIsy plays a greeting wave on load, idles with procedural breathing/sway animations, and points at the page when giving an answer.
- **Draggable UI** — The avatar, chat bubble, and input box are all independently draggable around the screen.
- **Graceful fallback** — If the upstream model is unavailable or rate-limited, the backend derives a best-effort answer directly from the page text without failing the UI.

---

## Project structure

```
dAIsy3d/
├── backend/
│   ├── server.js       # Express API server — proxies questions to HF Router
│   └── .env            # Your HF_TOKEN and optional HF_MODEL go here
└── frontend/
    ├── main.js         # All UI + Three.js / VRM logic (injected as a module)
    ├── eyeai.css       # Styles for the overlay shell, bubble, and input
    ├── index.html      # Demo page
    └── assets/
        └── anim/
            ├── dAIsy.vrm           # The VRM avatar model
            ├── hello.vrma          # Greeting wave animation
            ├── idle1–4.vrma        # Idle animation pool
            ├── point longer.vrma   # Pointing animation (variant 1)
            ├── point2.vrma         # Pointing animation (variant 2)
            └── picked_up.vrma      # "Picked up" interaction animation
```

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Hugging Face](https://huggingface.co/) account with an API token

### 1. Clone the repo

```bash
git clone https://github.com/Orangeless/dAIsy3d.git
cd dAIsy3d
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend/` folder:

```env
HF_TOKEN=hf_your_token_here
HF_MODEL=google/gemma-2-2b-it   # optional — this is the default
```

### 3. Start the backend

```bash
npm start
# Backend running at http://localhost:3001
```

You can verify it's working by visiting `http://localhost:3001/health`.

### 4. Serve the frontend

The frontend uses ES modules with an import map, so it must be served over HTTP (not opened as a local file). From the `frontend/` directory:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

## Embedding on your own page

Add the following two tags to any HTML page:

```html
<link rel="stylesheet" href="path/to/eyeai.css" />
<script type="module" src="path/to/main.js"></script>
```

Make sure the `assets/anim/` folder (containing `dAIsy.vrm` and all `.vrma` files) is accessible relative to `main.js`, and that the backend is running and reachable at `http://localhost:3001`.

---

## How it works

1. The user types a question into the input box and clicks **Ask** (or presses Enter).
2. The frontend scrapes the page's visible text and POSTs `{ question, pageText }` to `/api/ask`.
3. The backend forwards this to the Hugging Face Inference Router using the OpenAI-compatible `/v1/chat/completions` endpoint. The LLM is instructed to answer using only the provided page content and return a JSON object with an `answer` string and a `quotes` array of verbatim excerpts.
4. The backend parses the response, extracts the answer and quotes, and returns them to the frontend.
5. The frontend displays the answer in a floating bubble, highlights the matching text on the page, and triggers dAIsy's pointing animation for the estimated duration of the response.

### Fallback behaviour

If the configured model is unavailable (HTTP 400/404), the backend automatically retries with `google/gemma-2-2b-it`. If the upstream call still fails, it derives an answer locally by scoring page sentences against the question keywords — so the UI never hard-crashes.

---

## Avatar interactions

| Interaction | Behaviour |
|---|---|
| Page load | dAIsy plays a greeting wave, then holds the final pose as an idle base |
| Idle | Procedural breathing, gentle sway, and random idle clip playback |
| Answer received | dAIsy plays a pointing animation for the estimated talk duration |
| Drag on avatar (click + drag) | Spins the model on the Y axis |
| Ctrl + drag on avatar | Triggers the "picked up" animation; release to put down |
| Drag on shell (outside avatar) | Moves the whole widget around the screen |
| Scroll on avatar | Zooms the camera in/out |
| Drag on bubble | Repositions the answer bubble |

---

## Configuration

At the top of `main.js` there's a `CFG` object where you can tweak layout and behaviour:

```js
const CFG = {
  backendUrl:    "http://localhost:3001/api/ask",
  avatarUIScale: 0.52,          // Size of the avatar on screen
  avatarPos:     { right: 32, bottom: 18 },
  bubbleMaxWidth:  360,
  bubbleMaxHeight: 220,
  highlightMinMs:  3000,        // Min time page quote stays highlighted
  highlightMaxMs: 10000,        // Max time page quote stays highlighted
  vrmPath: "assets/anim/dAIsy.vrm",
};
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Avatar rendering | [Three.js](https://threejs.org/) + [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm) |
| Animations | VRM Animation (`.vrma`) via `@pixiv/three-vrm-animation` |
| Backend | [Express](https://expressjs.com/) (Node.js) |
| LLM | [Hugging Face Inference Router](https://huggingface.co/docs/api-inference/index) (OpenAI-compatible) |
| Default model | `google/gemma-2-2b-it` |

---

## License

Copyright (No license)
