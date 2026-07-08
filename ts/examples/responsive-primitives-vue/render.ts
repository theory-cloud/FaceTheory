import assert from 'node:assert/strict';

import { createFaceApp } from '@theory-cloud/facetheory';
import { createVueFace, h } from '@theory-cloud/facetheory/vue';
import {
  AsyncStateBoundary,
  Button,
  Link,
  LoadingState,
  Skeleton,
  Spinner,
} from '@theory-cloud/facetheory/vue/responsive-primitives';
import { RESPONSIVE_PRIMITIVES_CSS } from '@theory-cloud/facetheory/responsive-primitives';

const app = createFaceApp({
  faces: [
    createVueFace({
      route: '/',
      mode: 'ssr',
      render: () =>
        h('main', { class: 'responsive-example' }, [
          h(Spinner, { label: 'Loading control plane data', size: 'sm' }),
          h(Skeleton, { width: 'two-thirds', height: 'lg' }),
          h(LoadingState, { message: 'Loading tenants' }),
          h(
            AsyncStateBoundary,
            { state: 'empty' },
            { empty: () => h('p', null, 'No tenants yet') },
          ),
          h(
            Button,
            { loading: true, loadingPlacement: 'replace-prefix' },
            { default: () => 'Create tenant' },
          ),
          h(Link, { href: '/tenants' }, { default: () => 'View tenants' }),
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

console.log('responsive primitives Vue example rendered');
console.log(`bytes=${html.length}`);
