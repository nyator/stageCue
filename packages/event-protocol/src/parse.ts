import { z } from 'zod'
import {
  clientMessageSchema,
  PROTOCOL_VERSION,
  serverMessageSchema,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from './messages.ts'

export type ParseResult<T> =
  { ok: true; message: T } | { ok: false; code: ErrorCode; reason: string }

function parseWith<T>(schema: z.ZodType<T>, raw: string): ParseResult<T> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, code: 'invalid_json', reason: 'Message is not valid JSON.' }
  }

  // Checked before the schema so a version mismatch gets a specific error instead of a generic one.
  if (typeof json === 'object' && json !== null && 'v' in json && json.v !== PROTOCOL_VERSION) {
    return {
      ok: false,
      code: 'unsupported_version',
      reason: `Protocol version ${String(json.v)} is not supported. Expected ${PROTOCOL_VERSION}.`,
    }
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    return { ok: false, code: 'invalid_message', reason: z.prettifyError(result.error) }
  }

  return { ok: true, message: result.data }
}

export function parseClientMessage(raw: string): ParseResult<ClientMessage> {
  return parseWith(clientMessageSchema, raw)
}

export function parseServerMessage(raw: string): ParseResult<ServerMessage> {
  return parseWith(serverMessageSchema, raw)
}
