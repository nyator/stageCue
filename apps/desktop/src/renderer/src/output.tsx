import '@fontsource-variable/geist'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { engine } from './engine'
import { OutputView } from './features/display/OutputView'
import './output.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root is missing.')
}

engine.start()
createRoot(rootElement).render(
  <StrictMode>
    <OutputView />
  </StrictMode>,
)
