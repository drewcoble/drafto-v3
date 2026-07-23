import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App'

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

if (!convexUrl) {
  throw new Error(
    'VITE_CONVEX_URL is not set. Copy .env.local.example to .env.local and fill it in ' +
      '(the URL is printed when you run `npx convex dev`).',
  )
}

const convex = new ConvexReactClient(convexUrl)

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <MantineProvider>
        <App />
      </MantineProvider>
    </ConvexProvider>
  </React.StrictMode>,
)
