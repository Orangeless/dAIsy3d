import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    server: {
      proxy: {
        '/model': 'http://127.0.0.1:3847',
        '/animations': 'http://127.0.0.1:3847',
        '/chat': 'http://127.0.0.1:3847',
        '/health': 'http://127.0.0.1:3847'
      }
    }
  }
})
