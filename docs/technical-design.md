# StageCue: Technical Design

Companion to [PRD.md](PRD.md). The wire format is specified in [protocol.md](protocol.md); this document explains how the system works, why it is built this way, and what remains.

## 1. System overview

```text
MUSIC COMPUTER (or the same Mac)          MEDIA COMPUTER
Ableton Live                              StageCue app (Electron)
 └ StageCue.amxd (Max for Live)            ├ main process
    ├ [js] reads locators + playhead        │   ├ starts/stops the output window
    └ [node.script] WebSocket client ───────┼──►│   └ NDI sender (native module)
         role daw_bridge          LAN/Wi-Fi │   ├ app window (React): Live, Style, Setup
                                            │   └ output window (off screen, 1920×1080,
                                            │       transparent): renders the band
                                  engine ◄──┘  (Node.js, today a separate process)
                                   ├ validates messages, keeps LiveSession
                                   ├ broadcasts live.state to every client
                                   └ SQLite: band style, known devices

ProPresenter 7 ──(NDI input "StageCue", same machine)── layered over lyrics
```

Only small JSON messages cross the network. Video is produced on the media computer, so NDI stays on that machine.

## 2. Repository

pnpm workspace, TypeScript everywhere, Node 24+.

| Path                                              | Purpose                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/engine`                                     | WebSocket server, `LiveSession`, SQLite, request dispatcher. Runs TypeScript directly with Node's type stripping.                             |
| `apps/desktop`                                    | Electron app. `src/main` (windows, output, NDI), `src/preload` (minimal bridge), `src/renderer` (React pages `index.html` and `output.html`). |
| `packages/arrangement`                            | Pure domain logic: marker parsing, cue computation, countdown, progress, beat phase, playhead estimation, display settings schema.            |
| `packages/event-protocol`                         | Every message and request as `zod` schemas; `parseClientMessage` / `parseServerMessage`.                                                      |
| `packages/shared-types`                           | Preload bridge and output status types.                                                                                                       |
| `integrations/simulator`                          | Command-line pretend Ableton. Reference implementation of the bridge protocol.                                                                |
| `integrations/ableton`                            | Max for Live device (to build).                                                                                                               |
| `integrations/logic`, `integrations/propresenter` | Placeholders.                                                                                                                                 |

## 3. Core concepts

### 3.1 Units

Positions are **quarter notes from the start of the song**, the unit Ableton uses for song time (`current_song_time`) and locator positions (`CuePoint.time`). Tempo is quarter notes per minute. A time signature's beat is `4 / denominator` quarter notes, so 6/8 counts eighth notes and a bar is three quarter notes. To verify against Ableton when the device exists.

### 3.2 Markers to cues (`packages/arrangement/src/model.ts`)

- `toCues(markers)`: sorts by position; markers at the same position keep the last.
- `parseMarkerName`: text before `|` is the label, after it the detail; `-` or empty is a blank cue that clears the band.

### 3.3 What to show (`computeCueView` in `cue.ts`)

Input: cues, a playhead (beat, playing, time signature), and the mode (`auto` or `manual` with an index). Output `CueView`:

| Field                  | Meaning                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `index`                | last cue at or before the playhead (a marker exactly on the playhead counts as current)            |
| `current`, `next`      | visible cues (blank cues become null)                                                              |
| `countdown.bars`       | whole bars to the next visible cue, rounded up                                                     |
| `countdown.finalBeats` | 4, 3, 2, 1 during the last bar; null before                                                        |
| `beatPhase`            | 0 on each beat rising to 1; drives the pulse                                                       |
| `progress`             | 0 at the current marker to 1 at the next marker of any kind; null when there is nothing to measure |
| `manual`               | true under director control; countdown and progress are then null                                  |

### 3.4 Dead reckoning

The bridge reports the transport about ten times a second. Between reports, `beatAt(transport, elapsedMs)` moves the playhead forward with the tempo. The engine does this when it relays state; each display does it again from the moment it received `live.state`, every animation frame (`useCueView`). Effects:

- the pulse and countdown land on Ableton's beats at Ableton's tempo, not on a local timer;
- network jitter does not cause stutter;
- on disconnect, the engine and clients freeze the transport at the estimated position (`playing: false`), so nothing keeps counting.

Two details matter for smoothness (both measured on the NDI output):

- **One clock.** `useCueView` measures elapsed time with `performance.now()`, the clock `receivedAt` uses. The animation frame's own timestamp runs tens of milliseconds behind it in off-screen windows; mixing the two made the band leap ahead at each report and fall back.
- **No small backward steps.** Each report corrects the estimate slightly, sometimes backwards. `smoothBeat` holds backward corrections under `JITTER_BEATS` (half a beat) until the estimate catches up; seeks and loops are larger and apply at once.

### 3.4a One bridge at a time

The engine follows one DAW bridge. Another bridge that sends while the followed one is active is ignored (logged once per connection). It takes over only when the followed bridge disconnects or has been silent for `BRIDGE_TIMEOUT_MS` (2 s). Following whichever bridge spoke last made the band flicker between two song positions when two were running (a simulator left running beside Ableton, or two laptops).

### 3.5 Hide band and director override (`LiveSession`)

`setHidden` is the media team's switch, held by the engine so every output agrees; it is not stored and resets on restart. Outputs render nothing while hidden; the app's preview shows the band faded.

`override` is unused by the app and kept for a future director tool: `hold` takes manual control at the section on screen; `next`, `previous`, `select` move from there; `auto` returns control. Manual mode persists until `auto`. The engine is the single owner of the mode, so every display agrees.

## 4. Engine (`apps/engine`)

- `server/engine-server.ts`: WebSocket (`ws`), handshake within 5 s, heartbeat pings every 10 s, per-connection sequence numbers, 64 KiB frame limit, `daw.*` messages only from `daw_bridge` clients, `broadcast()`.
- `live/live-session.ts`: markers, last transport plus receive time, bridge identity, mode; `snapshot()` extrapolates to now.
- `rpc/dispatcher.ts`: validates params per method, maps `EngineError` to response codes, hides unexpected errors behind `internal_error`.
- `db/`: `node:sqlite`, migrations in transactions. Tables now: `devices`, `settings`, `schema_migrations` (migration 3 dropped the old library tables).
- Config by environment: `STAGECUE_ENGINE_HOST` (default `0.0.0.0`), `STAGECUE_ENGINE_PORT` (7417), `STAGECUE_DATA_DIR`, `STAGECUE_LOG_LEVEL`.

## 5. Desktop app (`apps/desktop`)

- Two renderer pages built by electron-vite: `index.html` (the app) and `output.html` (the band only, transparent). A page's role comes from `<html data-stagecue-role>`; the output page connects as `display`.
- The app's pages (Live, Style, Setup) share one design, recorded in `apps/desktop/DESIGN.md`. What each Setup box says is a pure function (`features/setup/signal.ts`, tested); bar and beat for any time signature is `features/live/position.ts` (tested). Live and Style fit the window with `MonitorColumns`, which sizes the preview column from the height left and gives the rest of the width to the right column.
- `src/main/output/output.ts` (`OutputController`): opens an off-screen, transparent window at the saved Output size, 1920×1080 (60 fps on macOS, 30 on Windows) or 3840×2160 at 30 (`enableLargerThanScreen` so the OS does not clamp it). The output page reports `outputSize` from the display settings over IPC (`output:size`) and the controller resizes the window; the band is laid out in container units, so it looks the same at both sizes. Paints are passed to the sender as described in §6.2. `STAGECUE_OUTPUT_SNAPSHOT=path.png` saves one frame for testing without NDI.
- `src/main/output/ndi.ts`: the NDI sender (section 6). Loads the native module at runtime, so a missing build reports NDI as unavailable instead of crashing.
- `src/main/ableton-device.ts`: copies the Max for Live device into Live's User Library, or saves a copy for another computer (Setup → Ableton, step 1).
- Security: context isolation, no Node in renderers, sandboxed CommonJS preload, navigation and new windows blocked, all permission requests denied, CSP limits network to WebSocket and the dev server.

## 6. NDI output

### 6.1 Decision: Node native module, compiled once and shipped prebuilt

**Chosen:** [`@stagetimerio/grandiose`](https://github.com/stagetimerio/grandiose) (Apache-2.0, maintained, supports sending BGRA with alpha; Windows x64, macOS x64 and arm64). Its install script downloads the NDI SDK from `downloads.ndi.tv` and compiles with node-gyp.

- macOS build prerequisite: Xcode Command Line Tools (`xcode-select --install`).
- Windows build prerequisite: Visual Studio “Desktop development with C++” (MSVC build tools and a Windows 11 SDK). **Do not add the “Node.js development” workload**: it installs Node 14 over the system Node.
- Visual Studio 2026 needs node-gyp 13 or later; the node-gyp bundled with pnpm 10.22 only knows up to 2022. The root `package.json` supplies it through `pnpm.packageExtensions`, so the install works on a fresh clone.
- End users never compile: CI builds the module per platform and the installer ships the `dist/` folder unpacked from the asar archive.
- pnpm 10 blocks install scripts by default; add the package to `pnpm.onlyBuiltDependencies` in the root `package.json`.

**Considered: Python sidecar** with [`cyndilib`](https://github.com/nocarryr/cyndilib) (prebuilt wheels for macOS and Windows, no compiler). Rejected as the primary path because Electron would have to stream about 250 MB/s of raw frames (1920×1080×4 bytes×30 fps) to another process, and both installers would have to bundle a Python runtime. Keep it as the fallback if the Node module cannot be made to work on a platform. If used, reduce the cost by sending only the band's rows instead of the full frame.

### 6.2 Implementation

Built on the Mac and on the Windows PC separately on 11 November 2026, then merged: the Mac's sender and sizes, with the Windows paint handling.

**Sender (`ndi.ts`)**

- `createNdiSender(name, frameRate)` creates the source with `clockVideo: false` and sends each frame as soon as it is handed over; if a send is in flight, the newest frame goes as soon as it finishes (never a queue). Off-screen `paint` only fires on change, so a timer resends the latest frame whenever none has gone out for a frame's time, keeping the stream continuous.
- 1080p runs at 60 fps on macOS and 30 on Windows (`HD_RATE`); 4K at 30 everywhere (`OUTPUT_DIMENSIONS` in `output.ts`). On the Windows PC the app could not hand NDI more than about 30 frames a second, so aiming for 60 only added load and repeated frames (§6.3). Measured on an M-series MacBook with a receiver on the same machine: a change in the engine reaches the receiver in 19 ms on average (16 to 38 ms), against 31 ms average and 72 ms worst with an earlier 30 fps timer-only sender. The main process uses about 40% of one core while sending at 60 fps.
- **Straight alpha.** Chromium paints premultiplied BGRA; NDI's BGRA is straight alpha, so `unpremultiply` divides out the partly transparent pixels before sending (reading whole pixels as 32-bit words, so fully transparent and opaque pixels cost one compare). Only frames that go out are converted: the band at 85% opacity is half a million partly transparent pixels, about 7 ms a frame here, and converting every painted frame kept the main process too busy to feed NDI (7 fps on Windows). ProPresenter's input stays on its default, straight.
- What StageCue cannot remove (ProPresenter's buffering, the projector or LED processor) is cancelled with the `earlyMs` display setting (Style → ProPresenter output → Show cues early): the output page runs its playhead that many milliseconds ahead while playing. Previews and TVs stay exact.
- `node-gyp` is a root dev dependency so the module's install script can compile it under pnpm.

**Paint handling (`output.ts`)**, from what was measured on Windows (§6.3):

- On Windows, Chromium delivered only about half the paints asked for (14 a second when asked for 30), so the window paints at twice the send rate there (`PAINT_FACTOR` 2); on macOS paints arrived at the rate asked for (`PAINT_FACTOR` 1).
- Only paints that are sent are copied (`toBitmap`, about 4 ms for 8 MB at 1080p). Copying every paint churned enough memory to stall the main process.
- A paint's image must be copied **inside its paint event**: Electron reuses its memory, and a late copy mixes frames (seen as the progress bar jumping backwards).
- A paint that arrives too soon after the last send only marks the picture as changed; if no later paint comes in time, `webContents.invalidate()` asks for a fresh one, so the last picture is never stale.
- The playhead is estimated with `performance.now()` against the time each report arrived, the same clock on both sides; an animation frame's timestamp runs tens of milliseconds behind it in an off-screen window. Small backward corrections are smoothed (`smoothBeat`).
- `STAGECUE_OUTPUT_STATS=1` logs paints per second, frames copied per second, and copy time, every 5 seconds. The main process logs `[output] First frame rendered` once.
- `OutputController` polls `connections()` every second and reports receivers (“On air” on Setup's ProPresenter box, counted in the header's Outputs).

### 6.3 Verified so far

All with an independent NDI receiver (the same library's `find` and `receive`, as ProPresenter or Studio Monitor would connect), choosing the source by computer name.

**macOS (MacBook, M-series), 11 November 2026, before the merge:** 1920×1080 BGRA, transparent outside the band, correct colours and soft edges; a change in the engine reaches the receiver in 19 ms on average at 60 fps. Bonjour discovery and ProPresenter not yet checked.

**Windows 11 (PSL-GFRIMPONG-NB), 11 November 2026, merged code (1080p at 30 fps, straight alpha, simulator at 96 BPM):**

| Check        | Result                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Discovery    | Source listed as `PSL-GFRIMPONG-NB (StageCue)`                                                                              |
| Format       | 1920×1080, FourCC BGRA                                                                                                      |
| Transparency | Outside the band alpha 0; band at the style's opacity (85% → 217); progress bar opaque                                      |
| Alpha type   | **Straight**: the band's #0B0E1E at 85% arrives as (B 32, G 14, R 12, A 217); premultiplied would be about (25, 12, 9)      |
| Rate         | About 28 frames/s sent, 16 to 22 ms per send; receiver got 240 frames in 8.6 s (a first run, still warming up, took 12.2 s) |
| Smoothness   | Progress bar over 240 frames: no backward steps, no dropouts, 4 to 9 repeated frames                                        |

What the merge measurements showed on Windows, in order:

1. The Mac's sender as merged, 1080p at 60 fps, converting every painted frame: **about 7 frames/s** reached NDI, at 140 to 160 ms per send. A standalone sender sends the same frame in about 6 ms, so the time was spent waiting for a busy main process.
2. Converting only frames that go out: about 30 frames/s, but 34 repeated frames in 240, and the app still copied about 46 frames a second it could not send.
3. 1080p at 30 fps on Windows (the setting kept): as in the table above, matching this PC before the merge (30.1 fps, at most 7 repeats, premultiplied then).

### 6.4 Still to verify

1. **ProPresenter 7** on the Mac and on Windows: add the input with alpha on its default (straight), check the see-through areas, layer it over lyrics, measure the delay against Ableton, and try Show cues early.
2. **NDI Studio Monitor**: visually, on both computers.
3. **4K on Windows**: rate and smoothness with the receiver script.
4. CPU use with the app running for a whole service.

## 6b. Screen output (no ProPresenter)

For setups with only a TV or digital screen, StageCue shows a full-screen cue instead of a band over lyrics.

- **Page:** `apps/screen`, a Vite + React page built to `dist/`. It connects to `ws://<the host that served it>` as role `display` (name from `?name=`, default “Screen”; client id in `localStorage`), loads the style with `settings.getDisplay`, and reloads it on `data.changed`. Hidden band: black. Engine unreachable: “Reconnecting to StageCue…”; Ableton not connected: “Waiting for Ableton”, both small and dim in a corner. The pointer hides after 3 s; a first click asks for browser full screen (browsers require a gesture).
- **Layout:** `FullScreenCue` (`packages/display-ui`) sizes everything in `cqmin`, so it reads the same in landscape, portrait, or a preview, and fits long names to the width. Solid background; `position` and `backgroundOpacity` apply only to the band.
- **Serving:** the engine's WebSocket server is attached to a Node `http` server on the same port; `server/static-files.ts` serves the page: GET and HEAD only, files inside the page folder only (encoded `..` and null bytes refused), `nosniff`, `no-cache` for HTML and long caching for hashed assets, and a 503 with the build command if the page is not built. The WebSocket server is created only after the port is bound; created earlier, it rethrows a failed listen as an unhandled error.
- **Attached screens:** `ScreenOutputs` (`apps/desktop/src/main/screens.ts`) lists displays, opens a frameless full-screen window on the chosen one loading the engine's page with `?embedded=1`, keeps it on that origin, closes it on Esc or when the display is removed, and closes all of them with the main window. IPC arguments are checked in the main process.
- **Shared code:** `packages/engine-client` (the connection, moved from the app) and `packages/display-ui` (`Band`, `FullScreenCue`, `useCueView`) are used by both the app and the screen page. Tailwind in each app scans `packages/display-ui/src` with `@source`.

