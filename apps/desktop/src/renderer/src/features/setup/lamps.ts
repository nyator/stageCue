import type { Lamp } from './signal'

/** One colour per lamp state, shared by Setup's routing and the header's strip. */
export const LAMP_COLOUR: Record<Lamp, string> = {
  live: 'bg-cue',
  ready: 'bg-cue/70',
  waiting: 'bg-warn',
  failing: 'bg-alert',
  off: 'bg-line',
}

export const STATUS_COLOUR: Record<Lamp, string> = {
  live: 'text-cue',
  ready: 'text-cue/80',
  waiting: 'text-warn',
  failing: 'text-alert',
  off: 'text-faint',
}
