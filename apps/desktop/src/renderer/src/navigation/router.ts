import { useEffect, useSyncExternalStore } from 'react'

export type Route = 'live' | 'style' | 'setup'

let current: Route = 'live'
const listeners = new Set<() => void>()
const blockers = new Set<() => boolean>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => current)
}

/** Changes tab unless a view with unsaved changes asks to stay. */
export function navigate(route: Route): void {
  for (const isBlocked of blockers) {
    if (isBlocked() && !window.confirm('You have unsaved changes. Leave without saving?')) {
      return
    }
  }
  current = route
  for (const listener of listeners) {
    listener()
  }
}

/** While dirty is true, leaving the tab asks for confirmation. */
export function useUnsavedChangesGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) {
      return
    }
    const blocker = () => true
    blockers.add(blocker)
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      blockers.delete(blocker)
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [dirty])
}
