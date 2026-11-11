# StageCue: context for AI assistants

Read this first. Then [docs/PRD.md](docs/PRD.md) (what and why), [docs/technical-design.md](docs/technical-design.md) (how, decisions, plans), and [docs/protocol.md](docs/protocol.md) (wire format).

## What StageCue is

A messenger between Ableton Live and ProPresenter 7 for church choirs. The music director marks song sections as **locators** on Ableton's arrangement timeline (`Chorus`, `Chorus | Full choir`, `-` to clear). StageCue follows the playhead and draws a centred band: current section, extra line, next section, bars to go, a pulsing 4·3·2·1 in the last bar, and a full-width progress bar. Inside an Ableton loop it shows where the loop goes back to. ProPresenter shows the band as an **NDI video source with transparency**, layered over the lyrics wherever the media operator puts it.

**StageCue never controls the song, the lyrics, or ProPresenter.** It only carries information. The screen always follows Ableton: nobody steps through sections by hand. When the service goes off script, the playback engineer stops Ableton or plays only the click, and the media team uses **Hide band / Show band**. Keep it simple: the owner explicitly rejected building songs, arrangements, or setlists inside StageCue (that version exists in git history on branch `phase-2/interface`, deliberately removed), and removed director controls from the app (the engine keeps `cue.override` unused, for a possible future director tool).

## Owner and environment

- Owner: Henry Nyator. Church runs entirely on **Apple hardware**; the home MacBook has Ableton Live 12 Suite, Logic Pro, and ProPresenter 7 on one machine. Must support **macOS and Windows**.
- Development happens on both: a Windows 11 PC and the MacBook. Pull before starting.
- **Never add `Co-Authored-By` trailers or “Generated with Claude Code” lines (or any AI attribution) to commits or PR descriptions.**
- Commit or push only when asked. `master` is the current design; `marker-sync` points at the same commit. Start new work on a branch.

## Status (11 November 2026)

| Part                                                                             | State                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine, protocol, cue logic (countdown, progress, pulse, tempo following, loops) | Done, 81 tests                                                                                                                                                                                |
| StageCue app: Live (preview, Hide/Show band, marker list), Style, Setup          | Done, tested with the simulator                                                                                                                                                               |
| Max for Live device (`integrations/ableton/device`)                              | Built; working in Live 12 Suite. The full test plan (technical-design.md §7.2) is not recorded as done                                                                                        |
| Output page: off-screen, transparent, 1920×1080                                  | Done, verified by snapshot (alpha checked pixel by pixel)                                                                                                                                     |
| NDI sending (`apps/desktop/src/main/output/ndi.ts`)                              | Working on Windows: 30 fps, premultiplied alpha, verified with an independent NDI receiver (technical-design.md §6.3). Not yet seen in Studio Monitor or ProPresenter, not yet built on macOS |
| ProPresenter end-to-end                                                          | Not tested                                                                                                                                                                                    |
| Two computers over Wi-Fi                                                         | Not tested                                                                                                                                                                                    |
| Installers, engine started by the app, pairing                                   | Not started                                                                                                                                                                                   |
| Logic Pro                                                                        | Open question (no known way to read marker names)                                                                                                                                             |

## Next steps, in order

1. **NDI on the Mac and in ProPresenter** (technical-design.md §6.4): `pnpm install` with Xcode Command Line Tools (`xcode-select --install`) and NDI Tools for Mac; check the `[output]` log lines; add the source in ProPresenter 7 with **premultiplied** alpha; layer it over lyrics; measure delay against Ableton. If ProPresenter cannot take premultiplied alpha, convert in `ndi.ts` (see §6.4). Python (`cyndilib`) remains the documented fallback only (§6.1).
2. **Finish the device test plan** (technical-design.md §7.2) and record the results there. In particular, **confirm Ableton positions are quarter notes** with a 6/8 song: the countdown depends on it.
3. **End-to-end on one Mac** (Ableton, StageCue, ProPresenter 7), then **two computers over Wi-Fi** with deliberate drops.
4. Then: packaging (§10), pairing (§11), and the Logic decision (§8).

## Commands

