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
| `addresses`       | string[]                     | Where other computers can reach it   |
| `port`            | integer                      | The engine's port                    |
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

### `request` (client → engine)

| Field       | Type                    | Notes                                     |
| ----------- | ----------------------- | ----------------------------------------- |
| `requestId` | string, 1–64 characters | Chosen by the client, echoed in the reply |
| `method`    | a method name           | See the table below                       |
| `params`    | object                  | Validated against the method's schema     |

The engine answers every request with exactly one `response`. Requests fail with `handshake_required` until the connection has said `hello`.

### `response` (engine → client)

Either `{ requestId, ok: true, result }` or `{ requestId, ok: false, error: { code, message } }`. The message is written for people and can be shown as is. Clients validate `result` against the method's result schema.

| Code                 | When                                                   |
| -------------------- | ------------------------------------------------------ |
| `handshake_required` | The connection has not said `hello`                    |
| `invalid_params`     | The params do not match the method's schema            |
| `conflict`           | The request cannot apply now, such as no markers yet   |
| `internal_error`     | Anything unexpected. Details go to the engine log only |

### Methods

| Method                 | Purpose                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `settings.getDisplay`  | The band style                                                                                            |
| `settings.saveDisplay` | Saves the band style; every client then receives `data.changed`                                           |
| `devices.list`         | Every computer that has connected                                                                         |
| `display.setHidden`    | `{ hidden }`: takes the band off the output, or puts it back. Every client receives a `live.state`        |
| `cue.override`         | Director control: `auto`, `hold`, `next`, `previous`, or `select` with an `index` into the sorted markers |

`display.setHidden` is the media team's switch: outputs draw nothing while `hidden` is true, whatever Ableton does. It resets to shown when the engine restarts.

`cue.override` is not used by the StageCue app (the screen follows Ableton). It remains for a future director tool: `hold` freezes the section on screen; `next`, `previous`, and `select` move from it; the display stays under manual control until `auto`. The result is the new mode; every client also receives a `live.state`.

### `data.changed` (engine → client)

`{ method }`, sent to every identified client after a request changed stored data. Clients reload what they show.

## Ableton bridge

A bridge says `hello` with `role: "daw_bridge"`, then sends these. The engine rejects them from any other role with `invalid_message`. The simulator in `integrations/simulator` is a working example.

Positions are in quarter notes from the start of the song (Ableton song time). Tempo is quarter notes per minute.

### `daw.markers` (bridge → engine)

Send on connect, and again whenever locators are added, moved, or renamed.

| Field     | Type                       | Notes                                   |
| --------- | -------------------------- | --------------------------------------- |
| `project` | string or null, ≤ 200      | The Live set name, shown to operators   |
| `markers` | `{ name, beat }[]`, ≤ 1000 | Every locator, in any order; `beat` ≥ 0 |

Names: the text before `|` is the section; the text after it is the extra line. A name of `-` (or empty) clears the band from that point.

### `daw.transport` (bridge → engine)

Send on play, stop, seek, tempo or time signature change, and about ten times a second while playing.

| Field           | Type                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `playing`       | boolean                                                              |
| `beat`          | number, the playhead                                                 |
| `tempo`         | number, 10–999                                                       |
| `timeSignature` | `{ numerator: 1–32, denominator: 1, 2, 4, 8, 16, or 32 }`            |
| `loop`          | `{ start, end }` while Ableton's loop is on; null or absent when off |

Inside an active loop (the playhead before `end`), the engine and displays wrap the estimated playhead back to `start` at `end`, and show the section the loop returns to as next. The engine does not need a steady stream to stay accurate: between reports, it and every display move the playhead forward with the tempo. When the bridge disconnects, the engine stops the clock at the estimated position.

### `live.state` (engine → client)

Sent right after `welcome`, then on every change.

| Field       | Type                                                             |
| ----------- | ---------------------------------------------------------------- |
| `daw`       | `{ connected, name, project }`                                   |
| `markers`   | as last received                                                 |
| `transport` | as last received, with `beat` moved forward to `sentAt`; or null |
| `mode`      | `{ mode: "auto" }` or `{ mode: "manual", index }`                |
| `hidden`    | boolean; true while the media team has hidden the band           |

Displays compute the cue themselves (`computeCueView` in `packages/arrangement`), moving `beat` forward from the moment they received the message.

## Close codes

| Code   | Meaning                                 |
| ------ | --------------------------------------- |
| `1001` | The engine is shutting down             |
| `4000` | Unsupported protocol version            |
| `4001` | No `hello` within the handshake timeout |
