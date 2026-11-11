# Architecture

StageCue is a messenger. The arrangement lives in Ableton as locators on the arrangement grid. StageCue reads where the song is and puts “now, next, and how long until next” on the screen. It never changes playback, lyrics, or slides.

```text
MUSIC COMPUTER                          MEDIA COMPUTER
Ableton Live                            ┌─────────────────────────────────────────┐
 └ Max for Live device ── WebSocket ──► │ engine: live state, hide/show band      │
   (role daw_bridge)      Wi-Fi or LAN  │   │ live.state                          │
                                        │   ├──► StageCue app (preview, controls) │
                                        │   └──► output page, off screen          │
                                        │          └ 1920×1080 frames ──► NDI     │
                                        └─────────────────────────────────────────┘
                                          ProPresenter 7 takes the NDI source as an
                                          input and layers it over the lyrics.
```

## Why only data crosses the network

Video over Wi-Fi is unreliable. Ableton sends a few hundred bytes: the locators once, then the playhead ten times a second. The band is drawn on the media computer, next to ProPresenter, so NDI never leaves that machine.

Between reports, every display moves the playhead forward with the tempo (dead reckoning, `beatAt` in `packages/arrangement`). The countdown and the pulse stay smooth even when packets arrive late or bunched. When Ableton or the engine disconnects, displays stop the clock and keep the last section on screen instead of counting on into the next one.

## Engine (`apps/engine`)

A standalone Node.js process. It:

- accepts WebSocket clients, validates every message, and rejects stale ones;
- takes `daw.markers` and `daw.transport` only from connections that identified as `daw_bridge`;
- keeps the live state in `LiveSession`: markers, the last transport report, and whether the media team has hidden the band;
- broadcasts `live.state` to every client on each change;
- stores the band style and the list of devices that have connected, in SQLite.

It listens on all interfaces by default because the Ableton device connects from another computer. It reports its network addresses so the app can tell you what to type into the device.

## StageCue app (`apps/desktop`)

Electron with a React renderer, built by Vite, styled with Tailwind CSS.

- **Live**: preview of the band, Hide band / Show band, and the locator list with the current section highlighted.
- **Style**: colours, opacity, size, position, and which parts of the band to show. Saved in the engine, so every computer uses the same style.
- **Setup**: how to connect Ableton and ProPresenter, the engine address, and devices.

The main process also opens a hidden, off-screen, transparent 1920×1080 window that loads `output.html`. That page connects to the engine as a `display` client and renders only the band. Each painted frame (BGRA with alpha) goes to the NDI sender in `src/main/output`.

Security: context isolation on, Node integration off, sandboxed preload (built as CommonJS), navigation and new windows blocked, every permission request denied. The preload exposes only the computer name and the output status.

## NDI

NDI sending needs the NDI SDK through a native Node module (`@stagetimerio/grandiose`), compiled on the machine with the Visual Studio C++ build tools. Until that is installed and tested, `src/main/output/ndi.ts` reports NDI as unavailable, and the app says so. The rest of the output pipeline is in place and verified with `STAGECUE_OUTPUT_SNAPSHOT`.

## Packages

- `packages/arrangement`: marker names (`Chorus | Full choir`), the countdown (bars, then the final beats), the beat phase for the pulse, playhead estimation, and the band style schema. Pure TypeScript with tests.
- `packages/event-protocol`: every message and request, as `zod` schemas. See [protocol.md](protocol.md).
- `packages/shared-types`: the preload bridge and output status types.

## Integrations

- `integrations/simulator`: a command-line pretend Ableton. It speaks exactly the protocol the Max for Live device will, so it is also the reference implementation.
- `integrations/ableton`: the Max for Live device (next).

## Units

Positions are in quarter notes from the start of the song, which is how Ableton reports song time and locator positions. Tempo is quarter notes per minute. In 6/8, a bar is three quarter notes and the countdown counts eighth notes. This will be confirmed with the real device.
