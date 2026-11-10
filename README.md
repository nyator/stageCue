# StageCue

StageCue follows the arrangement of a song as it plays in Ableton Live or Logic Pro and shows the choir the current section, the next section, and their instructions on the same screen as the lyrics in ProPresenter.

**Status: Phase 1 (foundation).** The desktop app, the engine, the WebSocket link between them, and the SQLite database work. Song editing, the arrangement engine, and the DAW and ProPresenter integrations are later phases.

## Requirements

- Node.js 24 or newer (the engine runs its TypeScript directly and uses the built-in `node:sqlite`)
- pnpm 10 or newer

## Install

```sh
pnpm install
```

## Run

```sh
pnpm dev
```

This starts the engine and the desktop app together. The engine restarts when its files change and the desktop app hot-reloads. The desktop footer shows whether it is connected to the engine. Press Ctrl+C to stop both.

To run them separately, use `pnpm dev:engine` and `pnpm dev:desktop`.

If the desktop app fails with `does not provide an export named BrowserWindow` and the error ends with a Node.js version, the environment variable `ELECTRON_RUN_AS_NODE` is set (some editor extensions set it for processes they launch). Clear it and run again:

```sh
# bash
unset ELECTRON_RUN_AS_NODE
# PowerShell
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

## Engine configuration

The engine reads these environment variables. All are optional.

| Variable               | Default             | Purpose                                                                                     |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `STAGECUE_ENGINE_HOST` | `127.0.0.1`         | Interface to listen on. Use `0.0.0.0` to accept connections from other computers on the LAN |
| `STAGECUE_ENGINE_PORT` | `7417`              | WebSocket port                                                                              |
| `STAGECUE_DATA_DIR`    | `apps/engine/.data` | Where `stagecue.db` is stored                                                               |
| `STAGECUE_LOG_LEVEL`   | `info`              | `debug`, `info`, `warn`, `error`, or `silent`                                               |

## Commands

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `pnpm dev`          | Runs the engine and the desktop app                          |
| `pnpm dev:desktop`  | Runs only the desktop app                                    |
| `pnpm dev:engine`   | Runs only the engine, restarting on change                   |
| `pnpm start:engine` | Runs the engine once                                         |
| `pnpm build`        | Builds the desktop app into `apps/desktop/out`               |
| `pnpm test`         | Runs the test suite once (`pnpm test:watch` to keep it open) |
| `pnpm typecheck`    | Type-checks every workspace                                  |
| `pnpm lint`         | Runs ESLint                                                  |
| `pnpm format`       | Formats the repo with Prettier                               |
| `pnpm check`        | Typecheck, lint, test, and format check, as CI would         |

## Layout

```text
apps/desktop              Electron + React + Tailwind desktop app
apps/engine               Node.js engine: WebSocket server and SQLite database
packages/event-protocol   WebSocket message schemas shared by every peer
packages/shared-types     Types shared between desktop processes
packages/arrangement      Arrangement models (Phase 3)
integrations/ableton      Max for Live bridge (Phase 5)
integrations/logic        Logic Pro bridge (Phase 6)
integrations/propresenter ProPresenter output (Phase 4)
docs/                     Architecture, protocol, and data model
```

- [docs/architecture.md](docs/architecture.md) explains how the pieces fit together.
- [docs/protocol.md](docs/protocol.md) is the engine's WebSocket protocol.
- [docs/data-model.md](docs/data-model.md) describes the database.
