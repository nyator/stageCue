import type { MethodName, MethodParams, MethodResult } from '@stagecue/event-protocol'
import { useCallback, useEffect, useState } from 'react'
import { EngineRequestError } from './engine-connection'
import { engine, useEngineState } from './index'

export function errorMessage(error: unknown): string {
  if (error instanceof EngineRequestError) {
    return error.message
  }
  return 'Something went wrong. Try again.'
}

export interface QueryState<T> {
  /** The latest data. Kept while a refresh is in flight so views do not flicker. */
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
}

interface Fetched<T> {
  fetchId: string
  data: T | undefined
  error: string | null
}

/**
 * Loads data from the engine and keeps it fresh: it refetches when the params
 * change, when the connection comes back, and when any client changes the library.
 * Pass null params to skip loading.
 */
export function useEngineQuery<M extends MethodName>(
  method: M,
  params: MethodParams<M> | null,
): QueryState<MethodResult<M>> {
  const connected = useEngineState().phase === 'connected'
  const [revision, setRevision] = useState(0)
  const [fetched, setFetched] = useState<Fetched<MethodResult<M>> | null>(null)

  const paramsKey = params === null ? null : JSON.stringify(params)
  const fetchId = `${method}|${paramsKey}|${revision}`

  useEffect(() => engine.onLibraryChanged(() => setRevision((value) => value + 1)), [])

  useEffect(() => {
    if (paramsKey === null || !connected) {
      return
    }

    let cancelled = false
    engine.request(method, JSON.parse(paramsKey) as MethodParams<M>).then(
      (data) => {
        if (!cancelled) setFetched({ fetchId, data, error: null })
      },
      (error: unknown) => {
        if (!cancelled) {
          setFetched((previous) => ({ fetchId, data: previous?.data, error: errorMessage(error) }))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [method, paramsKey, connected, fetchId])

  const reload = useCallback(() => setRevision((value) => value + 1), [])

  // Data from a different method or params is never shown.
  const sameQuery = fetched?.fetchId.startsWith(`${method}|${paramsKey}|`) ?? false
  return {
    data: sameQuery ? fetched?.data : undefined,
    error: sameQuery ? (fetched?.error ?? null) : null,
    loading: paramsKey !== null && fetched?.fetchId !== fetchId,
    reload,
  }
}

export interface Action {
  pending: boolean
  error: string | null
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>
  clearError: () => void
}

/** Tracks one user-triggered operation: pending state and a readable error. */
export function useAction(): Action {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    setPending(true)
    setError(null)
    try {
      return await task()
    } catch (caught) {
      setError(errorMessage(caught))
      return undefined
    } finally {
      setPending(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  return { pending, error, run, clearError }
}
