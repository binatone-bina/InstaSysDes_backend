import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://connectsphere-backend-6leh.onrender.com',
        changeOrigin: true,
        secure: false,
        ws: true
      },
      '/uploads': {
        target: 'https://connectsphere-backend-6leh.onrender.com',
        changeOrigin: true,
        secure: false
      }
    }
  }
})
