# StageCue app: design notes

The app follows the tokens in `src/renderer/src/styles.css` (dark, tinted neutrals, one green accent, Geist and Geist Mono). This file records design decisions so later work stays consistent.

## The whole app

**Idea:** StageCue is a broadcast desk for one signal. Setup is its routing, Live is its program monitor, Style is its picture controls. The same lamps, cables, and tally chips mean the same thing on every page.

**One clock:** Ableton's beat, through `useCueView` (the same clock as the band). Setup's cable pulse and the running order's fill both read it, so nothing on screen can disagree with the music.

**Motion verb:** pulse on the beat, like a tally light. Everything else is quiet: hover raises or rings, press presses in, pages cross-fade (`enter`), the nav marker and segmented thumbs slide. Reduced motion stops every beat-driven motion; lamps and fills still show the state.

**Shared pieces:**

| Piece             | Where                                           | Rule                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page header       | `ui/page.tsx` `PageHeader`                      | Page name, then one sentence on whether it is in order, as a polite live region. Actions at the right.                                                                                                                                                         |
| Group label       | `ui/page.tsx` `GroupLabel`                      | 11px uppercase, used only over a group of facts or controls.                                                                                                                                                                                                   |
| Lamps             | `features/setup/lamps.ts`                       | live, ready, waiting, failing, off. Always with a word beside them.                                                                                                                                                                                            |
| Header strip      | `App.tsx` `SignalStrip`                         | Setup's signal path in miniature; opens Setup.                                                                                                                                                                                                                 |
| Monitor           | `features/display/Monitor.tsx`                  | A preview in a monitor frame with a tally chip: green **On screen**, amber **Hidden**, neutral for previews (**Standby**, **Sample**, **Live from Ableton** in Style). Only green means the room sees it.                                                      |
| Monitor columns   | `features/display/Monitor.tsx` `MonitorColumns` | Live and Style: the left column is exactly as wide as the largest 16:9 picture the height allows, with what sits above and below it at the same width; the right column takes all the rest (never under 19rem). No page scroll and no gap between the columns. |
| Segmented control | `ui/segmented.tsx`                              | A radio group with a sliding thumb; arrows move it.                                                                                                                                                                                                            |

**Logo:** `ui/logo.tsx`. The mark is the band reduced to a green tile: a bold bar for the current section, a short one for what comes next, and a progress line two thirds full. The wordmark sets "Cue" in the accent. It is the one hand-drawn icon the app allows.

**Layout:** pages sit in `max-w-[90rem]` with 32px gutters, so up to 1440px they line up under the logo and the header strip. Live and Style fill the window exactly and never scroll the page; Setup scrolls when its panel is taller than the window.

**Owner's calls (11 November 2026):** no beat lamps on Live; Live and Style must fit the window with only their right column scrolling; no empty gap between a page's columns.

## The band (what the choir sees)

`packages/display-ui/src/Band.tsx`, sent to ProPresenter over NDI; the TV page (`FullScreenCue.tsx`) follows the same rules.

A singer looks up for half a second, mid-song. Singers said the first band had a lot going on, so it now shows one thing most of the time.

1. **Most of the song: only now.** The current section, centred, with its extra line (the choir's instruction, such as Full choir) underneath, and the thin progress bar. No NOW label, no NEXT, no numbers.
2. **The last bars: what is next.** NEXT fades in at the right only in the last 4 bars before a change (`NEXT_LEAD_BARS` in `packages/display-ui/src/timing.ts`, tested), as a small red NEXT with the bars left, and the next section's name. In the final bar the red 4, 3, 2, 1 pulses beside it. NEXT's extra line is not shown; it appears once that section starts.
3. **Stopped: only now.** With Ableton stopped there is no countdown, so NEXT stays hidden.
4. **Nothing moves except time.** The current section never shifts (equal side columns keep it centred). The only motion is the progress bar (`scaleX`), the pulse (`scale`), and NEXT fading in (`opacity`), all cheap to render for NDI. No glow or shadow: they repaint the whole band on every frame.
5. **Nothing to decode.** Words and one number. No arrows or icons (an arrow was tried and removed at the owner's request, 11 November 2026).
6. **Red means time.** The highlight colour marks NEXT, the progress bar, and the pulse, nothing else.
7. **Long names stay in their lane.** A long NEXT name is cut short with an ellipsis; it never runs into the current section.

Sizes are percent of the output width, times Style → Text size: current section 4.8, its extra line 3, NEXT's name 3.6, labels 1.5, progress bar 0.9.

## Live page

- **Monitor:** what the room sees, with the band faded when hidden. Its tally chip is the first thing to read.
- **Fits the window:** Live never scrolls (`MonitorColumns`). The preview is as large as the height allows; the playback strip and help text share its right edge, and the running order takes the rest of the width. Only the running order scrolls, for long songs.
- **Level tops:** the preview has a **Screen preview** label row, like **Running order**, so both boxes start at the same height.
- **Transport strip:** Playing or Stopped, bar.beat, tempo, and metre. Hide band sits at its right end, the page's one action. (Beat lamps were tried and removed at the owner's request.)
- **Running order:** Ableton's locators by bar. The current row fills from the left as the section plays (the band's progress, again), with a green edge and **Now**; the next row says how far away it is. The list keeps the current row in view.

