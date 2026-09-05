import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { AppErrorBoundary } from './ui/AppErrorBoundary';
import './ui/styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Escape Velocity root element is missing.');

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

window.__EV_BOOTED__ = true;
