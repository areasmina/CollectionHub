import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { loadRate } from './lib/prices';
// Fonts ship with the app (also offline) instead of loading from Google.
import '@fontsource/anton/latin-400.css';
import '@fontsource/archivo/latin-400.css';
import '@fontsource/archivo/latin-600.css';
import '@fontsource/archivo/latin-800.css';
import '@fontsource/archivo-black/latin-400.css';
import '@fontsource/alfa-slab-one/latin-400.css';
import '@fontsource/black-ops-one/latin-400.css';
import '@fontsource/playfair-display/latin-900-italic.css';
import '@fontsource/shippori-mincho-b1/latin-800.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import '@fontsource/special-elite/latin-400.css';
import './styles.css';

registerSW({ immediate: true });
// Ask the browser not to clear this site's storage under space pressure (keeps binders and the sign-in).
navigator.storage?.persist?.().catch(() => {});
// Prices show in CAD: wait briefly for today's rate (never more than 1.5 s).
Promise.race([loadRate(), new Promise((r) => setTimeout(r, 1500))]).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