Verified (Windows 11, 11 November 2026): the page loads from the engine in headless Edge at 1920×1080 and 1080×1920, connects as a display, follows the simulator, and shows the countdown; path traversal returns 404. Not yet tested: a real TV or smart TV browser, an attached second screen, AirPlay.

## 7. Ableton device (`integrations/ableton`)

### 7.1 Design

A Max for Live **MIDI or Audio Effect** device placed on any track (the master is fine).

```text
[live.thisdevice] ─► [js stagecue-lom.js] ── messages ──► [node.script stagecue-bridge.js]
                     (Live Object Model)                   (WebSocket client, Node for Max)
[live.text host field] ─────────────────────────────────────► host:port setting
[status display] ◄────────────────────────────────────────── connected / retrying
```

- **Why two scripts:** only Max's `[js]` (or `[v8]`) object can use the Live Object Model; only `[node.script]` can open WebSocket connections. Network I/O never runs on Live's audio thread (engineering rule 8).
- **`stagecue-lom.js`** uses `LiveAPI` on `live_set`:
  - read `cue_points`; for each, `name` and `time`; observe the list and each point's `name` and `time`, and send the full list on any change (`daw.markers`);
  - observe `is_playing`, `tempo`, `signature_numerator`, `signature_denominator`, and `current_song_time`;
  - send `daw.transport` immediately on play, stop, tempo or signature change, or a jump (position change that does not match elapsed time at the tempo), and every 50 ms while playing.
