import type { DatabaseSync } from 'node:sqlite'
import type { RequestErrorCode } from '@stagecue/event-protocol'

/** An expected failure whose message is safe to show to the user. */
export class EngineError extends Error {
  readonly code: Exclude<RequestErrorCode, 'internal_error'>

  constructor(code: Exclude<RequestErrorCode, 'internal_error'>, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}

export type Row = Record<string, unknown>

export function nowIso(): string {
  return new Date().toISOString()
}

/** Runs fn in a transaction, or inside the caller's transaction if one is open. */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) {
    return fn()
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function text(value: unknown): string {
  return value as string
}

export function textOrNull(value: unknown): string | null {
  return value === null ? null : (value as string)
}

export function numberOrNull(value: unknown): number | null {
  return value === null ? null : Number(value)
}

export function jsonArray<T>(value: unknown): T[] {
  return JSON.parse(value as string) as T[]
}

export function jsonArrayOrNull<T>(value: unknown): T[] | null {
  return value === null ? null : jsonArray<T>(value)
}

export function quoted(name: string): string {
  return `“${name}”`
}
