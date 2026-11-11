import '@fontsource-variable/geist'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { connection } from './connection'
import { ScreenApp } from './ScreenApp'
import './styles.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root is missing.')
}

connection.start()
createRoot(rootElement).render(
  <StrictMode>
    <ScreenApp />
  </StrictMode>,
)
