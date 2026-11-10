import type { DatabaseSync } from 'node:sqlite'
import type { SectionType, VocalPart } from '@stagecue/arrangement'
import { createArrangement, saveArrangement } from './repositories/arrangements.ts'
import { addPerformance, createSetlist } from './repositories/setlists.ts'
import { createSong, saveSections } from './repositories/songs.ts'
import { transaction } from './repositories/support.ts'

/*
 * Public-domain hymns in arrangements a worship team might actually use.
 * Titles and structure only: lyrics stay in ProPresenter.
 */

type SampleSection = [
  name: string,
  type: SectionType,
  bars: number,
  parts: VocalPart[],
  instructions?: string,
]
type SampleEntry = [section: string, repeat?: number, instructions?: string]

interface SampleSong {
  title: string
  artist: string
  key: string
  tempo: number
  meter: [number, 1 | 2 | 4 | 8 | 16 | 32]
  sections: SampleSection[]
  arrangements: { name: string; startBar?: number; entries: SampleEntry[] }[]
}

const SONGS: SampleSong[] = [
  {
    title: 'Amazing Grace',
    artist: 'John Newton',
    key: 'G',
    tempo: 72,
    meter: [3, 4],
    sections: [
      ['Intro', 'intro', 4, ['instrumental'], 'Choir silent. Stand on bar 3.'],
      ['Verse 1', 'verse', 16, ['lead'], 'Lead only. Choir hums on "oo".'],
      ['Verse 2', 'verse', 16, ['soprano', 'alto'], 'Sopranos and altos in unison.'],
      ['Interlude', 'interlude', 4, ['instrumental'], 'Choir silent. Watch for the entry cue.'],
      ['Verse 3', 'verse', 16, ['full_choir'], 'Full choir in four parts.'],
      ['Verse 4', 'verse', 16, ['full_choir'], 'Full choir, build to forte.'],
      ['Tag', 'tag', 8, ['full_choir'], 'Repeat the last line. Slow on the final pass.'],
      ['Ending', 'ending', 4, ['full_choir'], 'Hold the final chord until the cut-off.'],
    ],
    arrangements: [
      {
        name: 'Sunday morning',
        startBar: 3,
        entries: [
          ['Intro'],
          ['Verse 1'],
          ['Verse 2'],
          ['Interlude'],
          ['Verse 3'],
          ['Verse 4'],
          ['Tag', 2],
          ['Ending'],
        ],
      },
      { name: 'Short', entries: [['Intro'], ['Verse 1'], ['Verse 3'], ['Ending']] },
    ],
  },
  {
    title: 'Holy, Holy, Holy',
    artist: 'Reginald Heber',
    key: 'D',
    tempo: 84,
    meter: [4, 4],
    sections: [
      ['Intro', 'intro', 4, ['instrumental'], 'Choir silent.'],
      ['Verse 1', 'verse', 16, ['full_choir'], 'Full choir in unison.'],
      ['Verse 2', 'verse', 16, ['full_choir'], 'Full choir in four parts.'],
      ['Verse 3', 'verse', 16, ['soprano', 'alto'], 'Women only, softly.'],
      ['Instrumental', 'instrumental', 8, ['instrumental'], 'Choir silent. Key change to E.'],
      ['Verse 4', 'verse', 16, ['full_choir'], 'Full choir. Sopranos take the descant.'],
      ['Ending', 'ending', 4, ['full_choir'], 'Broaden. Hold "Trinity".'],
    ],
    arrangements: [
      {
        name: 'Sunday morning',
        entries: [
          ['Intro'],
          ['Verse 1'],
          ['Verse 2'],
          ['Verse 3'],
          ['Instrumental'],
          ['Verse 4'],
          ['Ending'],
        ],
      },
    ],
  },
  {
    title: 'It Is Well with My Soul',
    artist: 'Horatio Spafford',
    key: 'C',
    tempo: 70,
    meter: [4, 4],
    sections: [
      ['Intro', 'intro', 4, ['instrumental'], 'Choir silent.'],
      ['Verse 1', 'verse', 8, ['lead'], 'Lead only.'],
      ['Verse 2', 'verse', 8, ['soprano', 'alto', 'tenor', 'bass'], 'Four parts, mezzo-piano.'],
      ['Verse 3', 'verse', 8, ['full_choir'], 'Full choir.'],
      ['Chorus', 'chorus', 8, ['full_choir'], 'Full choir in four parts.'],
      ['Bridge', 'bridge', 8, ['tenor', 'bass'], 'Men first time, add women on the repeat.'],
      ['Vamp', 'vamp', 4, ['instrumental'], 'Band vamps. Choir waits for the director.'],
      ['Ending', 'ending', 4, ['full_choir'], 'Slow down. Final "It is well" a cappella.'],
    ],
    arrangements: [
      {
        name: 'Sunday morning',
        entries: [
          ['Intro'],
          ['Verse 1'],
          ['Chorus'],
          ['Verse 2'],
          ['Chorus'],
          ['Bridge', 2],
          ['Vamp', 2],
          ['Verse 3'],
          ['Chorus', 2, 'Second time: key change up a step.'],
          ['Ending'],
        ],
      },
    ],
  },
  {
    title: 'Blessed Assurance',
    artist: 'Fanny Crosby',
    key: 'D',
    tempo: 104,
    meter: [4, 4],
    sections: [
      ['Intro', 'intro', 4, ['instrumental'], 'Choir silent. Clap on 2 and 4.'],
      ['Verse 1', 'verse', 8, ['full_choir'], 'Full choir in unison.'],
      ['Verse 2', 'verse', 8, ['soprano', 'alto'], 'Women only.'],
      ['Verse 3', 'verse', 8, ['full_choir'], 'Full choir in four parts.'],
      ['Chorus', 'chorus', 8, ['full_choir'], 'Full choir. Altos echo "this is my story".'],
      ['Ending', 'ending', 4, ['full_choir'], 'Big finish. Watch for the cut-off.'],
    ],
    arrangements: [
      {
        name: 'Upbeat',
        entries: [
          ['Intro'],
          ['Verse 1'],
          ['Chorus'],
          ['Verse 2'],
          ['Chorus'],
          ['Verse 3'],
          ['Chorus', 2],
          ['Ending'],
        ],
      },
    ],
  },
  {
    title: 'Come, Thou Fount of Every Blessing',
    artist: 'Robert Robinson',
    key: 'D',
    tempo: 92,
    meter: [3, 4],
    sections: [
      ['Intro', 'intro', 8, ['instrumental'], 'Choir silent.'],
      ['Verse 1', 'verse', 16, ['full_choir'], 'Full choir in unison.'],
      ['Verse 2', 'verse', 16, ['full_choir'], 'Full choir in four parts.'],
      ['Instrumental', 'instrumental', 8, ['instrumental'], 'Choir silent.'],
      ['Verse 3', 'verse', 16, ['full_choir'], 'Full choir. Build from piano to forte.'],
      ['Ending', 'ending', 4, ['full_choir'], 'Hold the final note.'],
    ],
    arrangements: [
      {
        name: 'Evening',
        entries: [['Intro'], ['Verse 1'], ['Verse 2'], ['Instrumental'], ['Verse 3'], ['Ending']],
      },
    ],
  },
  {
    title: 'O Come, All Ye Faithful',
    artist: 'John Francis Wade',
    key: 'G',
    tempo: 96,
    meter: [4, 4],
    sections: [
      ['Intro', 'intro', 4, ['instrumental'], 'Choir silent.'],
      ['Verse 1', 'verse', 8, ['full_choir'], 'Full choir in unison.'],
      ['Verse 2', 'verse', 8, ['soprano', 'alto'], 'Women only.'],
      ['Verse 3', 'verse', 8, ['full_choir'], 'Full choir in four parts.'],
      ['Refrain', 'chorus', 8, ['full_choir'], 'Full choir.'],
      ['Ending', 'ending', 4, ['full_choir'], 'Sopranos take the descant to the end.'],
    ],
    arrangements: [
      {
        name: 'Carol service',
        entries: [
          ['Intro'],
          ['Verse 1'],
          ['Refrain'],
          ['Verse 2'],
          ['Refrain'],
          ['Verse 3'],
          ['Refrain', 2, 'Last time: sopranos on the descant.'],
          ['Ending'],
        ],
      },
    ],
  },
  {
    title: 'Hark! The Herald Angels Sing',
    artist: 'Charles Wesley',
    key: 'F',
    tempo: 100,
    meter: [4, 4],
    sections: [
      ['Intro', 'intro', 4, ['instrumental'], 'Choir silent.'],
      ['Verse 1', 'verse', 16, ['full_choir'], 'Full choir in four parts.'],
      ['Verse 2', 'verse', 16, ['tenor', 'bass'], 'Men only.'],
      ['Verse 3', 'verse', 16, ['full_choir'], 'Full choir, fortissimo.'],
      ['Ending', 'ending', 4, ['full_choir'], 'Hold the final chord.'],
    ],
    arrangements: [
      {
        name: 'Carol service',
        entries: [['Intro'], ['Verse 1'], ['Verse 2'], ['Verse 3'], ['Ending']],
      },
    ],
  },
]

