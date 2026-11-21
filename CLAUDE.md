# StageCue: context for AI assistants

Read this first. Then [docs/PRD.md](docs/PRD.md) (what and why), [docs/technical-design.md](docs/technical-design.md) (how, decisions, plans), and [docs/protocol.md](docs/protocol.md) (wire format).

## What StageCue is

A messenger between Ableton Live and ProPresenter 7 for church choirs. The music director marks song sections as **locators** on Ableton's arrangement timeline (`Chorus`, `Chorus | Full choir`, `-` to clear). StageCue follows the playhead and draws a centred band: current section, extra line, next section, bars to go, a pulsing 4·3·2·1 into each change (across the last 2 bars, a number every 2 beats, by default; or on each beat of the last bar), and a full-width progress bar. Inside an Ableton loop it shows where the loop goes back to. ProPresenter shows the band as an **NDI video source with transparency**, layered over the lyrics wherever the media operator puts it.

**StageCue never controls the song, the lyrics, or ProPresenter.** It only carries information. The screen always follows Ableton: nobody steps through sections by hand. When the service goes off script, the playback engineer stops Ableton or plays only the click, and the media team uses **Hide band / Show band**. Keep it simple: the owner explicitly rejected building songs, arrangements, or setlists inside StageCue (that version exists in git history on branch `phase-2/interface`, deliberately removed), and removed director controls from the app (the engine keeps `cue.override` unused, for a possible future director tool).

## Owner and environment

- Owner: Henry Nyator. Church runs entirely on **Apple hardware**; the home MacBook has Ableton Live 12 Suite, Logic Pro, and ProPresenter 7 on one machine. Must support **macOS and Windows**.
- Development happens on both: a Windows 11 PC and the MacBook. Pull before starting.
- **Never add `Co-Authored-By` trailers or “Generated with Claude Code” lines (or any AI attribution) to commits or PR descriptions.**
- Commit or push only when asked. `master` is the current design and includes the TV output and the app redesign (`screen-output` was merged into it on 11 November 2026). Start new work on a branch. Work on both computers: pull before starting, push when done, so `master` does not split again (it did once: the Mac and the PC each committed NDI work on the same parent).

## Start here: when the owner says "check it"

The owner works on two computers and picks up wherever they are. When asked to check the project:

1. **Sync and verify:** `git status`, `git pull`, `pnpm install`, `pnpm check`. Report in plain words whether this computer is up to date with GitHub and whether everything passes. Never leave uncommitted work from the other computer behind: if `git status` shows changes you did not make, ask before touching them.
2. **Say where things stand** from the Status table below, in a few lines.
3. **Do the first item in "Next steps" that this computer can do**, then update this file (Status, Next steps) so the next session starts from the truth. Ask before anything outward-facing (pushing, publishing a release, the website).

Which computer can do what:

| MacBook                                                                                        | Windows PC                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Ableton Live 12 Suite, Max 9, ProPresenter 7, Logic. Device work, ProPresenter tests, Mac app  | Windows app (`pnpm package:win`), the device's `.exe` installer, NDI on Windows |
| Ableton device installers (`build:installers` makes both `.pkg` and `.exe`; NSIS via Homebrew) | Second computer for real Wi-Fi tests with the Mac                               |

## Status (21 November 2026, version 0.1.4)

