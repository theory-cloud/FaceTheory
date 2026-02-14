import { createSSRApp, h } from 'vue';

import { App } from './app.js';
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
const container = document.getElementById('root');

if (container) {
  container.setAttribute('data-logo', logoUrl);
  const app = createSSRApp({
    render: () => h(App, { message: data?.message ?? 'from client' }),
  });
  app.mount(container);
}
