import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { recordAppCommit } from './services/framework/RenderCounter'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Profiler id="app" onRender={() => recordAppCommit()}>
      <App />
    </React.Profiler>
  </React.StrictMode>,
)