const SETLISTS: { name: string; date: string; songs: [title: string, arrangement: string][] }[] = [
  {
    name: 'Harvest Thanksgiving',
    date: '2026-10-04',
    songs: [
      ['Come, Thou Fount of Every Blessing', 'Evening'],
      ['Blessed Assurance', 'Upbeat'],
    ],
  },
  {
    name: 'Sunday Morning Service',
    date: '2026-11-15',
    songs: [
      ['Holy, Holy, Holy', 'Sunday morning'],
      ['Blessed Assurance', 'Upbeat'],
      ['It Is Well with My Soul', 'Sunday morning'],
      ['Amazing Grace', 'Sunday morning'],
    ],
  },
  {
    name: 'Evening Prayer',
    date: '2026-11-22',
    songs: [
      ['Come, Thou Fount of Every Blessing', 'Evening'],
      ['Amazing Grace', 'Short'],
    ],
  },
  {
    name: 'Carol Service',
    date: '2026-12-20',
    songs: [
      ['O Come, All Ye Faithful', 'Carol service'],
      ['Hark! The Herald Angels Sing', 'Carol service'],
    ],
  },
]

export function loadSampleLibrary(db: DatabaseSync): { songs: number; setlists: number } {
  return transaction(db, () => {
    const arrangementIds = new Map<string, { songId: string; arrangementId: string }>()

    for (const sample of SONGS) {
      const song = createSong(db, {
        title: sample.title,
        artist: sample.artist,
        defaultKey: sample.key,
        tempoBpm: sample.tempo,
        timeSignature: { numerator: sample.meter[0], denominator: sample.meter[1] },
        notes: null,
      })

      const { sections } = saveSections(
        db,
        song.id,
        sample.sections.map(([name, type, lengthBars, vocalParts, instructions]) => ({
          id: null,
          name,
          type,
          lengthBars,
          vocalParts,
          instructions: instructions ?? null,
          notes: null,
        })),
      )
      const sectionByName = new Map(sections.map((section) => [section.name, section]))

      for (const arrangement of sample.arrangements) {
        const created = createArrangement(db, {
          songId: song.id,
          name: arrangement.name,
          copyFromId: null,
        })
        saveArrangement(db, created.id, {
          name: arrangement.name,
          tempoBpm: null,
          songKey: null,
          notes: null,
          startBar: arrangement.startBar ?? 1,
          entries: arrangement.entries.map(([sectionName, repeatCount = 1, instructions]) => {
            const section = sectionByName.get(sectionName)
            if (!section) {
              throw new Error(`Sample arrangement refers to unknown section ${sectionName}`)
            }
            return {
              songSectionId: section.id,
              barsPerPass: section.lengthBars,
              repeatCount,
              vocalParts: null,
              instructions: instructions ?? null,
              notes: null,
            }
          }),
        })
        arrangementIds.set(`${sample.title}/${arrangement.name}`, {
          songId: song.id,
          arrangementId: created.id,
        })
      }
    }

    for (const sample of SETLISTS) {
      const setlist = createSetlist(db, {
        name: sample.name,
        serviceDate: sample.date,
        notes: null,
      })
      for (const [title, arrangementName] of sample.songs) {
        const ids = arrangementIds.get(`${title}/${arrangementName}`)
        if (!ids) {
          throw new Error(
            `Sample setlist refers to unknown arrangement ${title}/${arrangementName}`,
          )
        }
        addPerformance(db, { setlistId: setlist.id, ...ids })
      }
    }

    return { songs: SONGS.length, setlists: SETLISTS.length }
  })
}