| Part                              | State                                                                                                                                                                                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine, protocol, cue logic       | Done, 164 tests (`pnpm check`)                                                                                                                                                                                                                                               |
| The band                          | Current section always; NEXT from 8 bars before a change (Style: 4, 8, 16, Always); 4, 3, 2, 1 across the last 2 bars, a number every 2 beats (Style: Last bar or Last 2 bars); progress bar 300% thick by default (Style: 150% to 600%). apps/desktop/DESIGN.md, "The band" |
| StageCue app (Live, Style, Setup) | Done; polished 21 November (sentence-case labels). Setup shows an update banner when a newer release is out (technical-design.md §10.1)                                                                                                                                      |
| Mac app                           | `.dmg`, Apple silicon only, starts its own engine, NDI and TV page built in. Unsigned: first launch needs System Settings › Privacy & Security › Open Anyway                                                                                                                 |
| Windows app                       | `StageCue-Setup-0.1.0.exe` was built on the PC and works (owner, 20 November); it is a draft release on the website, older than the timing changes. **0.1.4 not built for Windows yet**                                                                                      |
| Ableton device (0.1.1)            | Works in Live 12 Suite; finds StageCue on the network by itself (UDP 7418); status panel; reconnect watchdog. Installers: `.pkg` (contents and install script tested on the Mac, not yet through Installer.app on another Mac) and `.exe` (**not yet run on Windows**)       |
| NDI to ProPresenter               | Band shows in ProPresenter 7 on the MacBook (owner's screenshot, 21 November). Delay against Ableton not measured yet                                                                                                                                                        |
| Lag over Wi-Fi                    | Fixed and measured with `pnpm netlab` (technical-design.md §11.2): worst case 1 s before, 15 ms after; dropouts no longer freeze the band. Not yet repeated on a real two-computer network                                                                                   |
| TV or screen without ProPresenter | Built; tested in headless Edge and Safari on a Mac. Not yet on a real TV or AirPlay                                                                                                                                                                                          |
| Releases and website              | Public repo **nyator/stagecue-site**: the website (https://nyator.github.io/stagecue-site/, Next.js, deploys on push to `main`) and the installers in its Releases. The app's update check reads that repo. The code stays private in nyator/stageCue                        |
| Pairing, code signing             | Not started                                                                                                                                                                                                                                                                  |
| Logic Pro                         | Open question (no known way to read marker names)                                                                                                                                                                                                                            |

**Decided by the owner:** the media team installs an app and never runs code; StageCue runs on the ProPresenter computer and Ableton on the stage computer with only the device; the band shows little most of the time (singers' feedback), but the count must come early enough to get ready; downloads live on the website, the code stays private.

## Releasing a version

How 0.1.2 to 0.1.4 were released. Ask the owner before publishing.

1. Bump `apps/desktop/package.json` (and `integrations/ableton/package.json` if the device changed). `pnpm check`, merge to `master`, tag `vX.Y.Z`, push both.
2. **Mac app:** `unset ELECTRON_RUN_AS_NODE; pnpm build`, then in `apps/desktop`: `npx electron-builder --mac --arm64 -c.directories.output=release/X.Y.Z`. Use a versioned folder: the owner may be running StageCue from `release/mac-arm64`.
3. **Device installers** (only if the device changed): `pnpm --filter @stagecue/ableton build:installers`.
4. **Windows app:** on the PC, `pnpm package:win`.
5. **Publish** on nyator/stagecue-site: `gh release create vX.Y.Z --repo nyator/stagecue-site --target main --draft` with the small files; upload the 140 MB `.dmg` with `curl` to `uploads.github.com/repos/nyator/stagecue-site/releases/<id>/assets?name=…` (`gh release upload` stalled on it and cannot find drafts by tag); then publish with `gh api -X PATCH …/releases/<id> -F draft=false -f make_latest=true`. Check downloads work without signing in.
6. **File names matter:** the app's update check and the website's Download page pick the app as the `.dmg` (`arm64` in the name for Apple silicon) or `.exe` without "Ableton" in the name, and the device as `StageCue-Ableton-<version>.pkg` / `.exe`.
7. **If the band changed:** the website keeps copies of `packages/display-ui/src/{Band.tsx,timing.ts}` and `packages/arrangement/src/{cue.ts,model.ts}` in its `src/app-ui` (only import paths differ). Copy them, `npm run check && npm run build`, push `main`.
8. Release notes and commits: plain words for volunteers, and no AI attribution.

## Next steps, in order

1. **Windows PC:** `pnpm package:win` for 0.1.4, install it, check NDI, the engine and the update banner, then add the `.exe` to the v0.1.4 release on nyator/stagecue-site and delete the old "StageCue 0.1.0" draft there. Run `StageCue-Ableton-0.1.1.exe` (from the release) and check it finds the User Library.
2. **Real Wi-Fi test:** Mac with Ableton plus the PC (or the TV page on a phone), with deliberate Wi-Fi drops; compare with technical-design.md §11.2.
3. **ProPresenter delay:** measure the band against Ableton's audio and set Style › Show cues early.
4. **Sunday trial at church:** StageCue on the ProPresenter computer, README checklist at soundcheck, Hide band as the fallback; record what happened in technical-design.md.
5. **Open question for the owner:** NEXT shows 8 bars before a change, so in an 8-bar section it shows the whole time. Since the 4, 3, 2, 1 now starts 2 bars early, 4 bars may be the better default. Ask before changing.
6. **Device test plan** (technical-design.md §7.2), in particular confirm Ableton positions are quarter notes with a 6/8 song.
7. **Code signing** (Apple Developer ID, $99 a year): removes "Open Anyway" and allows updates that install themselves.
8. **Pairing** (technical-design.md §11): refuse WebSocket connections from other websites (Origin check), cap connections per address.
9. Later: a single-file device (Max's Freeze), Intel Mac build, the Logic decision (§8).

## Commands

| Command                                               | Does                                                                                                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                            | Engine (watch mode) and app together                                                                                                                           |
| `pnpm simulate [-- --tempo 120]`                      | Pretend Ableton; space, arrows, r, q in its terminal. Stop it when the real device is connected                                                                |
| `pnpm netlab [--only "Busy Wi-Fi"]`                   | Plays poor Wi-Fi between the device, the engine and a screen, and measures the lag (technical-design.md §11.2). Run it after touching timing or the connection |
| `pnpm --filter @stagecue/ableton build:device`        | Regenerates `StageCue.amxd` from `integrations/ableton/src/build-device.ts`                                                                                    |
| `pnpm --filter @stagecue/ableton build:installers`    | Builds `StageCue-Ableton-<version>.pkg` (macOS) and `.exe` (Windows, needs NSIS) into `integrations/ableton/release/`                                          |
| `pnpm check`                                          | Typecheck, lint, tests, format check. Must pass before calling work done                                                                                       |
| `pnpm package:mac` / `pnpm package:win`               | Builds the installer for this computer: `.dmg` on the Mac, `.exe` on Windows (see Releasing a version)                                                         |
| `pnpm build`                                          | Builds the app                                                                                                                                                 |
| `STAGECUE_OUTPUT_SNAPSHOT=frame.png pnpm dev:desktop` | Saves one output frame with transparency                                                                                                                       |
| `STAGECUE_ENGINE_HOST=127.0.0.1 pnpm dev:engine`      | Engine for this computer only                                                                                                                                  |

## Where things are

| Need to change…                                     | Look in                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Countdown, progress, pulse, loops, marker names     | `packages/arrangement/src/cue.ts`, `model.ts` (+ `cue.test.ts`)                                                                                                     |
| Messages, methods, validation                       | `packages/event-protocol/src/messages.ts`, `methods.ts`                                                                                                             |
| Live state, hide band, disconnect behaviour         | `apps/engine/src/live/live-session.ts`                                                                                                                              |
| Server, roles, heartbeat                            | `apps/engine/src/server/engine-server.ts`                                                                                                                           |
| The band's look                                     | `packages/display-ui/src/Band.tsx` (+ `timing.ts`: when NEXT and the 4, 3, 2, 1 show)                                                                               |
| App screens                                         | `apps/desktop/src/renderer/src/features/{live,style,setup}`                                                                                                         |
| The app's look (header strip, monitor, lamps, logo) | `apps/desktop/DESIGN.md`, `ui/logo.tsx`, `ui/page.tsx`, `ui/segmented.tsx`, `features/display/Monitor.tsx` (`Monitor`, `MonitorColumns`), `features/setup/lamps.ts` |
| Bar and beat for any time signature                 | `features/live/position.ts` (+ `position.test.ts`)                                                                                                                  |
| Output window and NDI                               | `apps/desktop/src/main/output/`                                                                                                                                     |
| Per-frame playhead in the UI                        | `apps/desktop/src/renderer/src/live/use-cue-view.ts`                                                                                                                |
| Engine connection, reconnects                       | `apps/desktop/src/renderer/src/engine/engine-connection.ts`                                                                                                         |
| Ableton: reading locators, transport, loop region   | `integrations/ableton/device/stagecue-lom.js` (Max `[js]`)                                                                                                          |
| Ableton: talking to the engine, saved address       | `integrations/ableton/device/stagecue-bridge.js` (Node for Max)                                                                                                     |
| Full-screen cue for TVs                             | `packages/display-ui/src/FullScreenCue.tsx`                                                                                                                         |
| The TV page (connection, hidden, status)            | `apps/screen/src`                                                                                                                                                   |
| Serving the TV page                                 | `apps/engine/src/server/static-files.ts`                                                                                                                            |
| Attached screens (Show cue, Esc to close)           | `apps/desktop/src/main/screens.ts`, `ScreensPanel` in `features/setup/panels.tsx`                                                                                   |
| Setup page (signal path, lamps, verdict)            | `features/setup/signal.ts` (rules, tested), `SignalPath.tsx`, `panels.tsx`; design notes in `apps/desktop/DESIGN.md`                                                |
| Engine connection used by the app and the TV page   | `packages/engine-client/src/engine-connection.ts`                                                                                                                   |
| The device's layout                                 | `integrations/ableton/src/build-device.ts`, then rebuild the `.amxd`                                                                                                |
| Late messages over Wi-Fi, coasting after a drop     | `packages/arrangement/src/arrival.ts` (`ArrivalClock`, `COAST_MS`), used by `apps/engine/src/server/engine-server.ts` and `packages/engine-client`                  |
| Measuring lag under poor Wi-Fi                      | `integrations/netlab` (`pnpm netlab`)                                                                                                                               |
| Update banner (checks the website's releases)       | `apps/desktop/src/main/updates.ts`, `features/setup/UpdateBanner.tsx`                                                                                               |
| Installing the device from the app                  | `apps/desktop/src/main/ableton-device.ts`                                                                                                                           |
| Device installers (`.pkg`, `.exe`)                  | `integrations/ableton/installer`                                                                                                                                    |
| Website (separate public repo)                      | nyator/stagecue-site; its `src/app-ui` copies the band code                                                                                                         |
| Reference bridge for testing                        | `integrations/simulator/src/index.ts`                                                                                                                               |

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
- **Stale shared component in `pnpm dev`:** after a git merge or checkout rewrote `packages/display-ui/src/Band.tsx` while the app was running, Vite kept serving the old band, even after a reload, until `pnpm dev` restarted. If a change to a shared package does not show, check what the page actually renders (for example, the element's computed style over the debug port) and restart `pnpm dev`.
- **Stale engine after a schema change:** a long-running engine started before a change sends old data; restart it.
- **Vite cached a half-written file** during a shell rewrite and the app went blank. Touch the file and reload. Prefer editing files in place over truncating and rewriting while `pnpm dev` runs.
- **Sandboxed preloads must be CommonJS** (`out/preload/index.cjs`); already configured.
- **Off-screen windows are clamped to the screen size** unless `enableLargerThanScreen` is set; already set.
- **The TV page runs over plain http on the network**, which browsers treat as insecure: `crypto.randomUUID`, the clipboard, and screen wake lock are missing there. `crypto.randomUUID` left Safari on a blank page (11 November 2026); use `randomId()` from `@stagecue/engine-client`. Test the page at `http://<LAN address>:7417/`, never only at `127.0.0.1` or `localhost`, which count as secure and hide the problem.
- **The TV page must be built** before the engine can serve it: `pnpm dev` rebuilds it on change (`vite build --watch`); otherwise run `pnpm --filter @stagecue/screen build`. Without a build the engine answers 503 with that command.
- **Shared React components** live in `packages/display-ui`; each app's CSS has an `@source` line pointing at it so Tailwind generates their classes. A new app using them needs the same line.
- **Do not press “Show cue” on the only screen** when testing remotely: it takes over the whole display until Esc is pressed on it.
- **pnpm 10 blocks install scripts** for dependencies not listed in `pnpm.onlyBuiltDependencies`; native modules such as the NDI binding must be added there.
- **Visual Studio 2026 and node-gyp:** pnpm's bundled node-gyp (11.x) does not recognise VS 2026. The root `package.json` gives the NDI module node-gyp 13 through `pnpm.packageExtensions`; keep it.
- **Visual Studio's “Node.js development” workload** installs Node 14 into `C:\Program Files\nodejs`, replacing Node 24. Never add it; if `node --version` shows 14, remove that workload and reinstall Node 24.
- **nvm on the Windows PC:** Node is managed by nvm-windows, and other projects there switch it to Node 14. If `node --version` shows 14, run `nvm use 24.17.0`. To leave the other projects alone, put `C:\Users\hnyator\nvm\v24.17.0` first on `PATH` for the current shell only.
- **Windows PowerShell 5.1 garbles UTF-8 when rewriting files:** `Get-Content` / `Set-Content` read the file as ANSI and turn `·` and `’` into `Â·` and `â€™` (it happened once in `LivePage.tsx`). Edit source files with an editor, or with Python using `encoding='utf-8'`.
- **NDI frames are straight alpha.** Chromium paints premultiplied; `ndi.ts` converts (`unpremultiply`) only the frames that go out. Converting every painted frame cut this PC to about 7 fps, because the main process could not get back to the sender in time.
- **Two StageCue NDI sources:** with the MacBook and the PC both running StageCue on one network, a receiver that takes the first `StageCue` source may measure the other computer. Pick the source by computer name.
- **1080p is 30 fps on Windows, 60 on macOS** (`HD_RATE` in `output.ts`): this PC could not hand NDI more than about 30 frames a second, and aiming for 60 only added repeated frames.
- **Testing NDI without ProPresenter:** NDI Studio Monitor (NDI Tools), or a script using the module's `find` and `receive`; skip `receive.video()` errors with code `4140` (non-video data arrives first).
- **A running dev app keeps the old saved style after a new setting is added:** the off-screen NDI page fetched the style before the setting existed, so its value was missing and the progress bar vanished in ProPresenter (21 November 2026). Restart `pnpm dev` after changing `displaySettingsSchema`. Installed apps are not affected.
- **`ELECTRON_RUN_AS_NODE=1` also silences the packaged app:** launched from such a shell, `StageCue.app/Contents/MacOS/StageCue` exits at once with no output. Unset it first.
- **pnpm passes a literal `--` to scripts:** `pnpm simulate --tempo 120` used to crash on it; the simulator and netlab now ignore it. Do the same in any new script that uses `parseArgs`.
- **Claude Code's sandbox blocks NDI and local discovery:** NDI senders fail to start ("Failed to create NDI sender") and receivers find nothing. Run `pnpm dev` and NDI tests outside the sandbox.