- **`stagecue-bridge.js`** (Node for Max): connects to `ws://<host>:7417`, says `hello` with role `daw_bridge` and a stable `clientId`, keeps the sequence number, reconnects with backoff, and replays the last markers and transport after reconnecting. Mirror `integrations/simulator/src/index.ts`, which already does exactly this.
- **Project name:** the Live Object Model does not expose the set's file name reliably; leave `project` null or add a text field on the device.
- **Polling:** `current_song_time` is read every 50 ms; play, stop, tempo, signature and loop changes are observed and sent at once.
- **Recovering:** the bridge runs a watchdog every 2 s. It retries if the retry loop ever stopped or a connection attempt hangs for 4 s, and, while connected but missing markers or transport, sends `refresh` to the `[js]` side, which starts itself if it is idle (Max reloads `[js]` when its file changes, and `[live.thisdevice]` only bangs on device load).
- **Panel:** 300 × 169, laid out by `build-device.ts`: a status light (green connected, amber connecting, red needs attention) and message, the section under the playhead with playing or stopped, the locator count, and the address field. The bridge sends `light`, `section`, `playstate` and `locators` alongside `status`.
- **Distribution:** the device is four files that must stay together (`StageCue.amxd`, the two scripts, `package.json`). The app's Setup page copies them into Live's User Library (`Presets/Audio Effects/Max Audio Effect/StageCue`), found from the newest `Library.cfg` in Live's preferences (`apps/desktop/src/main/ableton-device.ts`), or saves the folder anywhere for a music computer without StageCue. Packaging must ship the device folder as `resources/ableton-device`. **Installers** (`integrations/ableton/installer`, `pnpm --filter @stagecue/ableton build:installers`, output in `integrations/ableton/release/`):
  - macOS `.pkg`: a scripts-only package (`pkgbuild --nopayload`) wrapped by `productbuild` with welcome and finish pages. The device files ride beside `postinstall`, which runs as root, finds the person at the screen (`stat -f%Su /dev/console`), reads the User Library from their newest `Library.cfg` (default `~/Music/Ableton/User Library`), and copies the files there as that person (`sudo -u`), so they own them. Unsigned until a Developer ID Installer certificate exists (`STAGECUE_INSTALLER_IDENTITY` signs it). Tested 12 November 2026: contents checked with `pkgutil --expand`; `postinstall` run against a fake home with two Live versions (newest wins, `&amp;` and spaces handled) and with no Live preferences (default used). Not yet installed through Installer.app on a second Mac.
  - Windows `.exe`: NSIS 3 (`installer/windows/StageCue-Ableton.nsi`), per-user, no administrator rights. `find-library.ps1` reads the newest `%APPDATA%\Ableton\Live *\Preferences\Library.cfg` and the installer starts in that User Library (default `Documents\Ableton\User Library`); the folder can be changed on the directory page. Registers an uninstaller under HKCU, kept in `%LOCALAPPDATA%\StageCue` so Live's browser never lists it. Built on macOS with Homebrew's `makensis`; **not yet run on Windows**.
  - Freezing the `.amxd` (scripts embedded) remains an option; the bridge uses Node's built-in `WebSocket`, so it has no npm dependencies to freeze.

