import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const backendPort = process.env.BACKEND_PORT || '8000'
const proxyTarget = process.env.VITE_PROXY_TARGET || `http://localhost:${backendPort}`

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: { reporter: ['text', 'html'] },
  },
})