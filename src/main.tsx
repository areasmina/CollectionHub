import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { hasLeaveGuard } from './lib/nav';
import { loadRate } from './lib/prices';
// Registers the change tracker before anything writes, so automatic sync sees every edit.
import './lib/syncstate';
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
import './legacy.css';
import './tokens.css';
import './app.css';

// Updates (Nov 28): an installed app left open in the background kept showing an old version. It now also looks for a new
// version whenever it comes back to the screen (and hourly while open), but never while something unsaved is open, since
// an update reloads the page.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    let lastCheck = Date.now();
    const check = () => {
      if (hasLeaveGuard() || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 60 * 60_000);
  },
});
// Ask the browser not to clear this site's storage under space pressure (keeps binders and sync).
navigator.storage?.persist?.().catch(() => {});
// Show the app right away (the last saved USD→CAD rate, else a fallback), then render again once today's rate is in.
const root = createRoot(document.getElementById('root')!);
const render = () =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
render();
loadRate().then(render);