### 7.2 Test plan in Ableton

Play, stop, play from another point, loop a region, change tempo while playing, tempo automation, 6/8 and 3/4 songs, add/rename/move/delete a locator while playing, close and reopen the set, quit Ableton, Wi-Fi off and on.

## 8. Logic Pro (open)

Logic is installed on the target Mac, but there is no confirmed way for a plugin or Scripter to read marker names. Options, to evaluate after Ableton works:

1. **MIDI Clock + Song Position Pointer** from Logic into StageCue, with markers exported from Logic (or typed into StageCue) and matched by position.
2. **A StageCue AU plugin** (JUCE) that reads the host playhead and holds its own section grid. Works in any DAW but means drawing the arrangement twice.
3. **Logic's Control Surface / OSC** support: investigate whether marker data is reachable.

## 9. Cross-platform

| Concern            | macOS                                                                                                                                                                                                 | Windows                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| NDI module build   | Xcode Command Line Tools                                                                                                                                                                              | Visual Studio C++ workload                                |
| Network prompt     | Firewall “accept incoming connections”; **Local Network** privacy prompt on macOS 15+ (add `NSLocalNetworkUsageDescription`; NDI discovery uses Bonjour, so add `NSBonjourServices` with `_ndi._tcp`) | Windows Firewall prompt for Node/StageCue on first listen |
| Installer          | `.dmg`, signed and notarised (Apple Developer account) or Gatekeeper blocks it                                                                                                                        | NSIS `.exe`; unsigned builds show SmartScreen warnings    |
| Same-machine setup | Ableton, StageCue, and ProPresenter on one Mac: engine on `127.0.0.1` is enough                                                                                                                       | Same                                                      |

