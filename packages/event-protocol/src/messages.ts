import { loopSchema, markerSchema, transportSchema } from '@stagecue/arrangement'
import { z } from 'zod'
import { cueModeSchema, METHOD_NAMES, requestErrorCodeSchema } from './methods.ts'
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
  /** Where other computers can reach this engine, such as 192.168.1.20. */
  addresses: z.array(z.string()),
  port: z.int().min(0).max(65_535),
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

/** Sent to every identified client after any successful change, so open views can refresh. */
export const dataChangedMessageSchema = serverMessage(
  'data.changed',
  z.object({ method: z.string() }),
)

/*
 * DAW bridge → engine. Only connections that said hello as daw_bridge may send these.
 * Positions are in quarter notes (Ableton song time).
 */
export const dawMarkersMessageSchema = clientMessage(
  'daw.markers',
  z.strictObject({
    /** The DAW project or set name, when known. */
    project: z.string().trim().max(200).nullable(),
    markers: z.array(z.strictObject(markerSchema.shape)).max(1_000),
  }),
)

export const dawTransportMessageSchema = clientMessage(
  'daw.transport',
  z.strictObject({
    ...transportSchema.shape,
    timeSignature: z.strictObject(transportSchema.shape.timeSignature.shape),
    loop: z.strictObject(loopSchema.shape).nullable().optional(),
  }),
)

/**
 * Everything a display needs, sent whenever it changes. transport.beat is the
 * playhead at sentAt; receivers move it forward with the tempo between messages.
 */
export const liveStateSchema = z.object({
  daw: z.object({
    connected: z.boolean(),
    name: z.string().nullable(),
    project: z.string().nullable(),
  }),
  markers: z.array(markerSchema),
  transport: transportSchema.nullable(),
  mode: cueModeSchema,
  /** The media team took the band off screen. Older engines do not send it. */
  hidden: z.boolean().default(false),
})
export type LiveState = z.infer<typeof liveStateSchema>

export const liveStateMessageSchema = serverMessage('live.state', liveStateSchema)

export const clientMessageSchema = z.discriminatedUnion('type', [
  helloMessageSchema,
  requestMessageSchema,
  dawMarkersMessageSchema,
  dawTransportMessageSchema,
])
export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeMessageSchema,
  engineStatusMessageSchema,
  errorMessageSchema,
  responseMessageSchema,
  dataChangedMessageSchema,
  liveStateMessageSchema,
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
