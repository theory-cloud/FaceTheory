import { hydrate } from 'svelte';

import '@theory-cloud/facetheory-svelte-library-example/styles.css';

import App from './App.svelte';
import './styles.css';

type HydrationPayload =
  | {
      title?: string;
      intro?: string;
      initialCount?: number;
    }
  | null;

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

hydrate(App, {
  target: document.body,
  props: {
    title: data?.title ?? 'Hydrated library panel',
    intro: data?.intro ?? 'Hydrated external library content',
    initialCount: data?.initialCount ?? 0,
  },
});
