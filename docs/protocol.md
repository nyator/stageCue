# Engine WebSocket protocol

Every StageCue component talks to the engine over one WebSocket connection. The schemas in `packages/event-protocol/src/messages.ts` are the source of truth. This document explains them.

- **Address:** `ws://<engine-host>:7417` by default
- **Version:** `1`
- **Frames:** UTF-8 JSON text frames of at most 64 KiB. Binary frames are rejected.

## Envelope

Every message in both directions has this shape:

```json
{ "v": 1, "type": "hello", "seq": 1, "sentAt": 1762776000000, "payload": {} }
```

| Field     | Meaning                                                                       |
| --------- | ----------------------------------------------------------------------------- |
| `v`       | Protocol version. A mismatch is refused.                                      |
| `type`    | Message type. It determines the shape of `payload`.                           |
| `seq`     | Sender's sequence number. Integer, strictly increasing within one connection. |
| `sentAt`  | Sender's clock, in Unix epoch milliseconds.                                   |
| `payload` | Type-specific body.                                                           |

### Validation and stale messages

- **The engine is strict.** A client message with an unknown field, a wrong type, or an out-of-range value is rejected with an `error` and is not acted on.
- **Clients are lenient.** They drop unknown fields from engine messages, so a newer engine can add informational fields without breaking older clients.
- **Stale messages are refused.** The engine rejects any client message whose `seq` is not greater than the last one it accepted on that connection, with `stale_message`. Clients ignore engine messages with a non-increasing `seq`. A `welcome` resets the counter because it marks a new engine session.
- **A bad message never closes the connection,** except for a protocol version mismatch.

## Connection lifecycle

1. The client opens the socket and sends `hello` within 5 seconds. Otherwise the engine closes it with code `4001`.
2. The engine replies with `welcome`, then sends `engine.status` to every identified client.
3. Every 10 seconds the engine sends a WebSocket ping. A peer that has not answered the previous ping is terminated. Browsers and `ws` answer pings automatically.
4. When a client disconnects, the remaining clients receive a new `engine.status`.
5. When a client loses the connection, it reconnects with exponential backoff (0.5 s doubling to a 5 s cap, plus jitter) and says `hello` again with the same `clientId`.

## Messages

### `hello` (client → engine)

| Field      | Type                                   | Notes                                                        |
| ---------- | -------------------------------------- | ------------------------------------------------------------ |
| `clientId` | UUID                                   | Stable per installation. The engine records it in `devices`. |
| `role`     | `desktop` \| `display` \| `daw_bridge` |                                                              |
| `name`     | string, 1–80 characters after trimming | Shown to operators                                           |

Sending a second `hello` on the same connection is an `invalid_message` error.

### `welcome` (engine → client)

| Field          | Type          |
| -------------- | ------------- |
| `connectionId` | UUID          |
| `serverTime`   | epoch ms      |
| `status`       | Engine status |

### `engine.status` (engine → client)

| Field             | Type                         | Notes                                |
| ----------------- | ---------------------------- | ------------------------------------ |
| `instanceId`      | UUID                         | Changes every time the engine starts |
| `startedAt`       | epoch ms                     |                                      |
| `protocolVersion` | `1`                          |                                      |
| `schemaVersion`   | integer                      | Database migration version           |
| `clients`         | `{ clientId, role, name }[]` | Identified connections               |

### `error` (engine → client)

| Field     | Type            | Notes                                      |
| --------- | --------------- | ------------------------------------------ |
| `code`    | see below       |                                            |
| `message` | string          | Human-readable explanation                 |
| `refSeq`  | integer or null | `seq` of the offending message, when known |

| Code                  | When                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `invalid_json`        | The frame is not JSON                                            |
| `invalid_message`     | The JSON does not match any message schema, or a frame is binary |
| `unsupported_version` | `v` is not `1`. The engine then closes with `4000`.              |
| `stale_message`       | `seq` is not newer than the last accepted one                    |
| `internal_error`      | The engine failed while handling the message                     |

## Close codes

| Code   | Meaning                                 |
| ------ | --------------------------------------- |
| `1001` | The engine is shutting down             |
| `4000` | Unsupported protocol version            |
| `4001` | No `hello` within the handshake timeout |
