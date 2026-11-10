import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const externalizeDeps = {
  exclude: [
    '@stagecue/shared-types',
    '@stagecue/event-protocol',
    '@stagecue/arrangement',
    '@stagecue/ableton',
    '@stagecue/logic',
    '@stagecue/propresenter',
  ],
}

export default defineConfig({
  main: {
    build: { externalizeDeps },
  },
  preload: {
    build: {
      externalizeDeps,
      // Sandboxed preload scripts must be CommonJS.
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
  },
})
