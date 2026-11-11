# StageCue: Product Requirements

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| Status       | In development. Core working with a simulator; Ableton device and NDI output not built yet |
| Owner        | Henry Nyator                                                                               |
| Last updated | 10 November 2026                                                                           |

## 1. Problem

Church choirs sing to a backing arrangement played from a DAW. The same song is arranged differently from week to week: an extra chorus, a bridge sung twice, a vamp held until the pastor finishes. The choir sees the lyrics on screen but not the arrangement, so they guess what comes next, come in late, or sing through a section that should be instrumental.

The music team already knows the arrangement: it is laid out on the DAW's timeline. That knowledge never reaches the choir.

## 2. Product in one sentence

StageCue reads the section markers from the DAW as the song plays and shows the choir, on the same screen as the lyrics, which section they are in, what comes next, and exactly when.

## 3. Principles

1. **StageCue carries information; it never controls anything.** It does not start, stop, or change the song, the lyrics, the slides, or ProPresenter.
2. **The arrangement lives in the DAW.** The music director marks sections on the timeline they already use. There is no second place to keep in sync.
3. **The media operator owns the screen.** StageCue supplies a source; the operator decides where and whether it appears.
4. **Simple enough to set up on a Sunday morning.** One device in Ableton, one app on the media computer, one input in ProPresenter.
5. **Never make the screen worse.** If anything fails, the band holds still or disappears. It never shows wrong information confidently.

## 4. Users

| User                                | Needs                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| **Choir member**                    | Glance up and know: what are we singing, what is next, when does it change                    |
| **Music director / DAW operator**   | Mark the arrangement on the timeline once; take over by hand when the service goes off script |
| **Media operator (ProPresenter)**   | Add one source to their layouts, place it, and forget it; lyrics unaffected                   |
| **Worship leader / choir director** | Change the plan live (repeat, skip, hold) and have the screen follow                          |

## 5. Scope

### In scope (version 1)

- Ableton Live as the source, through a Max for Live device.
- ProPresenter 7 as the destination, through an NDI video source with transparency.
- macOS and Windows for the StageCue app. The church runs entirely on Mac; Windows is supported for other users.
- Music computer and media computer on the same local network, Wi-Fi or Ethernet, no internet needed. One computer running everything also works.

### Out of scope (version 1)

- Building or storing songs, arrangements, or setlists inside StageCue. The DAW is the source of truth.
- Lyrics. ProPresenter owns them.
- Controlling ProPresenter, the DAW, or playback.
- Logic Pro. See open question 1.

## 6. Requirements

### 6.1 Marking up a song (in Ableton)

| ID  | Requirement                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| M1  | A locator on the arrangement timeline marks where a section starts. Its name is the section name, such as `Chorus`. |
| M2  | Text after a `\|` is an extra line for the choir: `Chorus \| Full choir`.                                           |
| M3  | A locator named `-` (or with an empty name) clears the band from that point, for example between songs.             |
| M4  | Adding, moving, or renaming locators while the set is open takes effect immediately.                                |

### 6.2 What the choir sees (the band)

| ID  | Requirement                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| B1  | The current section name, large and centred.                                                                                    |
| B2  | The extra line under it, when the locator has one.                                                                              |
| B3  | The next section's name.                                                                                                        |
| B4  | Bars remaining until the next section (“in 3 bars”).                                                                            |
| B5  | In the last bar before the next section, a large countdown on each beat (4, 3, 2, 1), pulsing in time.                          |
| B6  | A progress bar across the full width of the band that fills through the current section and is full as the next section starts. |
| B7  | Countdown, pulse, and progress follow Ableton's tempo and time signature, including tempo changes, to within one video frame.   |
| B8  | Before the first locator, the band shows the first section as “Coming up”, with the countdown.                                  |
| B9  | Every line keeps its space, so the band does not jump in size as sections change.                                               |
| B10 | The layout reads at a distance: high contrast, few elements, one centred column.                                                |

### 6.3 Media control

The screen follows Ableton; nobody steps through sections by hand. When the service goes off script, the playback engineer stops Ableton or plays only the click, and the media team decides whether the band stays on screen.

