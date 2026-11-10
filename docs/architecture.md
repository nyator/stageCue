# Architecture

StageCue is a pnpm workspace. Each directory under `apps`, `packages`, and `integrations` is its own package.

```text
 DAW bridge ──┐                         ┌── desktop app (editor, director controls)
 (Phase 5/6)  ├── WebSocket ── engine ──┤
 simulator ───┘                │        └── ProPresenter output (Phase 4)
 (Phase 3)                  SQLite
```

## Engine

`apps/engine` is a standalone Node.js process and the single source of truth. It owns the database and, from Phase 3, the live performance state. Every other component is a client that connects to it over WebSocket.

It is a separate process rather than code inside Electron for three reasons:

- It can run headless on the music computer next to the DAW, while the desktop app runs on the media computer or anywhere else on the network.
- A crash or reload in the desktop UI cannot interrupt a live performance.
- It is plain Node, so it can be tested without Electron.

When StageCue is packaged, Electron will start the engine with `utilityProcess` so users still launch a single app. That is a packaging change, not an architectural one.

The engine listens on `127.0.0.1` by default. Other machines can reach it once `STAGECUE_ENGINE_HOST=0.0.0.0` is set. It stays loopback-only by default until device pairing exists, so nothing else on a church network can drive the display.

Node 24 runs the engine's TypeScript directly, so there is no build step. That requires erasable-only syntax (no `enum` or parameter properties) and explicit `.ts` extensions in relative imports, which `tsconfig.base.json` enforces.

## Database

SQLite through Node's built-in `node:sqlite`. It needs no native module, so nothing has to be recompiled for Electron. Migrations live in `apps/engine/src/db/migrations`. Each one runs in its own transaction and is recorded in `schema_migrations`. The engine refuses to open a database written by a newer build. See [data-model.md](data-model.md).

## Desktop app

`apps/desktop` is Electron with a React renderer built by Vite and styled with Tailwind CSS.

- The main process creates one window with context isolation on, Node integration off, and a sandboxed preload. It blocks navigation away from the app, denies new windows (opening `https` links in the system browser instead), and denies every permission request.
- The preload is built as CommonJS (`out/preload/index.cjs`), as sandboxed preloads require. It exposes only a read-only `window.stagecue` object.
- The renderer talks to the engine directly over WebSocket. `src/renderer/src/engine/engine-connection.ts` owns that socket, the handshake, message validation, requests, and reconnection with backoff. `engine/hooks.ts` wraps it for React: `useEngineQuery` loads data and reloads it whenever any client changes the library, and `useAction` tracks one user action.
- Editing rules live outside components. `features/songs/drafts.ts` holds the section and arrangement editing logic as pure, tested functions; components render it.
- Screens are under `features/`, shared controls under `ui/`. Navigation is a small store in `navigation/router.ts` that also asks before leaving a screen with unsaved changes.
- The main process passes the computer name to the preload, so each desktop identifies itself to the engine by machine name.
- The Content Security Policy in `index.html` allows WebSocket connections to any host, so the app can reach an engine on another computer, and blocks every other network access outside the app.

## Packages

`packages/event-protocol` defines every WebSocket message as a `zod` schema. Both ends validate what they receive. See [protocol.md](protocol.md).

`packages/shared-types` holds types shared between Electron processes, such as the preload bridge.

`packages/arrangement` is the domain model: songs, sections, arrangements, setlists, display settings, their validation schemas, bar layout, and the display cue logic (current section, next section, repeat pass). It is pure TypeScript, so the engine, the desktop app, and later the integrations share one definition. Phase 3 adds playback tracking here.

## Integrations

`integrations/ableton`, `integrations/logic`, and `integrations/propresenter` are reserved for Phases 4–6. Their Max for Live devices, Scripter scripts, and ProPresenter assets will sit in subfolders when they exist.

## Dependency direction

Apps may depend on packages. Packages never depend on apps. Integrations depend on packages only. The renderer never gets Node.js access.
