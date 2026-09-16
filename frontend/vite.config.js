import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com', 'tournament.john-chau.eu.org'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
