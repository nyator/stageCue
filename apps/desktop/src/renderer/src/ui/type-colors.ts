import type { SectionType } from '@stagecue/arrangement'

/** Static class names so Tailwind can see them. */
export const typeBackground: Record<SectionType, string> = {
  intro: 'bg-type-intro',
  verse: 'bg-type-verse',
  pre_chorus: 'bg-type-pre_chorus',
  chorus: 'bg-type-chorus',
  bridge: 'bg-type-bridge',
  instrumental: 'bg-type-instrumental',
  vamp: 'bg-type-vamp',
  tag: 'bg-type-tag',
  interlude: 'bg-type-interlude',
  ending: 'bg-type-ending',
  other: 'bg-type-other',
}

export const typeText: Record<SectionType, string> = {
  intro: 'text-type-intro',
  verse: 'text-type-verse',
  pre_chorus: 'text-type-pre_chorus',
  chorus: 'text-type-chorus',
  bridge: 'text-type-bridge',
  instrumental: 'text-type-instrumental',
  vamp: 'text-type-vamp',
  tag: 'text-type-tag',
  interlude: 'text-type-interlude',
  ending: 'text-type-ending',
  other: 'text-type-other',
}
