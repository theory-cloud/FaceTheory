import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';

import { App } from './app.js';
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
  hydrateRoot(
    container,
    React.createElement(App, { message: data?.message ?? 'from client' }),
  );
}
