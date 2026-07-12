import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthGate } from './lib/AuthGate.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate appName="Reporting">
      {(user, logout) => <App user={user} logout={logout} />}
    </AuthGate>
  </React.StrictMode>,
)
