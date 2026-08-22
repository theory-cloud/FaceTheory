import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
  NAVIGATION_PENDING_ATTRIBUTE,
  NAVIGATION_PENDING_BOOTSTRAP_SOURCE,
  NAVIGATION_PENDING_CLASSIFIER_SOURCE,
  NAVIGATION_PENDING_FORM_OPT_OUT_ATTRIBUTE,
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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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
    assert.equal(anchor.hasAttribute('aria-busy'), false);
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

test('navigation pending: observes form submits without taking submit authority', async () => {
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
    // The pending decision is deferred until after application submit
    // handlers have run, so nothing is marked synchronously.
    assert.equal(controller.isPending(), false);
    assert.equal(form.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE), false);

    await flushMicrotasks();

    assert.equal(controller.isPending(), true);
    assert.equal(form.getAttribute(NAVIGATION_PENDING_ATTRIBUTE), 'form');
    assert.equal(form.hasAttribute('aria-busy'), false);
    assert.equal(
      submitter.getAttribute(NAVIGATION_PENDING_ATTRIBUTE),
      'submitter',
    );
    assert.equal(submitter.hasAttribute('aria-busy'), false);
    assert.ok(doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID));

    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('navigation pending: prevented AJAX submits never surface pending state or aria-busy', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/agents/invite" method="post">
        <input name="email" value="ops@example.test">
        <button>Invite</button>
      </form>`,
    { url: 'https://control.lab.theorymcp.ai/agents' },
  );

  try {
    const win = dom.window as unknown as DomWindow;
    const doc = dom.window.document;
    const form = doc.querySelector('form');
    const submitter = doc.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLButtonElement);

    // Application AJAX handler: preventDefault means no navigation follows.
    form.addEventListener('submit', (event) => event.preventDefault());

    const controller = startNavigationPending({ document: doc, window: win });
    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter,
    });
    const dispatched = form.dispatchEvent(event);

    assert.equal(dispatched, false);
    assert.equal(event.defaultPrevented, true);

    await flushMicrotasks();

    assert.equal(controller.isPending(), false);
    assert.equal(form.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE), false);
    assert.equal(form.hasAttribute('aria-busy'), false);
    assert.equal(submitter.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE), false);
    assert.equal(submitter.hasAttribute('aria-busy'), false);
    assert.equal(
      doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID),
      null,
    );

    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('navigation pending: forms can opt out with data-facetheory-no-pending', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/agents/new" method="post" ${NAVIGATION_PENDING_FORM_OPT_OUT_ATTRIBUTE}>
        <button>Create</button>
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

    const controller = startNavigationPending({ document: doc, window: win });
    const dispatched = form.dispatchEvent(
      new dom.window.SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
        submitter,
      }),
    );

    assert.equal(dispatched, true);

    await flushMicrotasks();

    assert.equal(controller.isPending(), false);
    assert.equal(form.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE), false);
    assert.equal(form.hasAttribute('aria-busy'), false);
    assert.equal(submitter.hasAttribute('aria-busy'), false);
    assert.equal(
      doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID),
      null,
    );

    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('navigation pending: skips form submits that never navigate this document', async () => {
  const cases: Array<{
    expectPending: boolean;
    html: string;
    name: string;
  }> = [
    {
      expectPending: false,
      html: '<form action="/save" method="dialog"><button>Close</button></form>',
      name: 'method dialog',
    },
    {
      expectPending: false,
      html: '<form action="/save" method="post"><button formmethod="dialog">Close</button></form>',
      name: 'submitter formmethod dialog overrides form method',
    },
    {
      expectPending: true,
      html: '<form action="/save" method="post"><button>Save</button></form>',
      name: 'submitter without formmethod keeps the form method',
    },
    {
      expectPending: false,
      html: '<form action="/next" method="get" target="_blank"><button>Go</button></form>',
      name: 'target blank',
    },
    {
      expectPending: false,
      html: '<form action="/next" method="get" target="results-frame"><button>Go</button></form>',
      name: 'named form target',
    },
    {
      expectPending: false,
      html: '<form action="/next" method="get"><button formtarget="results-frame">Go</button></form>',
      name: 'submitter formtarget overrides form target',
    },
    {
      expectPending: true,
      html: '<form action="/next" method="get" target="_self"><button>Go</button></form>',
      name: 'target _self still navigates this document',
    },
  ];

  for (const classifiedCase of cases) {
    const dom = new JSDOM(
      `<!doctype html><body>${classifiedCase.html}</body>`,
      {
        url: 'https://control.lab.theorymcp.ai/agents',
      },
    );

    try {
      const win = dom.window as unknown as DomWindow;
      const doc = dom.window.document;
      const form = doc.querySelector('form');
      const submitter = doc.querySelector('button');
      assert.ok(
        form instanceof dom.window.HTMLFormElement,
        classifiedCase.name,
      );
      assert.ok(
        submitter instanceof dom.window.HTMLButtonElement,
        classifiedCase.name,
      );

      const controller = startNavigationPending({ document: doc, window: win });
      const dispatched = form.dispatchEvent(
        new dom.window.SubmitEvent('submit', {
          bubbles: true,
          cancelable: true,
          submitter,
        }),
      );

      assert.equal(dispatched, true, classifiedCase.name);

      await flushMicrotasks();

      assert.equal(
        controller.isPending(),
        classifiedCase.expectPending,
        classifiedCase.name,
      );
      assert.equal(
        form.hasAttribute(NAVIGATION_PENDING_ATTRIBUTE),
        classifiedCase.expectPending,
        classifiedCase.name,
      );
      assert.equal(
        doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID) !== null,
        classifiedCase.expectPending,
        classifiedCase.name,
      );

      controller.stop();
    } finally {
      dom.window.close();
    }
  }
});

test('navigation pending: capture-phase submit classification survives app stopPropagation', async () => {
  const dom = new JSDOM(
    '<!doctype html><form action="/agents/new" method="post"><button>Create</button></form>',
    { url: 'https://control.lab.theorymcp.ai/agents/new' },
  );

  try {
    const win = dom.window as unknown as DomWindow;
    const doc = dom.window.document;
    const form = doc.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    // An application handler that stops propagation must not starve the
    // pending indicator for a submit that still navigates.
    form.addEventListener('submit', (event) => event.stopPropagation());

    const controller = startNavigationPending({ document: doc, window: win });
    const dispatched = form.dispatchEvent(
      new dom.window.SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );

    assert.equal(dispatched, true);

    await flushMicrotasks();

    assert.equal(controller.isPending(), true);
    assert.equal(form.getAttribute(NAVIGATION_PENDING_ATTRIBUTE), 'form');
    assert.equal(form.hasAttribute('aria-busy'), false);

    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('navigation pending: served bootstrap source keeps form handling observe-only', async () => {
  const dom = new JSDOM(
    `<!doctype html><body>
      <form id="ajax" action="/agents/invite" method="post"><button>Invite</button></form>
      <form id="navigating" action="/agents/new" method="post"><button>Create</button></form>
      <form id="opted-out" action="/agents/new" method="post" ${NAVIGATION_PENDING_FORM_OPT_OUT_ATTRIBUTE}><button>Create</button></form>
      <form id="dialog-form" action="/save" method="dialog"><button>Close</button></form>
      <form id="dialog-override" action="/save" method="post"><button formmethod="dialog">Close</button></form>
      <form id="new-tab" action="/next" method="get" target="_blank"><button>Go</button></form>
      <form id="framed" action="/next" method="get"><button formtarget="results-frame">Go</button></form>
    </body>`,
    {
      url: 'https://control.lab.theorymcp.ai/agents',
      runScripts: 'outside-only',
    },
  );

  try {
    const win = dom.window;
    const doc = win.document;

    // Execute the exact served bootstrap source inside the jsdom realm so
    // the shipped control-plane string is tested, not just the TS module.
    win.eval(
      `${NAVIGATION_PENDING_BOOTSTRAP_SOURCE}\nstartNavigationPending();`,
    );

    const ajaxForm = doc.getElementById('ajax');
    const navigatingForm = doc.getElementById('navigating');
    const optedOutForm = doc.getElementById('opted-out');
    assert.ok(ajaxForm instanceof win.HTMLFormElement);
    assert.ok(navigatingForm instanceof win.HTMLFormElement);
    assert.ok(optedOutForm instanceof win.HTMLFormElement);
    assert.equal(ajaxForm.getAttribute('aria-busy'), null);

    ajaxForm.addEventListener('submit', (event) => event.preventDefault());
    const ajaxDispatched = ajaxForm.dispatchEvent(
      new win.SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    assert.equal(ajaxDispatched, false);

    await flushMicrotasks();

    // A preventDefault()'d AJAX submit leaves no pending state at all.
    assert.equal(
      ajaxForm.hasAttribute('data-facetheory-navigation-pending'),
      false,
    );
    assert.equal(ajaxForm.getAttribute('aria-busy'), null);
    assert.equal(
      doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID),
      null,
    );

    const optedOutDispatched = optedOutForm.dispatchEvent(
      new win.SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    assert.equal(optedOutDispatched, true);

    await flushMicrotasks();

    // The opt-out is honored even for submits that would navigate.
    assert.equal(
      optedOutForm.hasAttribute('data-facetheory-navigation-pending'),
      false,
    );
    assert.equal(
      doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID),
      null,
    );

    // Submits that never navigate this document (method="dialog", including
    // a submitter formmethod override, and non-_self targets) are skipped by
    // the shipped bootstrap source exactly like the TS module skips them.
    const skippedBootstrapCases: Array<{
      form: HTMLFormElement;
      name: string;
    }> = [
      {
        form: doc.getElementById('dialog-form') as HTMLFormElement,
        name: 'bootstrap method dialog',
      },
      {
        form: doc.getElementById('dialog-override') as HTMLFormElement,
        name: 'bootstrap submitter formmethod dialog',
      },
      {
        form: doc.getElementById('new-tab') as HTMLFormElement,
        name: 'bootstrap target blank',
      },
      {
        form: doc.getElementById('framed') as HTMLFormElement,
        name: 'bootstrap submitter formtarget',
      },
    ];
    for (const skippedCase of skippedBootstrapCases) {
      const skippedSubmitter = skippedCase.form.querySelector('button');
      assert.ok(
        skippedSubmitter instanceof win.HTMLButtonElement,
        skippedCase.name,
      );

      const skippedDispatched = skippedCase.form.dispatchEvent(
        new win.SubmitEvent('submit', {
          bubbles: true,
          cancelable: true,
          submitter: skippedSubmitter,
        }),
      );
      assert.equal(skippedDispatched, true, skippedCase.name);

      await flushMicrotasks();

      assert.equal(
        skippedCase.form.hasAttribute('data-facetheory-navigation-pending'),
        false,
        skippedCase.name,
      );
      assert.equal(
        skippedCase.form.getAttribute('aria-busy'),
        null,
        skippedCase.name,
      );
      assert.equal(
        doc.getElementById(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID),
        null,
        skippedCase.name,
      );
    }

    const navigatingDispatched = navigatingForm.dispatchEvent(
      new win.SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    assert.equal(navigatingDispatched, true);

    await flushMicrotasks();

    // A real navigating submit still surfaces the pending state, marked only
    // with framework-namespaced state and never with aria-busy.
    assert.equal(
      navigatingForm.getAttribute('data-facetheory-navigation-pending'),
      'form',
    );
    assert.equal(navigatingForm.getAttribute('aria-busy'), null);
    const indicator = doc.getElementById(
      DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
    );
    assert.ok(indicator instanceof win.HTMLElement);
    assert.equal(indicator.textContent, 'Loading…');
    assert.equal(indicator.getAttribute('role'), 'status');
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
