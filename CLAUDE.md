# StageCue: context for AI assistants

Read this first. Then [docs/PRD.md](docs/PRD.md) (what and why), [docs/technical-design.md](docs/technical-design.md) (how, decisions, plans), and [docs/protocol.md](docs/protocol.md) (wire format).

## What StageCue is

A messenger between Ableton Live and ProPresenter 7 for church choirs. The music director marks song sections as **locators** on Ableton's arrangement timeline (`Chorus`, `Chorus | Full choir`, `-` to clear). StageCue follows the playhead and draws a centred band: current section, extra line, next section, bars to go, a pulsing 4·3·2·1 in the last bar, and a full-width progress bar. ProPresenter shows the band as an **NDI video source with transparency**, layered over the lyrics wherever the media operator puts it.

**StageCue never controls the song, the lyrics, or ProPresenter.** It only carries information. Keep it simple: the owner explicitly rejected building songs, arrangements, or setlists inside StageCue (that version exists in git history on branch `phase-2/interface`, deliberately removed).

## Owner and environment

- Owner: Henry Nyator. Church runs entirely on **Apple hardware**; the home MacBook has Ableton Live, Logic Pro, and ProPresenter 7 on one machine. Must support **macOS and Windows**.
- Work so far was done on Windows 11. Development continues on macOS.
- **Never add `Co-Authored-By` trailers or “Generated with Claude Code” lines (or any AI attribution) to commits or PR descriptions.**
- Commit or push only when asked. Work on branches; `master` holds the Phase 1 foundation.

## Status (10 November 2026)

| Part                                                                                | State                                                     |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Engine, protocol, cue logic (countdown, progress, pulse, tempo following, override) | Done, 75 tests                                            |
| StageCue app: Live (preview, director controls, marker list), Style, Setup          | Done, tested with the simulator                           |
| Output page: off-screen, transparent, 1920×1080                                     | Done, verified by snapshot (alpha checked pixel by pixel) |
| NDI sending (`apps/desktop/src/main/output/ndi.ts`)                                 | **Stub. Next.**                                           |
| Max for Live device (`integrations/ableton`)                                        | **Not started. Next.**                                    |
| ProPresenter end-to-end                                                             | Not tested                                                |
| Installers, engine started by the app, pairing                                      | Not started                                               |
| Logic Pro                                                                           | Open question (no known way to read marker names)         |

Branch: `marker-sync` (the current design).

## Next steps on the Mac, in order

1. **Set up:** Node 24+, `corepack enable` (pnpm 10), `pnpm install`, `pnpm check`. Install Xcode Command Line Tools (`xcode-select --install`) and **NDI Tools for Mac** (for NDI Studio Monitor).
2. **Run it:** `pnpm dev` in one terminal, `pnpm simulate` in another. Allow the macOS network prompts.
3. **NDI output:** follow technical-design.md §6.2. Add `@stagetimerio/grandiose` (allow its build in `pnpm.onlyBuiltDependencies`), implement `createNdiSender`, resend the last frame on a timer, report receivers. Verify in NDI Studio Monitor, then ProPresenter 7 (straight vs premultiplied alpha). Python (`cyndilib`) is the documented fallback only; see §6.1 for why it is not the primary path.
4. **Max for Live device:** technical-design.md §7. `[js]` for the Live Object Model (`live_set` `cue_points` name/time, `is_playing`, `tempo`, `signature_*`, `current_song_time`), `[node.script]` for the WebSocket client. Copy the protocol behaviour from `integrations/simulator/src/index.ts`. Test plan in §7.2. **Confirm Ableton positions are quarter notes** (the 6/8 countdown depends on it).
5. End-to-end on the one Mac, then two computers over Wi-Fi with deliberate drops.
6. Then: packaging (§10), pairing (§11), and the Logic decision (§8).

## Commands

| Command                                               | Does                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                            | Engine (watch mode) and app together                                     |
| `pnpm simulate [-- --tempo 120]`                      | Pretend Ableton; space, arrows, r, q in its terminal                     |
| `pnpm check`                                          | Typecheck, lint, tests, format check. Must pass before calling work done |
| `pnpm build`                                          | Builds the app                                                           |
| `STAGECUE_OUTPUT_SNAPSHOT=frame.png pnpm dev:desktop` | Saves one output frame with transparency                                 |
| `STAGECUE_ENGINE_HOST=127.0.0.1 pnpm dev:engine`      | Engine for this computer only                                            |

## Where things are

| Need to change…                            | Look in                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| Countdown, progress, pulse, marker names   | `packages/arrangement/src/cue.ts`, `model.ts` (+ `cue.test.ts`) |
| Messages, methods, validation              | `packages/event-protocol/src/messages.ts`, `methods.ts`         |
| Live state, override, disconnect behaviour | `apps/engine/src/live/live-session.ts`                          |
| Server, roles, heartbeat                   | `apps/engine/src/server/engine-server.ts`                       |
| The band's look                            | `apps/desktop/src/renderer/src/features/display/Band.tsx`       |
| App screens                                | `apps/desktop/src/renderer/src/features/{live,style,setup}`     |
| Output window and NDI                      | `apps/desktop/src/main/output/`                                 |
| Per-frame playhead in the UI               | `apps/desktop/src/renderer/src/live/use-cue-view.ts`            |
| Engine connection, reconnects              | `apps/desktop/src/renderer/src/engine/engine-connection.ts`     |

## Conventions

- TypeScript strict, `exactOptionalPropertyTypes`, `erasableSyntaxOnly` (no enums, no parameter properties). Relative imports in Node packages use `.ts` extensions; the engine runs TypeScript directly.
- Validate everything that crosses a boundary with `zod`, on both ends. Client→engine schemas are strict.
- Business logic stays out of React components: pure functions in `packages/arrangement`, tested with Vitest.
- Prettier: no semicolons, single quotes, width 100, LF line endings.
- UI copy: plain, short, written for church volunteers. **No em dashes in any UI text.** Dark interface, one accent colour, Phosphor icons only, no hand-drawn SVG icons (the small StageCue logo mark is the exception).
- Never claim an integration works until it has been run against the real thing (NDI receiver, Ableton, ProPresenter).
- Each display setting needs a default in `displaySettingsSchema`, so older engines and saved settings stay valid.

## Gotchas already hit

- **`ELECTRON_RUN_AS_NODE=1`** in some editor-launched shells makes Electron run as Node (“does not provide an export named BrowserWindow”). Unset it.
- **Two engines on port 7417:** the OS allows one on `127.0.0.1` and another on `0.0.0.0` at once; clients then talk to whichever matches the address. Check `lsof -i :7417` (macOS) or `netstat -ano` (Windows).
- **Stale engine after a schema change:** a long-running engine started before a change sends old data; restart it.
- **Vite cached a half-written file** during a shell rewrite and the app went blank. Touch the file and reload. Prefer editing files in place over truncating and rewriting while `pnpm dev` runs.
- **Sandboxed preloads must be CommonJS** (`out/preload/index.cjs`); already configured.
- **Off-screen windows are clamped to the screen size** unless `enableLargerThanScreen` is set; already set.
