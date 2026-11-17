import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import './styles.css'
import './a11y.css'
createRoot(document.getElementById('root')).render(<AuthProvider><App /></AuthProvider>)

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !import.meta.env.DEV) navigator.serviceWorker.register('/sw.js').catch(() => {})
