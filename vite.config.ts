import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed dev server address.
  server: {
    port: 5173,
    strictPort: true,
  },
  clearScreen: false,
})
