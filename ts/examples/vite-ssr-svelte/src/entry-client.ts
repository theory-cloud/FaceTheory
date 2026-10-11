import { hydrate } from 'svelte';

import App from './App.svelte';
import AppBrand from './AppBrand.svelte';
import { selectHydrationRoot } from './select-hydration-root.js';
import logoUrl from './logo.svg';
import './styles.css';

type HydrationPayload = { message?: string } | null;

function readHydrationData(): HydrationPayload {
  const el = document.getElementById('__FACETHEORY_DATA__');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as HydrationPayload;
  } catch {
    return null;
  }
}

const data = readHydrationData();
document.body.setAttribute('data-logo', logoUrl);

hydrate(selectHydrationRoot(window.location.pathname, App, AppBrand), {
  target: document.body,
  props: { message: data?.message ?? 'from client' },
});
