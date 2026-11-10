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

| Part                                 | State                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Engine, protocol, countdown logic    | Working and tested                                                           |
| StageCue app (Live, Style, Setup)    | Working with the simulator                                                   |
| Output page (1920×1080, transparent) | Working; verified by snapshot                                                |
| NDI sending                          | Not built yet. Needs the NDI SDK and Visual Studio C++ tools on this machine |
| Max for Live device                  | Not built yet                                                                |

## Marking up a song in Ableton

Add a locator where each section starts, and name it:

| Locator name           | The choir sees                        |
| ---------------------- | ------------------------------------- |
| `Chorus`               | **CHORUS**                            |
| `Chorus \| Full choir` | **CHORUS** with “Full choir” under it |
| `-`                    | Nothing (clears the band)             |

During each section the band shows what comes next and how many bars are left; in the last bar it counts 4, 3, 2, 1 on the beat. The director can hold a section, step forward or back, or pick any locator, and then hand control back to Ableton.

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
integrations/ableton     Max for Live device (next)
docs/                    Architecture and protocol
```

- [docs/PRD.md](docs/PRD.md) is what StageCue must do and why.
- [docs/technical-design.md](docs/technical-design.md) is how it works, the decisions behind it, and the plans for NDI, the Ableton device, and packaging.
- [docs/architecture.md](docs/architecture.md) explains how the pieces fit together.
- [docs/protocol.md](docs/protocol.md) is the network protocol, including what the Ableton device must send.