Code is platform-neutral today (Electron, Node, `node:sqlite`, `ws`). The dev environment quirk `ELECTRON_RUN_AS_NODE` (set by some VS Code processes) is documented in the README.

## 10. Packaging (milestone 6)

- electron-builder for `.dmg` (arm64 and x64, or universal) and Windows NSIS.
- The engine must start with the app. Bundle it to a single JavaScript file (esbuild) and run it with `utilityProcess.fork` from the main process, passing `STAGECUE_DATA_DIR` = `app.getPath('userData')`. Keep the standalone engine for headless use.
- Ship the NDI module's `dist/` unpacked (`asarUnpack`). Include the NDI licence and trademark notice the SDK licence requires.
- Ship the frozen `.amxd` alongside, or as a separate download.

### 10.1 Update notice

The installed app checks GitHub's latest release of `UPDATE_REPOSITORY` (`apps/desktop/src/main/updates.ts`) 10 s after starting and every 6 hours. If its version is newer, Setup shows a banner with **Download** (the `.dmg` for this Mac's chip, or the Windows `.exe`, never the `StageCue-Ableton-…` device installers) and **What's new** (the release page). It only tells: the volunteer installs by dragging into Applications. Links are opened only if they are `https://github.com/…`. Drafts and pre-releases are ignored; offline or errors are silent.

