import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { loadRate } from './lib/prices';
import './styles.css';

registerSW({ immediate: true });
// Prices show in CAD: wait briefly for today's rate (never more than 1.5 s).
Promise.race([loadRate(), new Promise((r) => setTimeout(r, 1500))]).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
