import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
  NAVIGATION_PENDING_ATTRIBUTE,
  NAVIGATION_PENDING_CLASSIFIER_SOURCE,
  NAVIGATION_PENDING_INDICATOR_ATTRIBUTE,
  NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE,
  startNavigationPending,
} from '../../src/navigation-pending.js';
import {
  classifyFaceNavigationAnchorClick,
  FACE_NAVIGATION_CLASSIFIER_SOURCE,
  shouldHandleAnchorClick,
} from '../../src/spa.js';

type DomWindow = Window & typeof globalThis;

function click(win: DomWindow, init: MouseEventInit = {}): MouseEvent {
  return new win.MouseEvent('click', {
    bubbles: true,
    button: 0,
    cancelable: true,
    view: win,
    ...init,
  });
}

function pageTransitionEvent(
  win: DomWindow,
  type: 'pagehide' | 'pageshow',
): Event {
  const PageTransitionEventCtor = (
    win as Window & { PageTransitionEvent?: typeof PageTransitionEvent }
  ).PageTransitionEvent;
  if (typeof PageTransitionEventCtor === 'function') {
    return new PageTransitionEventCtor(type, { persisted: true });
  }
  return new win.Event(type);
}

test('navigation pending: reuses the FaceTheory SPA navigation classifier source', () => {
  const dom = new JSDOM(
    '<!doctype html><a id="next" href="/next"><span>Next</span></a>',
    { url: 'https://control.lab.theorymcp.ai/current' },
  );

  try {
    const win = dom.window as unknown as DomWindow;
    const doc = dom.window.document;
    const anchor = doc.querySelector('a');
    const target = doc.querySelector('span');
    assert.ok(anchor instanceof dom.window.HTMLAnchorElement);
    assert.ok(target instanceof dom.window.HTMLElement);

    let directClassifierResult: boolean | null = null;
    let composedClassifierSource: string | null = null;
    let composedUrl: string | null = null;

    doc.addEventListener('click', (event) => {
      const url = new URL(anchor.href, dom.window.location.href);
      directClassifierResult = shouldHandleAnchorClick(
        event,
        anchor,
        url,
        win,
        undefined,
      );
      const classification = classifyFaceNavigationAnchorClick(event, {
        window: win,
      });
      composedClassifierSource = classification?.classifierSource ?? null;
      composedUrl = classification?.url.toString() ?? null;
    });

    target.dispatchEvent(click(win));

    assert.equal(
      NAVIGATION_PENDING_CLASSIFIER_SOURCE,
      FACE_NAVIGATION_CLASSIFIER_SOURCE,
    );
    assert.equal(
      NAVIGATION_PENDING_CLASSIFIER_SOURCE,
      'facetheory_spa_navigation',
    );
    assert.equal(directClassifierResult, true);
    assert.equal(composedClassifierSource, FACE_NAVIGATION_CLASSIFIER_SOURCE);
    assert.equal(composedUrl, 'https://control.lab.theorymcp.ai/next');
  } finally {
    dom.window.close();
  }
});

