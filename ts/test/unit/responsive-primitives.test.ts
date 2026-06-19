import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { JSDOM } from 'jsdom';
import * as React from 'react';
import { compile } from 'svelte/compiler';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import {
  AsyncStateBoundary as ReactAsyncStateBoundary,
  Button as ReactButton,
  Link as ReactLink,
  LoadingState as ReactLoadingState,
  Skeleton as ReactSkeleton,
  Spinner as ReactSpinner,
} from '../../src/react/responsive-primitives/index.js';
import {
  FACE_NAVIGATION_CLASSIFIER_SOURCE,
  classifyFaceNavigationAnchorClick,
} from '../../src/spa.js';
import { createSvelteFace } from '../../src/svelte/index.js';
import {
  RESPONSIVE_PRIMITIVE_CONTRACTS,
  RESPONSIVE_PRIMITIVES_CSS,
  RESPONSIVE_LINK_CLASSIFIER_SOURCE,
  forcedSafeLinkRel,
  handleResponsiveLinkClick,
  sanitizeResponsiveLinkHref,
  suppressButtonActivation,
} from '../../src/responsive-primitives/index.js';
import type { ResponsivePrimitiveName } from '../../src/responsive-primitives/index.js';
import { createVueFace, h } from '../../src/vue/index.js';
import {
  AsyncStateBoundary as VueAsyncStateBoundary,
  Button as VueButton,
  Link as VueLink,
  LoadingState as VueLoadingState,
  Skeleton as VueSkeleton,
  Spinner as VueSpinner,
} from '../../src/vue/responsive-primitives/index.js';

async function renderReactResponsive(): Promise<string> {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          React.createElement('main', null, [
            React.createElement(ReactSpinner, {
              key: 'spinner',
              label: 'Loading accounts',
              size: 'sm',
            }),
            React.createElement(ReactSkeleton, {
              key: 'skeleton',
              width: 'half',
              height: 'lg',
            }),
            React.createElement(
              ReactSkeleton,
              { key: 'gated', loading: false },
              React.createElement('strong', null, 'Loaded child'),
            ),
            React.createElement(ReactLoadingState, {
              key: 'loading',
              message: 'Loading fleet',
              fullscreen: true,
            }),
            React.createElement(ReactAsyncStateBoundary, {
              key: 'boundary',
              state: 'empty',
              empty: React.createElement('p', null, 'No records'),
            }),
            React.createElement(
              ReactButton,
              {
                key: 'button',
                loading: true,
                loadingPlacement: 'append',
              },
              'Save',
            ),
            React.createElement(
              ReactLink,
              {
                key: 'link',
                href: 'https://example.com/docs',
                target: '_blank',
              },
              'Docs',
            ),
            React.createElement(
              ReactLink,
              {
                id: 'react-unsafe-link',
                key: 'unsafe-link',
                href: 'java\nscript:alert(1)',
              },
              'Unsafe',
            ),
          ]),
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  return new TextDecoder().decode(resp.body as Uint8Array);
}

async function renderVueResponsive(): Promise<string> {
  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        render: () =>
          h('main', null, [
            h(VueSpinner, { label: 'Loading accounts', size: 'sm' }),
            h(VueSkeleton, { width: 'half', height: 'lg' }),
            h(
              VueSkeleton,
              { loading: false },
              { default: () => h('strong', null, 'Loaded child') },
            ),
            h(VueLoadingState, { message: 'Loading fleet', fullscreen: true }),
            h(
              VueAsyncStateBoundary,
              { state: 'empty' },
              { empty: () => h('p', null, 'No records') },
            ),
            h(
              VueButton,
              { loading: true, loadingPlacement: 'append' },
              { default: () => 'Save' },
            ),
            h(
              VueLink,
              { href: 'https://example.com/docs', target: '_blank' },
              { default: () => 'Docs' },
            ),
            h(
              VueLink,
              {
                id: 'vue-unsafe-link',
                href: 'data:text/html,<script>alert(1)</script>',
              },
              { default: () => 'Unsafe' },
            ),
          ]),
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  return new TextDecoder().decode(resp.body as Uint8Array);
}

