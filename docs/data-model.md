# Data model

The engine stores everything in one SQLite file, `stagecue.db`. The schema is defined by migrations in `apps/engine/src/db/migrations/`. This document explains the design. The SQL is authoritative.

## Core idea: songs, arrangements, performances

```text
songs ─┬─ song_sections          the building blocks: Verse 1, Chorus, Bridge…
       └─ arrangements ── arrangement_sections   one ordering and bar layout of those blocks

setlists ── performances ── performance_sections   a frozen copy, used live
                  └── performance_events            what actually happened
```

- A **song** owns its **sections**: name, type, length, default vocal parts, and default instructions.
- An **arrangement** is one way of playing a song. A song can have any number of them, such as "Sunday short" or "Easter extended". Each **arrangement section** places a song section at a bar range, with a repeat count. It can override the vocal parts or instructions (`NULL` means inherit).
- A **performance** is one rendition of a song, usually inside a **setlist**. When it is created, its arrangement's sections are copied into **performance sections**. Editing the arrangement later never changes a past or in-progress performance. Live changes, such as an extra chorus, are made to the copy.
- **Performance events** form an append-only log of transport changes, overrides, and transitions, used for troubleshooting and review.
- **Devices** are machines that have connected to the engine, keyed by their stable `clientId`. **DAW sessions** record each connection from a DAW bridge.

## Rules the database enforces

- Foreign keys are on. Deleting a song removes its sections and arrangements. A song section cannot be deleted while an arrangement uses it (`RESTRICT`).
- An arrangement section must reference a section of the same song (enforced by triggers).
- `start_bar`–`end_bar` spans every repeat, and each pass must be the same length: `(end_bar − start_bar + 1) % repeat_count = 0`. A 16-bar span with `repeat_count = 2` is two 8-bar passes.
- Bars are 1-based, as in the DAW.
- `section_type` is one of `intro`, `verse`, `pre_chorus`, `chorus`, `bridge`, `instrumental`, `vamp`, `tag`, `interlude`, or `ending`, plus `other`.
- `vocal_parts` must be a JSON array. The application validates its values: `lead`, `soprano`, `alto`, `tenor`, `bass`, `full_choir`, and `instrumental`.
- `service_date` must be a valid `YYYY-MM-DD` date.

## Conventions

- IDs are application-generated UUID strings. The exception is `performance_events.id`, an auto-increment integer, so events have a total order.
- Timestamps are ISO 8601 UTC strings. The application sets `updated_at`.
- The next section is not stored. It is the next `position` in the same arrangement or performance.

## Changing the schema

Add a new file in `migrations/` with the next version number and register it in `migrations/index.ts`. Never edit a migration that has already run on someone's machine. The engine runs pending migrations at startup.
