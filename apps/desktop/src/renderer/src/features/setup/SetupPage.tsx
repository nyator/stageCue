import { useState } from 'react'
import { useCueView } from '../../live/use-cue-view'
import { useOutputStatus } from '../../live/use-output-status'
import { useReducedMotion } from '../../live/use-reduced-motion'
import { useScreens } from '../../live/use-screens'
import { PageHeader } from '../../ui/page'
import { AbletonPanel, BrowsersPanel, EnginePanel, ProPresenterPanel, ScreensPanel } from './panels'
import { PANEL_ID, tabId, type NodeId } from './signal'
import { SignalPath } from './SignalPath'
import { useSignalPath } from './use-signal-path'

/**
 * Setup draws StageCue as the signal path it carries: Ableton, the engine,
 * and every output, each lit as it is right now. Choosing a box opens what it
 * is and how to connect it. See apps/desktop/DESIGN.md.
 */
export function SetupPage() {
  const path = useSignalPath()
  const { view, live } = useCueView()
  const output = useOutputStatus()
  const screens = useScreens()
  const reducedMotion = useReducedMotion()
  const playing = live?.state.transport?.playing ?? false

  // Open on the first broken link once; after that the volunteer's choice stays.
  const [chosen, setChosen] = useState<NodeId | null>(null)
  const selected = chosen ?? path.needsAttention ?? 'ableton'

  return (
    <div className="mx-auto flex max-w-[90rem] flex-col px-8 py-6">
      <PageHeader title="Setup" status={path.verdict.text} tone={path.verdict.tone} />

      <SignalPath
        nodes={path.nodes}
        selected={selected}
        onSelect={setChosen}
        beatPhase={playing ? view.beatPhase : null}
        reducedMotion={reducedMotion}
      />

      <div
        key={selected}
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabId(selected)}
        tabIndex={0}
        className="enter mt-10 border-t border-line-soft pt-8 focus-visible:outline-none"
      >
        {selected === 'ableton' ? <AbletonPanel daw={live?.state.daw ?? null} /> : null}
        {selected === 'engine' ? <EnginePanel /> : null}
        {selected === 'propresenter' ? <ProPresenterPanel output={output} /> : null}
        {selected === 'screens' ? <ScreensPanel screens={screens} /> : null}
        {selected === 'browsers' ? <BrowsersPanel /> : null}
      </div>
    </div>
  )
}