| ID  | Requirement                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ |
| D1  | Hide band: take the band off the output, whatever Ableton does. The preview shows it faded, labelled as hidden.    |
| D2  | Show band: put it back, showing wherever Ableton is now.                                                           |
| D3  | Hiding lasts until someone shows the band again, or the engine restarts.                                           |
| D4  | Loops: inside an Ableton loop, the band shows where the loop goes back to and counts down to the loop end.         |
| D5  | Director controls (hold, next, previous, select) are out of scope for the media app; the engine keeps them unused. |

### 6.4 Style (set once, used everywhere)

| ID  | Requirement                                                                                      |
| --- | ------------------------------------------------------------------------------------------------ |
| S1  | Background, text, and highlight colours; background opacity; text size; top or bottom placement. |
| S2  | Each element can be turned off: extra line, next section, countdown, progress bar.               |
| S3  | The style is stored centrally and applies on every StageCue computer.                            |
| S4  | A live preview, with a looping sample when nothing is playing.                                   |

### 6.5 ProPresenter output

| ID  | Requirement                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------- |
| P1  | StageCue publishes a 1920×1080 NDI source named “StageCue” with a transparent background.                           |
| P2  | The operator adds it as a video input in ProPresenter 7 and places it above the lyrics in any look, layer, or prop. |
| P3  | Video never crosses the network: the band is drawn on the media computer.                                           |

### 6.6 Reliability

| ID  | Requirement                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------- |
| R1  | Works with no internet connection.                                                                                         |
| R2  | If Ableton or the network drops, the band keeps the last section, stops counting, and resumes when the connection returns. |
| R3  | Late or bunched network updates do not make the countdown stutter.                                                         |
| R4  | Nothing a client sends can crash the engine; malformed messages are rejected.                                              |
| R5  | Reconnection is automatic everywhere. Nobody has to restart anything after a drop.                                         |

## 7. Experience walkthrough (a Sunday)

1. **Before service.** The music director opens the Live set. Each song already has locators: `Intro`, `Verse 1 | Lead only`, `Chorus | Full choir`, `Bridge | Men first`. The StageCue device on the master track shows “Connected”.
2. **Media computer.** StageCue starts with the computer. ProPresenter's layouts already include the StageCue NDI input above the lyrics.
3. **During the song.** The choir sees VERSE 1 / Lead only, with “Next CHORUS in 4 bars”. In the last bar, 4, 3, 2, 1 pulses on the beat, the bar fills, and CHORUS appears exactly on the downbeat.
4. **Off script.** The pastor asks for the chorus again. The playback engineer stops Ableton, or solos the click; the media operator presses Hide band. When Ableton is back in step, they press Show band.

## 8. Success measures

- Choir entries on section changes are on time in rehearsal without the director cueing by hand.
- Set-up for a new song takes under two minutes (adding locators).
- Zero incidents of the band showing a wrong section during a service.
- Media operator set-up is one-time: add the NDI input once.

## 9. Open questions

1. **Logic Pro.** Logic does not appear to let plugins or scripts read marker names. Options: a StageCue plugin with its own arrangement grid, importing exported markers, or MIDI clock plus a marker list. Decide whether Logic matters for version 1 after Ableton is proven.
2. **Pairing.** Today any computer on the church network can connect to the engine. Add a pairing code before using it on a shared network.
3. **Several songs in one set.** Locators across a whole set work today. Should the band show the song title, or treat the end of a song specially?
4. **Transparency in ProPresenter.** Confirm whether the NDI input must be set to straight or premultiplied alpha.
5. **Session View.** Teams that launch scenes rather than play the arrangement have no locators. Out of scope unless needed.

## 10. Milestones

| #   | Milestone                                                            | State |
| --- | -------------------------------------------------------------------- | ----- |
| 1   | Engine, protocol, countdown, progress, media control, app, simulator | Done  |
| 2   | NDI output from the app, verified in NDI Studio Monitor              | Next  |
| 3   | Max for Live device, verified in Ableton                             | Next  |
| 4   | End-to-end test on one Mac: Ableton, StageCue, ProPresenter 7        |       |
| 5   | Two-computer test over Wi-Fi, with deliberate drops                  |       |
| 6   | Installers for macOS and Windows, engine started by the app          |       |
| 7   | Rehearsal, then first Sunday                                         |       |
