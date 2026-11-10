import { useEffect, useSyncExternalStore } from 'react'

export type Route =
  | { name: 'dashboard' }
  | { name: 'songs' }
  | { name: 'song'; songId: string; tab: 'arrangements' | 'sections'; arrangementId: string | null }
  | { name: 'setlists'; setlistId: string | null }
  | { name: 'display'; setlistId: string | null; performanceId: string | null }
  | { name: 'connection' }

let current: Route = { name: 'dashboard' }
const listeners = new Set<() => void>()
const blockers = new Set<() => boolean>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getRoute(): Route {
  return current
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute)
}

/** Changes screen unless a view with unsaved changes asks to stay. */
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

/** While dirty is true, leaving the screen asks for confirmation. */
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
