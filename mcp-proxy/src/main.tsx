import React from 'react'
import { createRoot } from 'react-dom/client'

const App = () => {
  return (
    <div>
      <h1>MCP Proxy</h1>
      <p>Proxy server for MCP tools</p>
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<App />)
}
