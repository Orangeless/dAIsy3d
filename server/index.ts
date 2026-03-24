import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { initDb } from './services/memoryStore'
import { chatRouter } from './routes/chat'

const PORT = parseInt(process.env.PORT || '3847', 10)
const app = express()

app.use(cors())
app.use(express.json({ limit: '2mb' }))

const ASSETS_PATH = process.env.KLAIRA_ASSETS_PATH || path.join(process.cwd(), 'assets')

app.get('/model', (_req, res) => {
  const modelPath = path.join(ASSETS_PATH, 'models', 'klaira.vrm')
  if (!fs.existsSync(modelPath)) {
    return res.status(404).json({ error: 'VRM model not found. Place klaira.vrm in assets/models/' })
  }
  res.setHeader('Content-Type', 'model/gltf-binary')
  res.sendFile(modelPath)
})

app.get('/animations/:filename', (req, res) => {
  const filename = req.params.filename
  if (!filename.endsWith('.vrma') || filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' })
  }
  let filePath = path.join(ASSETS_PATH, 'animations', filename)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(ASSETS_PATH, 'models', filename)
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `Animation not found: ${filename}` })
  }
  res.setHeader('Content-Type', 'model/gltf-binary')
  res.sendFile(filePath)
})

app.use('/chat', chatRouter)

app.get('/health', (_req, res) => res.json({ ok: true }))

initDb()

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] Klaira backend running on http://127.0.0.1:${PORT}`)
  if (process.send) process.send('ready')
})
