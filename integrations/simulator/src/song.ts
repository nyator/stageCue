import type { Marker } from '@stagecue/arrangement'

/** A song laid out the way a worship team might mark it up in Ableton. Positions in quarter notes. */
export const SAMPLE_SET: { project: string; markers: Marker[]; endBeat: number } = {
  project: 'Simulated set',
  markers: [
    { name: 'Intro | Choir silent', beat: 0 },
    { name: 'Verse 1 | Lead only', beat: 16 },
    { name: 'Chorus | Full choir', beat: 48 },
    { name: 'Verse 2 | Sopranos and altos', beat: 80 },
    { name: 'Chorus | Full choir', beat: 112 },
    { name: 'Bridge | Men first, then everyone', beat: 144 },
    { name: 'Vamp | Wait for the director', beat: 176 },
    { name: 'Chorus | Key change', beat: 192 },
    { name: 'Ending | Hold the last chord', beat: 224 },
    { name: '-', beat: 240 },
  ],
  endBeat: 248,
}
