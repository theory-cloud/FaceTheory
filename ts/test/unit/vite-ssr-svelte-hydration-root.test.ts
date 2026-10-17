import assert from 'node:assert/strict';
import test from 'node:test';

import { selectHydrationRoot } from '../../examples/vite-ssr-svelte/src/select-hydration-root.js';

const app: symbol = Symbol('App');
const appBrand: symbol = Symbol('AppBrand');

test('vite SSR svelte example: client hydrates the component the server rendered per route', () => {
  assert.equal(selectHydrationRoot('/brand', app, appBrand), appBrand);
  assert.equal(selectHydrationRoot('/', app, appBrand), app);
  assert.equal(selectHydrationRoot('/dashboard', app, appBrand), app);
});
