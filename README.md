# StageCue

StageCue carries the arrangement of a song from Ableton Live to the screen the choir reads. You mark the sections on Ableton's arrangement grid; StageCue follows the playhead and shows the current section, the next one, and a countdown to it. ProPresenter shows that band as a video source, on top of the lyrics, wherever the operator places it.

StageCue never controls the song, the lyrics, or ProPresenter. It only passes information along.

```text
MUSIC COMPUTER                         MEDIA COMPUTER
Ableton Live                           StageCue (engine + app)
 └ StageCue Max for Live device  ───►   draws Now / Next / countdown
   reads locators and playhead  network publishes it as an NDI source
                                       ProPresenter 7
                                        └ operator adds the NDI source to their layout
```

## Status

| Part                                 | State                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| Engine, protocol, countdown logic    | Working and tested                                                                   |
| StageCue app (Live, Style, Setup)    | Working with the simulator                                                           |
| Output page (1920×1080, transparent) | Working; verified by snapshot                                                        |
| NDI sending                          | Working on macOS; 1080p at 60 fps or 4K at 30, transparent; ProPresenter receives it |
| Max for Live device                  | Working in Live 12 Suite                                                             |

## Marking up a song in Ableton

Add a locator where each section starts, and name it:

| Locator name           | The choir sees                        |
| ---------------------- | ------------------------------------- |
| `Chorus`               | **CHORUS**                            |
| `Chorus \| Full choir` | **CHORUS** with “Full choir” under it |
| `-`                    | Nothing (clears the band)             |

During each section the band shows what comes next and how many bars are left; in the last bar it counts 4, 3, 2, 1 on the beat. Inside a loop, it shows where the loop goes back to. The screen always follows Ableton: when the service goes off script, the playback engineer stops Ableton, and the media team can hide the band from the Live page until Ableton is back in step.

## Connecting Ableton

Needs Live 12 Suite (or Live 12 with Max for Live). Max 9, which comes with it, provides everything the device uses.

1. Start StageCue (`pnpm dev`). Stop the simulator if it is running.
2. In StageCue's **Setup** page, click **Add to Ableton on this computer**. It copies the device into Live's User Library (found from Live's preferences). In Live's browser, open User Library › Presets › Audio Effects › Max Audio Effect › StageCue and drag it onto any track. The master track is fine; audio passes through untouched. To have it in every new set, save a set with it as Live's default set.
   For a music computer that does not run StageCue, click **Save a copy for another computer**, take the `StageCue` folder across, and drag the whole folder onto User Library in Live's browser there.
3. In the device's address field, type the engine's address and press Return: `127.0.0.1:7417` when StageCue runs on the same computer, or the address the engine prints at startup when it runs on another one. The device remembers it.
4. The device's light turns green and shows **Connected to StageCue**, with the section under the playhead and the number of locators. Press play.

Keep `StageCue.amxd` next to `stagecue-lom.js`, `stagecue-bridge.js`, and `package.json`; the device loads its scripts from its own folder. After changing the device's layout in `integrations/ableton/src/build-device.ts`, rebuild it with `pnpm --filter @stagecue/ableton build:device`.

## Requirements

- Node.js 24 or newer
- pnpm 10 or newer

## Install and run

```sh
pnpm install
pnpm dev        # engine + StageCue app
pnpm simulate   # in a second terminal: a pretend Ableton playing a song
```

The simulator plays a marked-up song at 96 BPM. In its terminal, space plays or stops, the arrow keys jump a bar, r restarts, and q quits. Use `pnpm simulate --tempo 140` for another tempo.

The first time the engine runs, Windows may ask whether Node.js may use the network. Allow it on private networks, so the music computer can connect.

If the app fails with `does not provide an export named BrowserWindow` and the error ends with a Node.js version, the environment variable `ELECTRON_RUN_AS_NODE` is set (some editor extensions set it). Clear it and run again:

```sh
# bash
unset ELECTRON_RUN_AS_NODE
# PowerShell
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

## Configuration

The engine reads these environment variables. All are optional.

| Variable               | Default             | Purpose                                                         |
| ---------------------- | ------------------- | --------------------------------------------------------------- |
| `STAGECUE_ENGINE_HOST` | `0.0.0.0`           | Interface to listen on. `127.0.0.1` accepts this computer only  |
| `STAGECUE_ENGINE_PORT` | `7417`              | WebSocket port                                                  |
| `STAGECUE_DATA_DIR`    | `apps/engine/.data` | Where `stagecue.db` (display style and known devices) is stored |
| `STAGECUE_LOG_LEVEL`   | `info`              | `debug`, `info`, `warn`, `error`, or `silent`                   |

## Getting the band into ProPresenter

StageCue sends the band as an NDI source named `StageCue` (shown as `YOUR-COMPUTER (StageCue)`), 1920×1080 at 60 fps with a transparent background, as soon as the app starts. A change reaches an NDI receiver on the same computer in about 20 ms. If ProPresenter's output is 4K, set **Style → Output size** to 4K so the band stays sharp; it uses more of the computer. The app's status shows how many receivers are connected.

1. The first time, macOS asks whether StageCue (Electron, in development) may find devices on the local network. Allow it, or NDI receivers cannot see the source. To change it later: System Settings → Privacy & Security → Local Network.
2. In ProPresenter 7, add an NDI video input and pick `StageCue`. Put it in a look or layer above the lyrics; the transparent area shows what is underneath.
3. To check the source without ProPresenter, use NDI Studio Monitor from the free NDI Tools.
4. If the band still changes after the music (ProPresenter, projectors and LED walls each add their own delay), raise **Style → Show cues early** until the 4, 3, 2, 1 lands on the beat. It only moves the NDI output; the app's preview stays exact.

`pnpm install` downloads the NDI SDK and compiles the NDI module, which needs Xcode Command Line Tools on macOS (`xcode-select --install`) or the Visual Studio C++ build tools on Windows. If the module is missing, the app keeps working and reports NDI as unavailable.

For testing the output without NDI or ProPresenter, start the app with `STAGECUE_OUTPUT_SNAPSHOT=frame.png`. It saves one rendered 1920×1080 frame, with its transparency, to that file.

## Commands

| Command            | What it does                                          |
| ------------------ | ----------------------------------------------------- |
| `pnpm dev`         | Runs the engine and the StageCue app                  |
| `pnpm dev:desktop` | Runs only the app                                     |
| `pnpm dev:engine`  | Runs only the engine, restarting on change            |
| `pnpm simulate`    | Runs the Ableton simulator                            |
| `pnpm build`       | Builds the app into `apps/desktop/out`                |
| `pnpm test`        | Runs the tests (`pnpm test:watch` keeps them running) |
| `pnpm check`       | Typecheck, lint, test, and format check               |

## Layout

```text
apps/desktop             StageCue app: Live, Style, Setup, and the off-screen output page
apps/engine              Receives Ableton's markers and playhead, keeps the live state
packages/arrangement     Markers, countdown, and playhead estimation (pure, tested)
packages/event-protocol  Every network message, validated on both ends
packages/shared-types    Types shared between Electron processes
integrations/simulator   Pretend Ableton for testing
integrations/ableton     Max for Live device
docs/                    Architecture and protocol
```

- [docs/PRD.md](docs/PRD.md) is what StageCue must do and why.
- [docs/technical-design.md](docs/technical-design.md) is how it works, the decisions behind it, and the plans for NDI, the Ableton device, and packaging.
- [docs/architecture.md](docs/architecture.md) explains how the pieces fit together.
- [docs/protocol.md](docs/protocol.md) is the network protocol, including what the Ableton device must send.
