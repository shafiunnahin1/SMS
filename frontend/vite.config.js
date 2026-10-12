import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    // lvh.me resolves to 127.0.0.1; bind there explicitly so Windows does not listen on ::1 only
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: ['.lvh.me'],
    proxy: {
      // changeOrigin: false keeps the browser's Host header (<slug>.lvh.me) - Laravel resolves the tenant from it
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: false },
      // signed file links (temporaryUrl on the private disk) when APP_URL points at this dev server
      '/storage': { target: 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    exclude: [...configDefaults.exclude, 'e2e/**'],     // Playwright specs (npm run e2e), not Vitest
  },
})