## Style page

- Save, Discard, and Reset sit in the page header, always in reach; the status sentence says whether screens have the edited style yet.
- The page never scrolls (`MonitorColumns`): the header with Save stays put, and only the inspector on the right scrolls. A segmented control switches the preview between ProPresenter and a TV; the caption under the preview shares its width.
- The inspector groups settings as a volunteer thinks of them: Position, Colours (round swatches that open the system picker), Size and see-through, Show, and ProPresenter output (Output size 1080p or 4K, and Show cues early, both from the Mac's work merged on 11 November 2026).

## Setup page

### Brief

A church media volunteer opens Setup before a service. In three seconds they must know whether StageCue is ready, and if not, which link is broken and how to fix it. The old page was a single column of text sections that had to be read top to bottom to answer either question.

### Concept card

```
Idea:        Setup is the signal path StageCue carries, from Ableton to every screen, drawn as it is right now.
Metaphor:    a sound desk's routing: sources on the left, the desk in the middle, outputs on the right.
Signature:   while Ableton plays, a pulse travels each live cable once per beat, on Ableton's own beat.
Emotion:     calm certainty: everything that is patched is lit.
Motion verb: pulse on the beat, like a tally light.
Screenshot:  the routing strip with lit lamps and a pulse halfway along a cable.
```

Concepts considered: a pre-service checklist (kept as the one-line verdict above the routing) and a floor plan of the church (too specific to one building).

### Composition

```
Setup                                            ● Ready. Ableton is playing; the cue is on 2 outputs.

 SOURCE              STAGECUE               OUTPUTS
┌──────────────┐    ┌──────────────┐    ┌───────────────────────────┐
│● Ableton     │────│● Engine      │─┬──│● ProPresenter (NDI)       │
│ Simulated set│    │ 192.168.1.20 │ ├──│● Screens on this computer │
│ ▶ 96 BPM     │    │ 4 connected  │ └──│● Browsers on the network  │
└──────────────┘    └──────────────┘    └───────────────────────────┘
───────────────────────────────────────────────────────────────────────
 [Panel for the selected box: what it is, its state, and what to do]
```

- The five boxes are tabs; the panel below shows the selected one. The page opens on the first box that needs attention, else Ableton.
- Lamps: green and lit when live, green steady when ready, amber when waiting, red when failing, grey when off. Every lamp has a text equivalent next to it.
- Cables are solid green when the link carries signal, faint when not.
- Source and engine boxes span the outputs' full height, so every cable meets its box at the centre; their foot line gives a count (locators in the set, connections now).
- The selected box takes the accent border; the panel below opens with the app's `enter` motion.

### Motion

- One clock: Ableton's beat (`useCueView`), the same one the band uses. The pulse position is the beat phase, so it can never drift from the music.
- Hovering or focusing a box gives its lamp one ring pulse (the motion verb) and raises the box; pressing presses it in.
- Reduced motion: no travelling pulse and no ring; lit cables and lamps carry the state.
- At rest with Ableton stopped, nothing moves: a still page is correct when no music is playing. The pulse returns when it plays.

### Accessibility

- The routing strip is a `tablist`; arrow keys move between boxes, Home and End jump to the ends; the panel is its `tabpanel`.
- The verdict is a polite live region.
- Colour is never the only signal: each lamp has a status word.
