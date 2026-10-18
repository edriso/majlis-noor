import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerServiceWorker } from './hooks/useServiceWorker';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* The service worker keeps the app, the whole Mushaf's pages, and the page
   fonts already shown on the device, so a halaqa in a mosque with no signal
   still opens after one visit online. */
registerServiceWorker();
