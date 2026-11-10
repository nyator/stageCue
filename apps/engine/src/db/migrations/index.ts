import { initialSchema } from './001-initial-schema.ts'

export interface Migration {
  /** Strictly increasing. Never renumber or edit a migration that has shipped; add a new one. */
  version: number
  name: string
  sql: string
}

export const migrations: readonly Migration[] = [initialSchema]
