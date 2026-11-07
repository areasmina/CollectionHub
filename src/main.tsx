import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { loadRate } from './lib/prices';
import { authReturn } from './lib/authreturn';
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
import './styles.css';
import './ui.css'; // THE OVERHAUL: tokens + the 7 parts; loaded last, so it wins over the old rules it replaces

// The service worker reloads the page when a new version takes over. Right after a sign-in redirect that reload would
// throw away the session in the URL, so wait until Supabase has saved it.
const startSW = () => registerSW({ immediate: true });
// (Supabase is loaded only on that return; every other visit skips it at startup.)
if (authReturn?.ok)
  import('./lib/legacysync')
    .then(({ supabase }) => supabase?.auth.getSession())
    .catch(() => {})
    .finally(startSW);
else startSW();
// Ask the browser not to clear this site's storage under space pressure (keeps binders and the sign-in).
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
