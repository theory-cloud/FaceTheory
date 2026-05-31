import assert from 'node:assert/strict';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import {
  AsyncStateBoundary,
  Button,
  Link,
  LoadingState,
  Skeleton,
  Spinner,
} from '../../src/react/responsive-primitives/index.js';
import { RESPONSIVE_PRIMITIVES_CSS } from '../../src/responsive-primitives/index.js';

const app = createFaceApp({
  faces: [
    createReactFace({
      route: '/',
      mode: 'ssr',
      render: () =>
        React.createElement('main', { className: 'responsive-example' }, [
          React.createElement(Spinner, {
            key: 'spinner',
            label: 'Loading control plane data',
            size: 'sm',
          }),
          React.createElement(Skeleton, {
            key: 'skeleton',
            width: 'two-thirds',
            height: 'lg',
          }),
          React.createElement(LoadingState, {
            key: 'loading',
            message: 'Loading tenants',
          }),
          React.createElement(AsyncStateBoundary, {
            key: 'boundary',
            state: 'empty',
            empty: React.createElement('p', null, 'No tenants yet'),
          }),
          React.createElement(
            Button,
            {
              key: 'button',
              loading: true,
              loadingPlacement: 'replace-prefix',
            },
            'Create tenant',
          ),
          React.createElement(
            Link,
            {
              key: 'link',
              href: '/tenants',
            },
            'View tenants',
          ),
        ]),
      renderOptions: {
        styleTags: [{ cssText: RESPONSIVE_PRIMITIVES_CSS }],
      },
    }),
  ],
});

const response = await app.handle({ method: 'GET', path: '/' });
const html = new TextDecoder().decode(response.body as Uint8Array);

assert.equal(response.status, 200);
assert.match(html, /facetheory-rcp-spinner/);
assert.match(html, /facetheory-rcp-skeleton--width-two-thirds/);
assert.match(html, /aria-busy="true"/);
assert.match(html, /href="\/tenants"/);
assert.doesNotMatch(html, /style="/);

console.log('responsive primitives React example rendered');
console.log(`bytes=${html.length}`);
