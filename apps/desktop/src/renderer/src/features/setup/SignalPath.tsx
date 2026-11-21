import { useRef, type KeyboardEvent } from 'react'
import { LAMP_COLOUR, STATUS_COLOUR } from './lamps'
import { NODE_IDS, PANEL_ID, tabId, type NodeId, type NodeState } from './signal'

const TITLES: Record<NodeId, string> = {
  ableton: 'Ableton',
  engine: 'StageCue engine',
  propresenter: 'ProPresenter',
  screens: 'Screens on this computer',
  browsers: 'Browsers on the network',
}

const OUTPUTS = ['propresenter', 'screens', 'browsers'] as const

const wire = (live: boolean) => (live ? 'bg-cue/60' : 'bg-line-soft')

/** Brightest on the beat, fading before the next one: the same curve as the band's pulse. */
const beatGlow = (phase: number) => (1 - phase) ** 3

interface SignalPathProps {
  nodes: Record<NodeId, NodeState>
  selected: NodeId
  onSelect: (id: NodeId) => void
  /** 0 on each of Ableton's beats, rising to 1. Null while Ableton is not playing. */
  beatPhase: number | null
  reducedMotion: boolean
}

/**
 * Ableton → engine → outputs, drawn like a desk's routing. The boxes are tabs
 * for the panel below. While Ableton plays, a pulse travels each live cable
 * once per beat.
 */
export function SignalPath({
  nodes,
  selected,
  onSelect,
  beatPhase,
  reducedMotion,
}: SignalPathProps) {
  const refs = useRef<Partial<Record<NodeId, HTMLButtonElement | null>>>({})
  const pulse = reducedMotion ? null : beatPhase
  const carries = (id: NodeId) => nodes[id].lamp === 'live'
  const linked = nodes.ableton.lamp === 'live' || nodes.ableton.lamp === 'ready'
  const anyOutput = carries('propresenter') || carries('screens') || carries('browsers')

  const move = (event: KeyboardEvent) => {
    const index = NODE_IDS.indexOf(selected)
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? NODE_IDS[(index + 1) % NODE_IDS.length]
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? NODE_IDS[(index - 1 + NODE_IDS.length) % NODE_IDS.length]
          : event.key === 'Home'
            ? NODE_IDS[0]
            : event.key === 'End'
              ? NODE_IDS[NODE_IDS.length - 1]
              : null
    if (!target) return
    event.preventDefault()
    onSelect(target)
    refs.current[target]?.focus()
  }

  const node = (id: NodeId) => (
    <Node
      key={id}
      id={id}
      tall={id === 'ableton' || id === 'engine'}
      state={nodes[id]}
      selected={selected === id}
      glow={pulse !== null && nodes[id].lamp === 'live' ? beatGlow(pulse) : null}
      onSelect={() => onSelect(id)}
      buttonRef={(element) => {
        refs.current[id] = element
      }}
    />
  )

  return (
    <div>
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_3.5rem_minmax(0,1.2fr)] text-xs font-medium text-muted">
        <span>Source</span>
        <span />
        <span>StageCue</span>
        <span />
        <span>Outputs</span>
      </div>
      <div
        role="tablist"
        aria-label="Signal path"
        aria-orientation="horizontal"
        onKeyDown={move}
        className="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)_3.5rem_minmax(0,1.2fr)] items-stretch"
      >
        {node('ableton')}
        <Cable live={linked} pulse={linked ? pulse : null} />
        {node('engine')}

        {/* Branch: one trunk from the engine, a stub to each output. Same rows and gap as the outputs, so every cable meets its box at the centre. */}
        <div className="grid h-full grid-rows-3 gap-2" aria-hidden>
          {OUTPUTS.map((id, row) => (
            <div key={id} className="relative">
              {row === 0 ? (
                <span
                  className={`absolute top-1/2 -bottom-2 left-[45%] w-px ${wire(carries('propresenter'))}`}
                />
              ) : null}
              {row === 1 ? (
                <>
                  <span className={`absolute top-1/2 left-0 h-px w-[45%] ${wire(anyOutput)}`} />
                  <span
                    className={`absolute top-0 left-[45%] h-1/2 w-px ${wire(carries('propresenter'))}`}
                  />
                  <span
                    className={`absolute top-1/2 bottom-0 left-[45%] w-px ${wire(carries('browsers'))}`}
                  />
                </>
              ) : null}
              {row === 2 ? (
                <span
                  className={`absolute -top-2 bottom-1/2 left-[45%] w-px ${wire(carries('browsers'))}`}
                />
              ) : null}
              <span className="absolute inset-y-0 right-0 left-[45%]">
                <Cable live={carries(id)} pulse={carries(id) ? pulse : null} />
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-rows-3 gap-2">
          {node('propresenter')}
          {node('screens')}
          {node('browsers')}
        </div>
      </div>
    </div>
  )
}

function Cable({ live, pulse }: { live: boolean; pulse: number | null }) {
  return (
    <span className="relative block h-full min-h-4 w-full" aria-hidden>
      <span
        className={`absolute inset-x-0 top-1/2 h-px transition-colors duration-200 ${wire(live)}`}
      />
      {pulse !== null ? (
        // The wrapper spans the cable; translating it by the beat phase carries the dot across.
        <span
          className="absolute inset-0"
          style={{ transform: `translateX(${(pulse * 100).toFixed(2)}%)` }}
        >
          <span
            className="absolute top-1/2 left-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cue shadow-[0_0_8px_var(--color-cue)]"
            style={{ opacity: 1 - pulse * 0.75 }}
          />
        </span>
      ) : null}
    </span>
  )
}

interface NodeProps {
  id: NodeId
  /** Source and engine span the outputs' height, with a foot line at the bottom. */
  tall: boolean
  state: NodeState
  selected: boolean
  glow: number | null
  onSelect: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
}

function Node({ id, tall, state, selected, glow, onSelect, buttonRef }: NodeProps) {
  return (
    <button
      ref={buttonRef}
      id={tabId(id)}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={PANEL_ID}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={`group relative flex w-full min-w-0 flex-col rounded-lg border px-3.5 py-3 text-left transition-[background-color,border-color,translate,scale] duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.99] ${
        selected
          ? 'border-cue/50 bg-raised'
          : 'border-line-soft bg-panel hover:border-line hover:bg-raised/70'
      }`}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={`lamp-ring relative size-2.5 shrink-0 rounded-full ${LAMP_COLOUR[state.lamp]}`}
          style={
            glow !== null
              ? {
                  opacity: 0.55 + 0.45 * glow,
                  boxShadow: `0 0 ${(4 + 8 * glow).toFixed(1)}px var(--color-cue)`,
                }
              : undefined
          }
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{TITLES[id]}</span>
        <span className={`shrink-0 text-xs font-medium ${STATUS_COLOUR[state.lamp]}`}>
          {state.status}
        </span>
      </span>
      <span
        className={`mt-1 block truncate pl-5 text-xs text-faint ${id === 'engine' ? 'font-mono' : ''}`}
      >
        {state.detail}
      </span>
      {tall && state.foot ? (
        <span className="mt-auto block truncate border-t border-line-soft pt-2.5 pl-5 text-xs text-muted">
          {state.foot}
        </span>
      ) : null}
    </button>
  )
}
