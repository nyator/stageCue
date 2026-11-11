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

| Part                                 | State                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine, protocol, countdown logic    | Working and tested                                                                                                                                   |
| StageCue app (Live, Style, Setup)    | Working with the simulator                                                                                                                           |
| Output page (1920×1080, transparent) | Working; verified by snapshot                                                                                                                        |
| NDI sending                          | Working on Windows: 1920×1080 at 30 fps, premultiplied alpha. Not yet seen in ProPresenter                                                           |
| Max for Live device                  | Working in Live 12 Suite                                                                                                                             |
| TV or screen, no ProPresenter        | Working: a full-screen page the engine serves to any browser, and full-screen windows on attached screens. Tested in a browser; not yet on a real TV |

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
2. Drag `integrations/ableton/device/StageCue.amxd` from Finder onto any track in Live. The master track is fine; audio passes through untouched.
3. In the device's address field, type the engine's address and press Return: `127.0.0.1:7417` when StageCue runs on the same computer, or the address the engine prints at startup when it runs on another one. The device remembers it.
4. The device shows **Connected**. Press play.

Keep `StageCue.amxd` next to `stagecue-lom.js`, `stagecue-bridge.js`, and `package.json`; the device loads its scripts from its own folder. After changing the device's layout in `integrations/ableton/src/build-device.ts`, rebuild it with `pnpm --filter @stagecue/ableton build:device`.

## Showing it on a TV (no ProPresenter)

Without ProPresenter, StageCue fills a whole screen with the cue: the section very large, the extra line, what comes next with the countdown, and the progress bar. Two ways, both in Setup (the **Screens on this computer** and **Browsers on the network** boxes):

- **A screen attached to the StageCue computer:** a TV on HDMI, or an Apple TV used as a separate AirPlay display. Click **Show cue** next to it; press Esc on that screen to close it.
- **Any screen with a web browser on the same network:** a smart TV's browser, a tablet, or a small computer plugged into the TV. Open `http://<StageCue computer>:7417/` (Setup lists the exact addresses) and click once for full screen. Add `?name=Choir%20TV` to name it in the device list.

Colours and on/off switches come from the Style tab (set **Preview on** to **TV**). Hide band blanks these screens too.

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
| `STAGECUE_SCREEN_DIR`  | `apps/screen/dist`  | The built screen page the engine serves to TVs and browsers     |

For testing the output without NDI or ProPresenter, start the app with `STAGECUE_OUTPUT_SNAPSHOT=frame.png`. It saves one rendered 1920×1080 frame, with its transparency, to that file.

## Commands

| Command            | What it does                                                |
| ------------------ | ----------------------------------------------------------- |
| `pnpm dev`         | Runs the engine and the StageCue app                        |
| `pnpm dev:desktop` | Runs only the app                                           |
| `pnpm dev:engine`  | Runs only the engine, restarting on change                  |
| `pnpm dev:screen`  | Rebuilds the screen page on change (included in `pnpm dev`) |
| `pnpm simulate`    | Runs the Ableton simulator                                  |
| `pnpm build`       | Builds the app into `apps/desktop/out`                      |
| `pnpm test`        | Runs the tests (`pnpm test:watch` keeps them running)       |
| `pnpm check`       | Typecheck, lint, test, and format check                     |

## Layout

```text
apps/desktop             StageCue app: Live, Style, Setup, and the off-screen output page
apps/engine              Receives Ableton's markers and playhead, keeps the live state
packages/arrangement     Markers, countdown, and playhead estimation (pure, tested)
packages/event-protocol  Every network message, validated on both ends
packages/shared-types    Types shared between Electron processes
integrations/simulator   Pretend Ableton for testing
apps/screen              Full-screen cue page for TVs, served by the engine
packages/engine-client   Browser connection to the engine (app and screen page)
packages/display-ui      The band, the full-screen cue, and the per-frame cue hook
integrations/ableton     Max for Live device
docs/                    Architecture and protocol
```

- [docs/PRD.md](docs/PRD.md) is what StageCue must do and why.
- [docs/technical-design.md](docs/technical-design.md) is how it works, the decisions behind it, and the plans for NDI, the Ableton device, and packaging.
- [docs/architecture.md](docs/architecture.md) explains how the pieces fit together.
- [docs/protocol.md](docs/protocol.md) is the network protocol, including what the Ableton device must send.
