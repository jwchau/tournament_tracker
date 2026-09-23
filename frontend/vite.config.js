import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.trycloudflare.com', 'tournament.johnchau.org'],
    // Docker Desktop bind mounts on Windows don't deliver file change events
    // to the container, so docker-compose turns on polling there.
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true', interval: 300 },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
