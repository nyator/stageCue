import { z } from 'zod'
import { METHOD_NAMES, requestErrorCodeSchema } from './methods.ts'
import { clientRoleSchema } from './roles.ts'

export { clientRoleSchema, type ClientRole } from './roles.ts'

/** Bumped on any breaking change to the wire format. Peers with a different version are refused. */
export const PROTOCOL_VERSION = 1

export const DEFAULT_ENGINE_PORT = 7417

/** Upper bound for a single WebSocket frame. Larger frames are rejected by the engine. */
export const MAX_MESSAGE_BYTES = 64 * 1024

/** WebSocket close codes used by the engine. 4000–4999 are reserved for applications. */
export const CloseCode = {
  shuttingDown: 1001,
  unsupportedVersion: 4000,
  handshakeTimeout: 4001,
} as const

/** Unix epoch milliseconds. */
const timestamp = z.int().nonnegative()
const sequence = z.int().nonnegative()

export const errorCodeSchema = z.enum([
  'invalid_json',
  'invalid_message',
  'unsupported_version',
  'stale_message',
  'internal_error',
])
export type ErrorCode = z.infer<typeof errorCodeSchema>

/*
 * Client → engine messages are strict: unknown fields are rejected, because the
 * engine is the authority and must not act on input it does not understand.
 */
function clientMessage<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.strictObject({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    seq: sequence,
    sentAt: timestamp,
    payload,
  })
}

/*
 * Engine → client messages drop unknown fields instead of rejecting them, so a
 * newer engine can add informational fields without breaking older clients.
 */
function serverMessage<T extends string, P extends z.ZodType>(type: T, payload: P) {
  return z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    seq: sequence,
    sentAt: timestamp,
    payload,
  })
}

export const helloMessageSchema = clientMessage(
  'hello',
  z.strictObject({
    clientId: z.uuid(),
    role: clientRoleSchema,
    name: z.string().trim().min(1).max(80),
  }),
)

export const connectedClientSchema = z.object({
  clientId: z.uuid(),
  role: clientRoleSchema,
  name: z.string(),
})
export type ConnectedClient = z.infer<typeof connectedClientSchema>

export const engineStatusSchema = z.object({
  instanceId: z.uuid(),
  startedAt: timestamp,
  protocolVersion: z.literal(PROTOCOL_VERSION),
  schemaVersion: z.int().nonnegative(),
  clients: z.array(connectedClientSchema),
})
export type EngineStatus = z.infer<typeof engineStatusSchema>

export const welcomeMessageSchema = serverMessage(
  'welcome',
  z.object({
    connectionId: z.uuid(),
    serverTime: timestamp,
    status: engineStatusSchema,
  }),
)

export const engineStatusMessageSchema = serverMessage('engine.status', engineStatusSchema)

export const errorMessageSchema = serverMessage(
  'error',
  z.object({
    code: errorCodeSchema,
    message: z.string(),
    /** Sequence number of the client message that caused the error, when known. */
    refSeq: sequence.nullable(),
  }),
)

/** Params are validated per method by the engine, so a bad request gets a response, not a generic error. */
export const requestMessageSchema = clientMessage(
  'request',
  z.strictObject({
    requestId: z.string().min(1).max(64),
    method: z.enum(METHOD_NAMES),
    params: z.unknown(),
  }),
)

const requestId = z.string().min(1).max(64)

export const responseMessageSchema = serverMessage(
  'response',
  z.discriminatedUnion('ok', [
    z.object({ requestId, ok: z.literal(true), result: z.unknown() }),
    z.object({
      requestId,
      ok: z.literal(false),
      error: z.object({ code: requestErrorCodeSchema, message: z.string() }),
    }),
  ]),
)

/** Sent to every identified client after any successful mutation, so open views can refresh. */
export const libraryChangedMessageSchema = serverMessage(
  'library.changed',
  z.object({ method: z.string() }),
)

export const clientMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  requestMessageSchema,
])
export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeMessageSchema,
  engineStatusMessageSchema,
  errorMessageSchema,
  responseMessageSchema,
  libraryChangedMessageSchema,
])

export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
export type ClientMessagePayload<T extends ClientMessage['type']> = Extract<
  ClientMessage,
  { type: T }
>['payload']
export type ServerMessagePayload<T extends ServerMessage['type']> = Extract<
  ServerMessage,
  { type: T }
>['payload']