async function renderSvelteComponent(
  componentName: string,
  props: Record<string, unknown>,
): Promise<string> {
  const componentPath = path.resolve(
    'src/svelte/responsive-primitives',
    `${componentName}.svelte`,
  );
  const source = await readFile(componentPath, 'utf8');
  const compiled = compile(source, {
    generate: 'server',
    filename: path.basename(componentPath),
  } as never);

  const dir = path.resolve('.tmp-facetheory-svelte-responsive-primitives');
  await mkdir(dir, { recursive: true });
  const coreUrl = pathToFileURL(
    path.resolve('src/responsive-primitives/index.ts'),
  ).href;
  const rewrittenCode = compiled.js.code.replace(
    /from\s+(['"])\.\.\/\.\.\/responsive-primitives\/index\.js\1/g,
    `from "${coreUrl}"`,
  );
  const file = path.join(
    dir,
    `${componentName}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
  );
  await writeFile(file, rewrittenCode, 'utf8');

  try {
    const mod = await import(pathToFileURL(file).href);
    const app = createFaceApp({
      faces: [
        createSvelteFace({
          route: '/',
          mode: 'ssr',
          render: () => ({ component: mod.default as unknown, props }),
        }),
      ],
    });
    const resp = await app.handle({ method: 'GET', path: '/' });
    return new TextDecoder().decode(resp.body as Uint8Array);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('responsive primitives: contract declares neutral/react/vue/svelte parity and reduced-motion CSS', () => {
  const expected: ResponsivePrimitiveName[] = [
    'Spinner',
    'Skeleton',
    'LoadingState',
    'AsyncStateBoundary',
    'Button',
    'Link',
  ];
  assert.deepEqual(
    RESPONSIVE_PRIMITIVE_CONTRACTS.map((contract) => contract.primitive),
    expected,
  );

  for (const contract of RESPONSIVE_PRIMITIVE_CONTRACTS) {
    assert.equal(contract.frameworks.neutral, true, contract.primitive);
    assert.equal(contract.frameworks.react, true, contract.primitive);
    assert.equal(contract.frameworks.vue, true, contract.primitive);
    assert.equal(contract.frameworks.svelte, true, contract.primitive);
  }

  assert.equal(
    RESPONSIVE_LINK_CLASSIFIER_SOURCE,
    FACE_NAVIGATION_CLASSIFIER_SOURCE,
  );
  assert.match(RESPONSIVE_PRIMITIVES_CSS, /prefers-reduced-motion:\s*reduce/);
  assert.match(
    RESPONSIVE_PRIMITIVES_CSS,
    /facetheory-rcp-skeleton--width-half/,
  );
  assert.match(RESPONSIVE_PRIMITIVES_CSS, /facetheory-rcp-skeleton--height-lg/);
});

test('responsive primitives: React adapter renders a11y contract without inline style', async () => {
  const body = await renderReactResponsive();
  assert.match(body, /facetheory-rcp-spinner/);
  assert.match(body, /role="status"/);
  assert.match(body, /aria-label="Loading accounts"/);
  assert.match(body, /facetheory-rcp-skeleton--width-half/);
  assert.match(body, /facetheory-rcp-skeleton--height-lg/);
  assert.match(body, /aria-hidden="true"/);
  assert.match(body, /Loaded child/);
  assert.match(body, /aria-live="polite"/);
  assert.match(body, /aria-busy="true"/);
  assert.match(body, /facetheory-rcp-loading-state--fullscreen/);
  assert.match(body, /facetheory-rcp-button__spinner--append/);
  assert.match(body, /role="status" aria-live="polite">Loading/);
  assert.match(body, /rel="noopener noreferrer"/);
  const dom = new JSDOM(body);
  assert.equal(
    dom.window.document
      .getElementById('react-unsafe-link')
      ?.getAttribute('href'),
    null,
  );
  assert.equal(body.includes('java\nscript'), false);
  assert.doesNotMatch(body, /style="/);
});

test('responsive primitives: Vue adapter renders parity a11y contract without inline style', async () => {
  const body = await renderVueResponsive();
  assert.match(body, /facetheory-rcp-spinner/);
  assert.match(body, /role="status"/);
  assert.match(body, /aria-label="Loading accounts"/);
  assert.match(body, /facetheory-rcp-skeleton--width-half/);
  assert.match(body, /facetheory-rcp-skeleton--height-lg/);
  assert.match(body, /aria-hidden="true"/);
  assert.match(body, /Loaded child/);
  assert.match(body, /aria-live="polite"/);
  assert.match(body, /aria-busy="true"/);
  assert.match(body, /facetheory-rcp-loading-state--fullscreen/);
  assert.match(body, /facetheory-rcp-button__spinner--append/);
  assert.match(body, /role="status" aria-live="polite">Loading/);
  assert.match(body, /rel="noopener noreferrer"/);
  const dom = new JSDOM(body);
  assert.equal(
    dom.window.document.getElementById('vue-unsafe-link')?.getAttribute('href'),
    null,
  );
  assert.equal(body.includes('data:text/html'), false);
  assert.doesNotMatch(body, /style="/);
});

test('responsive primitives: Svelte adapter renders parity a11y contract without inline style', async () => {
  const spinner = await renderSvelteComponent('Spinner', {
    label: 'Loading accounts',
    size: 'sm',
  });
  assert.match(spinner, /facetheory-rcp-spinner/);
  assert.match(spinner, /role="status"/);
  assert.match(spinner, /aria-label="Loading accounts"/);

  const skeleton = await renderSvelteComponent('Skeleton', {
    height: 'lg',
    width: 'half',
  });
  assert.match(skeleton, /facetheory-rcp-skeleton--width-half/);
  assert.match(skeleton, /facetheory-rcp-skeleton--height-lg/);
  assert.match(skeleton, /aria-hidden="true"/);

  const loading = await renderSvelteComponent('LoadingState', {
    fullscreen: true,
    message: 'Loading fleet',
  });
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Loading fleet/);
  assert.match(loading, /facetheory-rcp-loading-state--fullscreen/);

  const boundary = await renderSvelteComponent('AsyncStateBoundary', {
    loadingMessage: 'Loading boundary',
    state: 'loading',
  });
  assert.match(boundary, /data-state="loading"/);
  assert.match(boundary, /Loading boundary/);

  const button = await renderSvelteComponent('Button', {
    loading: true,
    loadingPlacement: 'append',
  });
  assert.match(button, /aria-busy="true"/);
  assert.match(button, /disabled/);
  assert.match(button, /facetheory-rcp-button__spinner--append/);
  assert.match(button, /role="status" aria-live="polite">Loading/);

  const link = await renderSvelteComponent('Link', {
    href: 'https://example.com/docs',
    target: '_blank',
  });
  assert.match(link, /<a/);
  assert.match(link, /href="https:\/\/example.com\/docs"/);
  assert.match(link, /rel="noopener noreferrer"/);

  const unsafeLink = await renderSvelteComponent('Link', {
    href: '\u0000javascript:alert(1)',
  });
  const unsafeDom = new JSDOM(unsafeLink);
  assert.equal(
    unsafeDom.window.document.querySelector('a')?.getAttribute('href'),
    null,
  );
  assert.equal(unsafeLink.includes('javascript:'), false);

  for (const html of [
    spinner,
    skeleton,
    loading,
    boundary,
    button,
    link,
    unsafeLink,
  ]) {
    assert.doesNotMatch(html, /style="/);
  }
});

test('responsive primitives: Link href sanitizer rejects dangerous schemes and preserves safe URLs', () => {
  const unsafe = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' java\t\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ];
  for (const href of unsafe) {
    assert.equal(sanitizeResponsiveLinkHref(href), undefined, href);
  }

  const safe = [
    'https://example.com/docs',
    'http://example.com/docs',
    'mailto:ops@example.test',
    'tel:+15551234567',
    '/relative/path',
    '?tab=agents',
    '#section',
    '//cdn.example.com/app.css',
  ];
  for (const href of safe) {
    assert.equal(sanitizeResponsiveLinkHref(href), href, href);
  }
});

test('responsive primitives: Link helper reuses shared classifier and only intercepts accepted clicks', () => {
  const dom = new JSDOM(
    '<a href="/next">Next</a><a id="external" href="https://other.example/">Other</a>',
    {
      url: 'https://app.example/current',
    },
  );
  const win = dom.window as unknown as Window;
  const anchor = dom.window.document.querySelector('a') as HTMLAnchorElement;
  const external = dom.window.document.getElementById(
    'external',
  ) as HTMLAnchorElement;

  const unboundClick = new dom.window.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  const classified = classifyFaceNavigationAnchorClick(unboundClick, {
    window: win,
  });
  assert.equal(classified, null, 'classifier requires the event target path');

  let navigated = false;
  anchor.addEventListener('click', (event) => {
    const intent = handleResponsiveLinkClick(event, {
      window: win,
      onNavigate: (nextIntent) => {
        navigated = true;
        assert.equal(
          nextIntent.classifierSource,
          FACE_NAVIGATION_CLASSIFIER_SOURCE,
        );
        assert.equal(nextIntent.url.pathname, '/next');
      },
    });
    assert.equal(intent?.classifierSource, FACE_NAVIGATION_CLASSIFIER_SOURCE);
  });
  const plainClick = new dom.window.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  assert.equal(anchor.dispatchEvent(plainClick), false);
  assert.equal(navigated, true);
  assert.equal(plainClick.defaultPrevented, true);

  let externalNavigated = false;
  external.addEventListener('click', (event) => {
    const intent = handleResponsiveLinkClick(event, {
      window: win,
      onNavigate: () => {
        externalNavigated = true;
      },
    });
    assert.equal(intent, null);
    assert.equal(event.defaultPrevented, false);
    event.preventDefault();
  });
  const externalClick = new dom.window.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  assert.equal(external.dispatchEvent(externalClick), false);
  assert.equal(externalNavigated, false);
});

test('responsive primitives: Button suppression and Link rel helpers are deterministic', () => {
  let prevented = false;
  let stopped = false;
  const event = {
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
  };

  suppressButtonActivation(event);
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  assert.equal(
    forcedSafeLinkRel({
      href: 'https://example.com',
      rel: 'ugc',
      target: '_blank',
    }),
    'ugc noopener noreferrer',
  );
  assert.equal(forcedSafeLinkRel({ href: '/local' }), undefined);
});
