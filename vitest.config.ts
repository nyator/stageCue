import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{apps,packages,integrations}/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
