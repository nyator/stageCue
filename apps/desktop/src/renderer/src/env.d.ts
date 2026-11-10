/// <reference types="vite/client" />

import type { DesktopBridge } from '@stagecue/shared-types'

declare global {
  interface Window {
    stagecue: DesktopBridge
  }
}

export {}
