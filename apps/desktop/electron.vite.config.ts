import { resolve } from 'node:path'
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
    build: {
      rollupOptions: {
        // The app window, and the off-screen page whose frames become the NDI output.
        input: {
          index: resolve(import.meta.dirname, 'src/renderer/index.html'),
          output: resolve(import.meta.dirname, 'src/renderer/output.html'),
        },
      },
    },
  },
})