- Needs the releases to be readable without signing in: while the repository is private, GitHub answers 404 and the banner never appears.
- Tested 19 November 2026: unit tests for versions, asset choice, parsing and links; the dev app pointed at a public repository (`STAGECUE_UPDATE_REPO`, development only) showed the banner on Setup with the right versions.
- Self-installing updates (electron-updater) need the app signed with a Developer ID: macOS refuses to replace an unsigned app.

## 11. Reliability and security

- Every inbound message is validated with `zod`; client→engine schemas are strict. Stale sequence numbers are rejected. Handlers cannot crash the server.
- Heartbeats terminate dead peers (sleeping laptops, dropped Wi-Fi). Clients reconnect with capped backoff.
- **One bridge, decided by connection, not by sound.** StageCue follows the first bridge that speaks for as long as it stays connected, and keeps each bridge's last markers and position. When the followed one disconnects, it switches to another still-connected bridge with that bridge's own data. Before 11 November 2026 a bridge that was quiet for 2 s could be replaced; a stopped Ableton sends nothing, so a second device could take over the screen (found in testing, below).
- **Gap:** no authentication. Anyone on the LAN can change or hide the style, read the device list, and act as the bridge while no real one is connected. Any web page open on the network can connect too (no Origin check), and there is no limit on connections. Add a pairing code (shown in the app, entered in the device and the TV page) before production on a shared network.