| Command                                               | Does                                                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm dev`                                            | Engine (watch mode) and app together                                                            |
| `pnpm simulate [-- --tempo 120]`                      | Pretend Ableton; space, arrows, r, q in its terminal. Stop it when the real device is connected |
| `pnpm --filter @stagecue/ableton build:device`        | Regenerates `StageCue.amxd` from `integrations/ableton/src/build-device.ts`                     |
| `pnpm check`                                          | Typecheck, lint, tests, format check. Must pass before calling work done                        |
| `pnpm build`                                          | Builds the app                                                                                  |
| `STAGECUE_OUTPUT_SNAPSHOT=frame.png pnpm dev:desktop` | Saves one output frame with transparency                                                        |
| `STAGECUE_ENGINE_HOST=127.0.0.1 pnpm dev:engine`      | Engine for this computer only                                                                   |

## Where things are

| Need to change…                                   | Look in                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Countdown, progress, pulse, loops, marker names   | `packages/arrangement/src/cue.ts`, `model.ts` (+ `cue.test.ts`)      |
| Messages, methods, validation                     | `packages/event-protocol/src/messages.ts`, `methods.ts`              |
| Live state, hide band, disconnect behaviour       | `apps/engine/src/live/live-session.ts`                               |
| Server, roles, heartbeat                          | `apps/engine/src/server/engine-server.ts`                            |
| The band's look                                   | `apps/desktop/src/renderer/src/features/display/Band.tsx`            |
| App screens                                       | `apps/desktop/src/renderer/src/features/{live,style,setup}`          |
| Output window and NDI                             | `apps/desktop/src/main/output/`                                      |
| Per-frame playhead in the UI                      | `apps/desktop/src/renderer/src/live/use-cue-view.ts`                 |
| Engine connection, reconnects                     | `apps/desktop/src/renderer/src/engine/engine-connection.ts`          |
| Ableton: reading locators, transport, loop region | `integrations/ableton/device/stagecue-lom.js` (Max `[js]`)           |
| Ableton: talking to the engine, saved address     | `integrations/ableton/device/stagecue-bridge.js` (Node for Max)      |
| The device's layout                               | `integrations/ableton/src/build-device.ts`, then rebuild the `.amxd` |
| Reference bridge for testing                      | `integrations/simulator/src/index.ts`                                |

## Conventions

- TypeScript strict, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` (no enums, no parameter properties). Relative imports in Node packages use `.ts` extensions; the engine runs TypeScript directly.
- Validate everything that crosses a boundary with `zod`, on both ends. Client→engine schemas are strict. New optional fields (like `transport.loop`, `live.state.hidden`) must stay optional or defaulted so older bridges and engines keep working.
- Business logic stays out of React components: pure functions in `packages/arrangement`, tested with Vitest.
- Prettier: no semicolons, single quotes, width 100, LF line endings.
- Device scripts are not TypeScript. `stagecue-lom.js` runs in Max's classic `[js]` object: **ES5 only** (no `let`, `const`, arrow functions), Max globals (`LiveAPI`, `outlet`, `post`, `Task`). `stagecue-bridge.js` is CommonJS for Node for Max (Node 22 in Max 9) and uses the built-in `WebSocket`, so the device needs no npm packages. ESLint and Prettier have overrides for both.
- The `.amxd` loads its scripts from its own folder: keep `StageCue.amxd`, both scripts, and `device/package.json` together.
- The device stores its client id and engine address in `~/.stagecue/ableton-device.json`.
- UI copy: plain, short, written for church volunteers. **No em dashes in any UI text.** Dark interface, one accent colour, Phosphor icons only, no hand-drawn SVG icons (the small StageCue logo mark is the exception).
- Never claim an integration works until it has been run against the real thing (NDI receiver, Ableton, ProPresenter), and record what was tested.
- Each display setting needs a default in `displaySettingsSchema`, so older engines and saved settings stay valid.
- Hide band is engine state, not stored: it resets to shown when the engine restarts.

## Gotchas already hit

- **`ELECTRON_RUN_AS_NODE=1`** in some editor-launched shells makes Electron run as Node (“does not provide an export named BrowserWindow”). Unset it.
- **Two engines on port 7417:** the OS allows one on `127.0.0.1` and another on `0.0.0.0` at once; clients then talk to whichever matches the address. Check `lsof -i :7417` (macOS) or `netstat -ano` (Windows).
- **Simulator and device at once:** both are bridges. The engine follows the first one and ignores the other until the first disconnects or goes silent for 2 s (logged as “Ignoring a second DAW bridge”). Stop the simulator when testing the real device, or the device will be ignored.
- **Leftover simulators:** a simulator started by an earlier AI session can keep running after the session ends. Before testing, list Node processes running `src/index.ts` (`ps aux | grep src/index.ts` on macOS; on Windows, `Get-CimInstance Win32_Process` filtered on the command line) and stop strays. Two of them made the band flicker before the one-bridge rule existed.
- **Measuring smoothness:** don't judge NDI by eye alone. Read the progress bar width from received frames (bottom row, accent colour) and count backward steps and repeats; see technical-design.md §6.2 and §6.3 for what was measured and why the pacing is built the way it is.
- **Stale engine after a schema change:** a long-running engine started before a change sends old data; restart it.
- **Vite cached a half-written file** during a shell rewrite and the app went blank. Touch the file and reload. Prefer editing files in place over truncating and rewriting while `pnpm dev` runs.
- **Sandboxed preloads must be CommonJS** (`out/preload/index.cjs`); already configured.
- **Off-screen windows are clamped to the screen size** unless `enableLargerThanScreen` is set; already set.
- **pnpm 10 blocks install scripts** for dependencies not listed in `pnpm.onlyBuiltDependencies`; native modules such as the NDI binding must be added there.
- **Visual Studio 2026 and node-gyp:** pnpm's bundled node-gyp (11.x) does not recognise VS 2026. The root `package.json` gives the NDI module node-gyp 13 through `pnpm.packageExtensions`; keep it.
- **Visual Studio's “Node.js development” workload** installs Node 14 into `C:\Program Files\nodejs`, replacing Node 24. Never add it; if `node --version` shows 14, remove that workload and reinstall Node 24.
- **NDI frames are premultiplied** (Chromium renders that way). Receivers set to straight alpha show see-through areas too dark.
- **Testing NDI without ProPresenter:** NDI Studio Monitor (NDI Tools), or a script using the module's `find` and `receive`; skip `receive.video()` errors with code `4140` (non-video data arrives first).
