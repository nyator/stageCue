import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { engine } from './engine'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root is missing.')
}

engine.start()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