test('navigation pending: shows an immediate status pill for accepted same-origin links', () => {
  const dom = new JSDOM(
    '<!doctype html><body><a id="next" href="/next">Next</a></body>',
    { url: 'https://control.lab.theorymcp.ai/current' },
  );

  try {
    const win = dom.window as unknown as DomWindow;
    const doc = dom.window.document;
    const anchor = doc.querySelector('a');
    assert.ok(anchor instanceof dom.window.HTMLAnchorElement);

    const controller = startNavigationPending({ document: doc, window: win });
    const event = click(win);
    const dispatched = anchor.dispatchEvent(event);

    assert.equal(dispatched, true);
    assert.equal(event.defaultPrevented, false);
    assert.equal(controller.isPending(), true);
    assert.equal(anchor.getAttribute(NAVIGATION_PENDING_ATTRIBUTE), 'link');
    assert.equal(anchor.getAttribute('aria-busy'), 'true');
    assert.equal(
      anchor.classList.contains('facetheory-navigation-pending-control'),
      true,
    );
    assert.equal(
      anchor.classList.contains('facetheory-navigation-pending-link'),
      true,
    );

    const indicator = doc.getElementById(
      DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
    );
    assert.ok(indicator instanceof dom.window.HTMLElement);
    assert.equal(indicator.textContent, 'Loading…');
    assert.equal(indicator.getAttribute('role'), 'status');
    assert.equal(indicator.getAttribute('aria-live'), 'polite');
    assert.equal(indicator.getAttribute('aria-atomic'), 'true');
    assert.equal(indicator.getAttribute(NAVIGATION_PENDING_ATTRIBUTE), 'link');
    assert.equal(
      indicator.classList.contains('facetheory-navigation-pending-pill'),
      true,
    );

    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('navigation pending: never reuses a non-indicator element on id collision', () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <script id="${DEFAULT_NAVIGATION_PENDING_INDICATOR_ID}" type="module"></script>
      <a id="next" href="/next">Next</a>
    </body>`,
    { url: 'https://control.lab.theorymcp.ai/current' },
  );

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message?: unknown) => {
    warnings.push(String(message ?? ''));
  };

  try {
    const win = dom.window as unknown as DomWindow;
    const doc = dom.window.document;
    const anchor = doc.querySelector('a');
    assert.ok(anchor instanceof dom.window.HTMLAnchorElement);

    const controller = startNavigationPending({ document: doc, window: win });
    anchor.dispatchEvent(click(win));

    const collided = doc.getElementById(
      DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
    );
    assert.ok(collided instanceof dom.window.HTMLScriptElement);
    assert.equal(collided.textContent, '');
    assert.equal(
      collided.hasAttribute(NAVIGATION_PENDING_INDICATOR_ATTRIBUTE),
      false,
    );

    const indicator = doc.getElementById(
      `${DEFAULT_NAVIGATION_PENDING_INDICATOR_ID}-1`,
    );
    assert.ok(indicator instanceof dom.window.HTMLDivElement);
    assert.equal(indicator.textContent, 'Loading…');
    assert.equal(
      indicator.getAttribute(NAVIGATION_PENDING_INDICATOR_ATTRIBUTE),
      'true',
    );
    assert.equal(indicator.getAttribute(NAVIGATION_PENDING_ATTRIBUTE), 'link');
    assert.equal(warnings.length, 1);
    assert.match(
      warnings[0] ?? '',
      /already belongs to a non-indicator element/,
    );

    controller.stop();
    assert.equal(
      doc.getElementById(`${DEFAULT_NAVIGATION_PENDING_INDICATOR_ID}-1`),
      null,
    );
    assert.ok(doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID));
  } finally {
    console.warn = originalWarn;
    dom.window.close();
  }
});

test('navigation pending: preserves native behavior for skipped link classifications', () => {
  const cases: Array<{
    event?: MouseEventInit;
    html: string;
    name: string;
    url?: string;
  }> = [
    {
      event: { button: 1 },
      html: '<a href="/next">Next</a>',
      name: 'middle click',
    },
    {
      event: { button: 2 },
      html: '<a href="/next">Next</a>',
      name: 'right click',
    },
    {
      event: { metaKey: true },
      html: '<a href="/next">Next</a>',
      name: 'modifier click',
    },
    {
      html: '<a href="/next" target="_blank">Next</a>',
      name: 'target blank',
    },
    {
      html: '<a href="/download" download>Download</a>',
      name: 'download',
    },
    {
      html: '<a href="/next" rel="external">Next</a>',
      name: 'rel external',
    },
    {
      html: '<a href="https://external.example/next">External</a>',
      name: 'external origin',
    },
    {
      html: '<a href="mailto:ops@example.test">Mail</a>',
      name: 'non-http scheme',
    },
    {
      html: '<a href="#section">Section</a>',
      name: 'hash-only same-document navigation',
      url: 'https://control.lab.theorymcp.ai/current?tab=agents',
    },
    {
      html: '<a href="/next" data-facetheory-reload>Next</a>',
      name: 'FaceTheory reload opt-out',
    },
  ];

  for (const skippedCase of cases) {
    const dom = new JSDOM(`<!doctype html><body>${skippedCase.html}</body>`, {
      url: skippedCase.url ?? 'https://control.lab.theorymcp.ai/current',
    });

    try {
      const win = dom.window as unknown as DomWindow;
      const doc = dom.window.document;
      const anchor = doc.querySelector('a');
      assert.ok(
        anchor instanceof dom.window.HTMLAnchorElement,
        skippedCase.name,
      );

      const controller = startNavigationPending({ document: doc, window: win });
      const event = click(win, skippedCase.event);
      const dispatched = anchor.dispatchEvent(event);

      assert.equal(dispatched, true, skippedCase.name);
      assert.equal(event.defaultPrevented, false, skippedCase.name);
      assert.equal(controller.isPending(), false, skippedCase.name);
      assert.equal(
        doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID),
        null,
        skippedCase.name,
      );
      assert.equal(
        anchor.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE),
        false,
        skippedCase.name,
      );

      controller.stop();
    } finally {
      dom.window.close();
    }
  }
});

test('navigation pending: observes form submits without taking submit authority', () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/agents/new" method="post" data-facetheory-oac-form>
        <input name="agent" value="demo">
        <button name="intent" value="create">Create</button>
      </form>`,
    { url: 'https://control.lab.theorymcp.ai/agents/new' },
  );

  try {
    const win = dom.window as unknown as DomWindow;
    const doc = dom.window.document;
    const form = doc.querySelector('form');
    const submitter = doc.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLButtonElement);

    const actionBefore = form.getAttribute('action');
    const methodBefore = form.getAttribute('method');
    let preventDefaultCalls = 0;
    const controller = startNavigationPending({ document: doc, window: win });
    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter,
    });
    const originalPreventDefault = event.preventDefault.bind(event);
    Object.defineProperty(event, 'preventDefault', {
      value: () => {
        preventDefaultCalls += 1;
        originalPreventDefault();
      },
    });

    const dispatched = form.dispatchEvent(event);

    assert.equal(dispatched, true);
    assert.equal(preventDefaultCalls, 0);
    assert.equal(event.defaultPrevented, false);
    assert.equal(form.getAttribute('action'), actionBefore);
    assert.equal(form.getAttribute('method'), methodBefore);
    assert.equal(controller.isPending(), true);
    assert.equal(form.getAttribute(NAVIGATION_PENDING_ATTRIBUTE), 'form');
    assert.equal(form.getAttribute('aria-busy'), 'true');
    assert.equal(
      submitter.getAttribute(NAVIGATION_PENDING_ATTRIBUTE),
      'submitter',
    );
    assert.equal(submitter.getAttribute('aria-busy'), 'true');

    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('navigation pending: clears pending UI on lifecycle cleanup events', () => {
  for (const lifecycleEventName of [
    'pageshow',
    'pagehide',
    'visibilitychange',
  ] as const) {
    const dom = new JSDOM(
      '<!doctype html><body><a id="next" href="/next">Next</a></body>',
      { url: 'https://control.lab.theorymcp.ai/current' },
    );

    try {
      const win = dom.window as unknown as DomWindow;
      const doc = dom.window.document;
      const anchor = doc.querySelector('a');
      assert.ok(anchor instanceof dom.window.HTMLAnchorElement);

      const controller = startNavigationPending({ document: doc, window: win });
      anchor.dispatchEvent(click(win));

      assert.equal(controller.isPending(), true, lifecycleEventName);
      assert.ok(doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID));

      if (lifecycleEventName === 'visibilitychange') {
        doc.dispatchEvent(new dom.window.Event('visibilitychange'));
      } else {
        dom.window.dispatchEvent(pageTransitionEvent(win, lifecycleEventName));
      }

      assert.equal(controller.isPending(), false, lifecycleEventName);
      assert.equal(
        doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID),
        null,
        lifecycleEventName,
      );
      assert.equal(
        anchor.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE),
        false,
        lifecycleEventName,
      );
      assert.equal(anchor.hasAttribute('aria-busy'), false, lifecycleEventName);

      controller.stop();
    } finally {
      dom.window.close();
    }
  }
});

