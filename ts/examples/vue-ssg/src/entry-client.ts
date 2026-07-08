import { createSSRApp, h } from 'vue';

import { App, type VueSsgAppProps } from './app.js';
import './styles.css';

function readHydrationData(): VueSsgAppProps | null {
  const el = document.getElementById('__FACETHEORY_DATA__');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as VueSsgAppProps;
  } catch {
    return null;
  }
}

const data = readHydrationData();
const container = document.getElementById('root');

if (container && data) {
  const app = createSSRApp({ render: () => h(App, data) });
  app.mount(container);
}
