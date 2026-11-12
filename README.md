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

| Part                                   | State                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine, protocol, countdown logic      | Working and tested                                                                                                                                   |
| StageCue app (Live, Style, Setup)      | Working with the simulator                                                                                                                           |
| Output page (1080p or 4K, transparent) | Working; verified by snapshot                                                                                                                        |
| NDI sending                            | Working on macOS (1080p at 60 fps, 4K at 30) and Windows (1080p at 30), straight alpha. ProPresenter end to end not yet recorded                     |
| Max for Live device                    | Working in Live 12 Suite; Setup can install it into Live's User Library                                                                              |
| TV or screen, no ProPresenter          | Working: a full-screen page the engine serves to any browser, and full-screen windows on attached screens. Tested in a browser; not yet on a real TV |

## Marking up a song in Ableton

Add a locator where each section starts, and name it:

| Locator name           | The choir sees                        |
| ---------------------- | ------------------------------------- |
| `Chorus`               | **CHORUS**                            |
| `Chorus \| Full choir` | **CHORUS** with “Full choir” under it |
| `-`                    | Nothing (clears the band)             |

Most of the time the band shows only the section the choir is in, with its extra line underneath and a progress bar. In the last 4 bars before a change, what comes next appears with the bars left, and in the last bar it counts 4, 3, 2, 1 on the beat. Inside a loop, it shows where the loop goes back to. The screen always follows Ableton: when the service goes off script, the playback engineer stops Ableton, and the media team can hide the band from the Live page until Ableton is back in step.

## Setting up at church: where to run what

**Run StageCue on the same computer as ProPresenter.** The music computer only needs the StageCue device in Ableton.

```text
 STAGE                                  MEDIA DESK
 ┌──────────────────────┐               ┌──────────────────────────────────┐
 │ Music Mac            │   network     │ Media computer                   │
 │ Ableton              │──────────────▶│ StageCue  ──NDI──▶ ProPresenter   │
 │  └ StageCue device   │  tiny data    │ (same computer, video stays put) │
 └──────────────────────┘               └──────────────────────────────────┘
```

- **Only section names and the playhead cross the network**, a few kilobits a second. The band itself is video (about 16 Mbit/s over NDI) and stays inside the media computer, so it never waits on Wi-Fi.
- **The media operator has Hide band / Show band** on the computer they already use.
- **TVs** can still open the cue from the media computer's address.

| Setup                                                                          | Works | For a service                                                                                         |
| ------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------- |
| Ableton, StageCue and ProPresenter on one computer                             | Yes   | Best: nothing crosses the network                                                                     |
| Ableton on the stage computer; StageCue and ProPresenter on the media computer | Yes   | Recommended for two computers                                                                         |
| StageCue on a different computer from ProPresenter                             | Yes   | Avoid: the video crosses the network (adds delay, depends on Wi-Fi). If you must, use a network cable |

Before the first service:

1. **Connect stage and media desk with a network cable** if you can, or the church's own Wi-Fi. Avoid a phone hotspot.
2. **A fixed address for the media computer** (a reserved address on the router, or a static IP) is only needed if the network blocks broadcasts (some guest Wi-Fi does) and the address has to be typed into the Ableton device.
3. **Set up the device once** (see Connecting Ableton below): on the media computer, Setup → Ableton → **Save a copy for another computer**; install it on the stage Mac. The device finds StageCue on the network by itself.
4. **Allow StageCue on the network.** On a Mac, allow incoming connections when macOS asks. On Windows, mark the church network as Private.
5. **Check the timing:** play a song and watch the 4, 3, 2, 1 on ProPresenter's output. If it lands after the beat, raise **Style → Show cues early** until it lands on it.

Before each service, the Setup page should show Ableton connected and ProPresenter receiving.

Tested on 11 November 2026 with Ableton on a MacBook and StageCue on a Windows PC over an iPhone hotspot: 20 updates a second, a Wi-Fi drop held the band and reconnected on its own, and the TV page worked in Safari. Small gaps appeared only while the NDI video was also crossing the hotspot, which the recommended setup avoids.

## Connecting Ableton

Needs Live 12 Suite (or Live 12 with Max for Live). Max 9, which comes with it, provides everything the device uses.

1. Start StageCue (`pnpm dev`). Stop the simulator if it is running.
2. In StageCue's **Setup** page, click **Add to Ableton on this computer**. It copies the device into Live's User Library (found from Live's preferences). In Live's browser, open User Library › Presets › Audio Effects › Max Audio Effect › StageCue and drag it onto any track. The master track is fine; audio passes through untouched. To have it in every new set, save a set with it as Live's default set.
   For a music computer that does not run StageCue, click **Save a copy for another computer**, take the `StageCue` folder across, and drag the whole folder onto User Library in Live's browser there.
3. Leave the device's address field empty: it finds StageCue on this computer or the local network by itself (StageCue announces itself on UDP port 7418) and shows **Connected to** and the computer's name. When several StageCue computers answer, it picks the one it used last time.
   To choose one yourself, or on a network that blocks broadcasts, type the address the engine prints at startup and press Return. Clear the field and press Return to go back to finding it by itself. The device remembers either choice.
4. The device's light turns green, with the section under the playhead and the number of locators. Press play.

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

## Getting the band into ProPresenter

StageCue sends the band as an NDI source named `StageCue` (shown as `YOUR-COMPUTER (StageCue)`), 1920×1080 with a transparent background (60 fps on a Mac, 30 on Windows), as soon as the app starts. A change reaches an NDI receiver on the same computer in about 20 ms. If ProPresenter's output is 4K, set **Style → Output size** to 4K so the band stays sharp; it uses more of the computer. The app's status shows how many receivers are connected.

1. The first time, macOS asks whether StageCue (Electron, in development) may find devices on the local network. Allow it, or NDI receivers cannot see the source. To change it later: System Settings → Privacy & Security → Local Network.
2. In ProPresenter 7, add an NDI video input and pick `StageCue`. Put it in a look or layer above the lyrics; the transparent area shows what is underneath.
3. To check the source without ProPresenter, use NDI Studio Monitor from the free NDI Tools.
4. If the band still changes after the music (ProPresenter, projectors and LED walls each add their own delay), raise **Style → Show cues early** until the 4, 3, 2, 1 lands on the beat. It only moves the NDI output; the app's preview stays exact.

`pnpm install` downloads the NDI SDK and compiles the NDI module, which needs Xcode Command Line Tools on macOS (`xcode-select --install`) or the Visual Studio C++ build tools on Windows. If the module is missing, the app keeps working and reports NDI as unavailable.

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