test('navigation pending: clearing marked links preserves nested DOM content', () => {
  const dom = new JSDOM(
    '<!doctype html><body><a id="next" href="/next"><span>Next <strong>step</strong></span></a></body>',
    { url: 'https://control.lab.theorymcp.ai/current' },
  );

  try {
    const win = dom.window as unknown as DomWindow;
    const doc = dom.window.document;
    const anchor = doc.getElementById('next');
    assert.ok(anchor instanceof dom.window.HTMLAnchorElement);
    const before = anchor.innerHTML;

    const controller = startNavigationPending({ document: doc, window: win });
    anchor.dispatchEvent(click(win));
    assert.equal(controller.isPending(), true);

    controller.clear();

    assert.equal(controller.isPending(), false);
    assert.equal(anchor.innerHTML, before);
    assert.ok(anchor.querySelector('span > strong'));
    assert.equal(anchor.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE), false);
    assert.equal(anchor.hasAttribute('aria-busy'), false);
    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('navigation pending: marks reduced-motion status without adding motion itself', () => {
  const dom = new JSDOM(
    '<!doctype html><body><a id="next" href="/next">Next</a></body>',
    { url: 'https://control.lab.theorymcp.ai/current' },
  );

  try {
    const win = dom.window as unknown as DomWindow & {
      matchMedia: Window['matchMedia'];
    };
    win.matchMedia = (query: string) =>
      ({
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      }) as MediaQueryList;
    const doc = dom.window.document;
    const anchor = doc.querySelector('a');
    assert.ok(anchor instanceof dom.window.HTMLAnchorElement);

    const controller = startNavigationPending({ document: doc, window: win });
    anchor.dispatchEvent(click(win));

    const indicator = doc.getElementById(
      DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
    );
    assert.ok(indicator instanceof dom.window.HTMLElement);
    assert.equal(
      indicator.getAttribute(NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE),
      'true',
    );
    assert.equal(
      indicator.classList.contains(
        'facetheory-navigation-pending--reduced-motion',
      ),
      true,
    );

    controller.stop();
  } finally {
    dom.window.close();
  }
});