### 11.1 Tested end to end (11 November 2026)

Ableton 12 with the device on a MacBook, the engine and app on a Windows PC, over an iPhone hotspot. Probes ran from the network side (the LAN address), as another device on the Wi-Fi would.

| Area                                         | Result                                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Link while playing                           | 20 updates/s (the device's 50 ms rate); longest gap 218 ms without other traffic                                                                                                              |
| Wi-Fi off on the Mac, then on                | Heartbeat ended the dead connection within about 20 s; the band held the section; the device reconnected on its own, resent its 9 markers, and the playhead jumped to Ableton's real position |
| NDI to the Mac across the hotspot            | Received; about 16 Mbit/s. While it ran, update gaps of 0.3 to 0.6 s appeared: the reason StageCue should run on the ProPresenter computer                                                    |
| TV page in Safari on the Mac                 | Blank at first: `crypto.randomUUID` is missing on plain-http pages. Fixed with `randomId()` (engine-client); then joined and followed                                                         |
| Fake second bridge while Ableton was stopped | Took over the screen before the fix; ignored after it                                                                                                                                         |
| Bad input                                    | Malformed JSON, binary, unknown types, invalid hello, a future protocol version, a 70 KB message, and a silent connection were all refused or closed                                          |
| Load                                         | 200 connections at once and a burst of 2000 requests: engine stayed responsive                                                                                                                |
| TV page server                               | 11 path tricks (encoded `..`, backslashes, double encoding, null byte, drive letters, 8000-character paths) all 404; every method other than GET and HEAD is 405                              |
| App's attached-screen window                 | Its navigation check compared address prefixes, so `http://engine:7417@elsewhere/` passed; now compares origins                                                                               |

Also found on the test PC, outside StageCue: MariaDB allowed through the firewall on Public networks.

## 12. Testing

- `pnpm test`: cue logic (countdown, progress, 6/8, tempo following, blank markers, manual mode), protocol parsing, engine server (handshake, roles, heartbeat, stale messages, broadcasts), live session, migrations, settings defaults.
- `pnpm simulate`: end-to-end without Ableton.
- `STAGECUE_OUTPUT_SNAPSHOT`: verifies the output frame and its alpha without NDI.
- Manual: section 7.2 in Ableton, section 6.2 step 5 in ProPresenter.

## 13. Decision log

| Decision                                          | Reason                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| DAW markers are the arrangement                   | No second editor to keep in sync; the music director already works there                 |
| StageCue never controls anything                  | Trust and safety in a live service                                                       |
| Render on the media computer, send data not video | Wi-Fi cannot carry NDI reliably; data is tiny                                            |
| Dead reckoning on every display                   | Smooth, beat-accurate countdown regardless of network jitter                             |
| Separate engine process                           | Survives UI reloads; testable without Electron; can run headless                         |
| `node:sqlite`                                     | No native rebuild for Electron                                                           |
| Full 1920×1080 transparent frame                  | Operator can drop it in as a full-screen layer; scale and crop in ProPresenter if wanted |
| NDI through a Node module, not Python             | Avoids streaming frames between processes and bundling Python (section 6.1)              |
| Every display setting has a default               | An older engine or older saved settings still validate after new options are added       |
