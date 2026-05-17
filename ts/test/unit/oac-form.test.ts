import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE,
  collectAwsOacFormFields,
  createAwsOacUrlEncodedFormBody,
  createAwsOacUrlEncodedFormPayload,
  sha256HexForAwsOacPayload,
  startAwsOacFormTransport,
} from '../../src/oac-form.js';

test('oac form helpers: encode fields in order and hash exact bytes', async () => {
  const body = createAwsOacUrlEncodedFormBody([
    ['name', 'A B'],
    ['name', 'C+D'],
    ['emoji', '☁️'],
  ]);

  assert.equal(body.bodyText, 'name=A+B&name=C%2BD&emoji=%E2%98%81%EF%B8%8F');
  assert.equal(new TextDecoder().decode(body.body), body.bodyText);
  assert.equal(body.contentType, AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE);

  const seenBodies: string[] = [];
  const digest = await sha256HexForAwsOacPayload(body.body, async (bytes) => {
    seenBodies.push(new TextDecoder().decode(bytes));
    return new Uint8Array([0, 1, 2, 253, 254, 255]);
  });

  assert.deepEqual(seenBodies, [body.bodyText]);
  assert.equal(digest, '000102fdfeff');
});

test('oac form helpers: collect successful controls and submitter in DOM order', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form>
        <input name="first" value="1">
        <input name="disabled" value="nope" disabled>
        <input name="unchecked" type="checkbox" value="nope">
        <input name="checked" type="checkbox" value="yes" checked>
        <button name="action" value="create">Create</button>
        <input name="last" value="2">
      </form>`,
  );

  try {
    const form = dom.window.document.querySelector('form');
    const submitter = dom.window.document.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLElement);

    const fields = collectAwsOacFormFields(form, { submitter });
    assert.deepEqual(fields, [
      ['first', '1'],
      ['checked', 'yes'],
      ['action', 'create'],
      ['last', '2'],
    ]);

    const payload = await createAwsOacUrlEncodedFormPayload(form, {
      digest: async (bytes) =>
        crypto.subtle.digest(
          'SHA-256',
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
        ),
      submitter,
    });

    assert.equal(payload.bodyText, 'first=1&checked=yes&action=create&last=2');
    assert.equal(
      payload.sha256Hex,
      'eb45ff3f3755640cb48f8efabb9ab1b316dbe645ea3981ef3532c4e812beffd3',
    );
  } finally {
    dom.window.close();
  }
});

test('oac form helpers: reject file entries instead of stringifying them', () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form>
        <input name="title" value="Report">
        <input name="upload" type="file">
      </form>`,
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    assert.throws(
      () => collectAwsOacFormFields(form),
      /only supports string application\/x-www-form-urlencoded fields.*upload/,
    );
  } finally {
    dom.window.close();
  }
});

test('oac form helpers: compute lowercase SHA256 hex with Web Crypto', async () => {
  const digest = await sha256HexForAwsOacPayload(
    new TextEncoder().encode('abc'),
  );

  assert.equal(
    digest,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

async function flushEventLoop(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('oac form transport: intercepts marked same-origin POST forms with OAC headers', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/agents/new" method="post" data-facetheory-oac-form>
        <input name="agent" value="demo">
        <button name="intent" value="create">Create</button>
      </form>`,
    { url: 'https://control.lab.theorymcp.ai/agents/new' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    const submitter = dom.window.document.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLElement);

    const calls: Array<{
      input: string | URL | Request;
      init: RequestInit | undefined;
    }> = [];
    const responseSeen = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async (input, init) => {
          calls.push({ input, init });
          return new Response(null, { status: 204 });
        },
        onResponse: () => {
          resolve();
        },
        window: dom.window as unknown as Window,
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter,
    });
    form.dispatchEvent(event);

    await responseSeen;
    assert.equal(event.defaultPrevented, true);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.input,
      'https://control.lab.theorymcp.ai/agents/new',
    );
    assert.equal(calls[0]?.init?.method, 'POST');
    assert.equal(calls[0]?.init?.credentials, 'same-origin');
    assert.equal(calls[0]?.init?.redirect, 'error');
    assert.equal(
      new TextDecoder().decode(calls[0]?.init?.body as Uint8Array),
      'agent=demo&intent=create',
    );

    const headers = calls[0]?.init?.headers;
    assert.ok(headers instanceof Headers);
    assert.equal(
      headers.get('content-type'),
      'application/x-www-form-urlencoded;charset=UTF-8',
    );
    assert.equal(headers.get('accept'), 'text/html,application/xhtml+xml');
    assert.equal(
      headers.get('x-amz-content-sha256'),
      await sha256HexForAwsOacPayload(
        new TextEncoder().encode('agent=demo&intent=create'),
      ),
    );
  } finally {
    dom.window.close();
  }
});

test('oac form transport: forces redirect errors for mutating fetches', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/agents/new" method="post" data-facetheory-oac-form>
        <input name="agent" value="demo">
        <button>Create</button>
      </form>`,
    { url: 'https://control.lab.theorymcp.ai/agents/new' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const redirects: Array<RequestInit['redirect']> = [];
    const responseSeen = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async (_input, init) => {
          redirects.push(init?.redirect);
          return new Response(null, { status: 204 });
        },
        onResponse: () => {
          resolve();
        },
        requestInit: {
          redirect: 'follow',
        },
        window: dom.window as unknown as Window,
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);

    await responseSeen;
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(redirects, ['error']);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: binds the default browser fetch to window', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/agents/new" method="post" data-facetheory-oac-form>
        <input name="agent" value="demo">
        <button name="intent" value="create">Create</button>
      </form>`,
    { url: 'https://control.lab.theorymcp.ai/agents/new' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    const submitter = dom.window.document.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLElement);

    const win = dom.window as unknown as Window & { fetch: typeof fetch };
    const calls: Array<{
      input: string | URL | Request;
      init: RequestInit | undefined;
    }> = [];
    const errors: unknown[] = [];
    win.fetch = function receiverSensitiveFetch(
      this: Window,
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): ReturnType<typeof fetch> {
      assert.equal(this, win);
      calls.push({ input, init });
      return Promise.resolve(new Response(null, { status: 204 }));
    } as typeof fetch;

    startAwsOacFormTransport({
      document: dom.window.document,
      onError: (error) => {
        errors.push(error);
      },
      window: win,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter,
    });
    form.dispatchEvent(event);

    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(errors, []);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]?.input,
      'https://control.lab.theorymcp.ai/agents/new',
    );
    assert.equal(calls[0]?.init?.method, 'POST');
  } finally {
    dom.window.close();
  }
});

test('oac form transport: leaves unmarked and GET forms to native behavior', () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form id="native" action="/native" method="post">
        <button>Submit</button>
      </form>
      <form id="search" action="/search" method="get" data-facetheory-oac-form>
        <input name="q" value="face">
        <button>Search</button>
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    let fetchCount = 0;
    const controller = startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      window: dom.window as unknown as Window,
    });

    const native = dom.window.document.getElementById('native');
    const search = dom.window.document.getElementById('search');
    assert.ok(native instanceof dom.window.HTMLFormElement);
    assert.ok(search instanceof dom.window.HTMLFormElement);

    const nativeEvent = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    native.dispatchEvent(nativeEvent);
    assert.equal(nativeEvent.defaultPrevented, false);

    const searchEvent = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    search.dispatchEvent(searchEvent);
    assert.equal(searchEvent.defaultPrevented, false);
    assert.equal(fetchCount, 0);

    controller.stop();
  } finally {
    dom.window.close();
  }
});

test('oac form transport: rejects cross-origin actions before sending', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="https://evil.example/agents/new" method="post" data-facetheory-oac-form>
        <input name="agent" value="demo">
        <button>Create</button>
      </form>`,
    { url: 'https://control.lab.theorymcp.ai/agents/new' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const errors: unknown[] = [];
    let fetchCount = 0;
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      onError: (error) => {
        errors.push(error);
      },
      window: dom.window as unknown as Window,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(fetchCount, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /requires same-origin actions/);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: stops listening when controller is stopped', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    let fetchCount = 0;
    const controller = startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      window: dom.window as unknown as Window,
    });
    controller.stop();

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, false);
    assert.equal(fetchCount, 0);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: preserves constraint validation before sending', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" data-facetheory-oac-form>
        <input name="title" required>
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    let validated = false;
    form.reportValidity = () => {
      validated = true;
      return false;
    };

    let fetchCount = 0;
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      window: dom.window as unknown as Window,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(validated, true);
    assert.equal(fetchCount, 0);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: requires opt-in for non-native mutating methods', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/resource" method="patch" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const methods: string[] = [];
    const errors: unknown[] = [];
    const submitted = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        allowedMethods: ['POST', 'PATCH'],
        document: dom.window.document,
        fetcher: async (_input, init) => {
          methods.push(String(init?.method));
          return new Response(null, { status: 204 });
        },
        onError: (error) => {
          errors.push(error);
          resolve();
        },
        onResponse: () => {
          resolve();
        },
        window: dom.window as unknown as Window,
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await submitted;

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(methods, ['PATCH']);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: fails closed for form-level multipart encoding', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" enctype="multipart/form-data" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const errors: unknown[] = [];
    let fetchCount = 0;
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      onError: (error) => {
        errors.push(error);
      },
      window: dom.window as unknown as Window,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(fetchCount, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /received multipart\/form-data/);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: fails closed for form-level text plain encoding', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" enctype="text/plain" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const errors: unknown[] = [];
    let fetchCount = 0;
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      onError: (error) => {
        errors.push(error);
      },
      window: dom.window as unknown as Window,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(fetchCount, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /received text\/plain/);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: fails closed for unknown form-level encoding', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" enctype="application/json" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const errors: unknown[] = [];
    let fetchCount = 0;
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      onError: (error) => {
        errors.push(error);
      },
      window: dom.window as unknown as Window,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(fetchCount, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /received application\/json/);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: submitter formenctype can opt back into URL encoding', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" enctype="multipart/form-data" data-facetheory-oac-form>
        <input name="title" value="Draft">
        <button name="intent" value="save" formenctype="application/x-www-form-urlencoded">Save</button>
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    const submitter = dom.window.document.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLElement);

    const bodies: string[] = [];
    const submitted = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async (_input, init) => {
          bodies.push(new TextDecoder().decode(init?.body as Uint8Array));
          return new Response(null, { status: 204 });
        },
        onResponse: () => {
          resolve();
        },
        window: dom.window as unknown as Window,
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter,
    });
    form.dispatchEvent(event);
    await submitted;

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(bodies, ['title=Draft&intent=save']);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: unknown submitter formenctype fails closed over form encoding', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" enctype="application/x-www-form-urlencoded" data-facetheory-oac-form>
        <input name="title" value="Draft">
        <button name="intent" value="save" formenctype="application/json">Save</button>
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    const submitter = dom.window.document.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLElement);

    const errors: unknown[] = [];
    let fetchCount = 0;
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      onError: (error) => {
        errors.push(error);
      },
      window: dom.window as unknown as Window,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(fetchCount, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /received application\/json/);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: submitter formenctype can fail closed over form encoding', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" enctype="application/x-www-form-urlencoded" data-facetheory-oac-form>
        <input name="title" value="Draft">
        <button name="intent" value="save" formenctype="text/plain">Save</button>
      </form>`,
    { url: 'https://example.test/' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    const submitter = dom.window.document.querySelector('button');
    assert.ok(form instanceof dom.window.HTMLFormElement);
    assert.ok(submitter instanceof dom.window.HTMLElement);

    const errors: unknown[] = [];
    let fetchCount = 0;
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () => {
        fetchCount += 1;
        return new Response(null, { status: 204 });
      },
      onError: (error) => {
        errors.push(error);
      },
      window: dom.window as unknown as Window,
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
      submitter,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(fetchCount, 0);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /received text\/plain/);
  } finally {
    dom.window.close();
  }
});

function responseWithUrl(
  response: Response,
  url: string,
  redirected = false,
): Response {
  Object.defineProperty(response, 'url', { configurable: true, value: url });
  Object.defineProperty(response, 'redirected', {
    configurable: true,
    value: redirected,
  });
  return response;
}

function fakeNavigationWindow(
  dom: JSDOM,
  assigned: string[],
  replaced: string[] = [],
): Window {
  const location = {
    href: dom.window.location.href,
    origin: dom.window.location.origin,
    assign: (url: string) => {
      assigned.push(url);
      location.href = new URL(url, location.href).toString();
    },
  };
  return {
    history: {
      replaceState: (
        _state: unknown,
        _title: string,
        url?: string | URL | null,
      ) => {
        if (url === undefined || url === null) return;
        const resolved = new URL(String(url), location.href).toString();
        replaced.push(resolved);
        location.href = resolved;
      },
    },
    location,
  } as unknown as Window;
}

test('oac form transport: navigates same-origin redirected responses through the browser', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const assigned: string[] = [];
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () =>
        responseWithUrl(
          new Response(null, { status: 200 }),
          'https://example.test/done',
          true,
        ),
      window: fakeNavigationWindow(dom, assigned),
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(assigned, ['https://example.test/done']);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: rejects cross-origin redirect targets', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const assigned: string[] = [];
    const errors: unknown[] = [];
    const errored = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async () =>
          responseWithUrl(
            new Response(null, { status: 200 }),
            'https://evil.test/done',
            true,
          ),
        onError: (error) => {
          errors.push(error);
          resolve();
        },
        window: fakeNavigationWindow(dom, assigned),
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await errored;

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(assigned, []);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /rejected cross-origin response URL/);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: rejects malformed redirect targets', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <form action="/save" method="post" data-facetheory-oac-form>
        <input name="title" value="Draft">
      </form>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const assigned: string[] = [];
    const errors: unknown[] = [];
    const errored = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async () =>
          responseWithUrl(
            new Response(null, { status: 200 }),
            'https://[malformed',
            true,
          ),
        onError: (error) => {
          errors.push(error);
          resolve();
        },
        window: fakeNavigationWindow(dom, assigned),
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await errored;

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(assigned, []);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /rejected malformed response URL/);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: replaces the document for same-origin HTML responses', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head><title>Edit</title></head>
        <body>
          <form action="/save" method="post" data-facetheory-oac-form>
            <input name="title" value="">
          </form>
        </body>
      </html>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const replaced: string[] = [];
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () =>
        responseWithUrl(
          new Response(
            '<!doctype html><html><head><title>Invalid</title></head><body><main>Title is required</main></body></html>',
            {
              headers: { 'content-type': 'text/html; charset=utf-8' },
              status: 422,
            },
          ),
          'https://example.test/save',
        ),
      window: fakeNavigationWindow(dom, [], replaced),
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(dom.window.document.title, 'Invalid');
    assert.equal(
      dom.window.document.body.textContent?.trim(),
      'Title is required',
    );
    assert.deepEqual(replaced, ['https://example.test/save']);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: refuses default document replacement when response CSP is present', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head><title>Edit</title></head>
        <body>
          <form action="/save" method="post" data-facetheory-oac-form>
            <input name="title" value="">
          </form>
        </body>
      </html>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const errors: unknown[] = [];
    const replaced: string[] = [];
    const errored = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async () =>
          responseWithUrl(
            new Response(
              '<!doctype html><html><head><title>Invalid</title></head><body><script>document.body.dataset.executed = "yes"</script><main>Title is required</main></body></html>',
              {
                headers: {
                  'content-security-policy': "script-src 'none'",
                  'content-type': 'text/html; charset=utf-8',
                },
                status: 422,
              },
            ),
            'https://example.test/save',
          ),
        onError: (error) => {
          errors.push(error);
          resolve();
        },
        window: fakeNavigationWindow(dom, [], replaced),
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await errored;

    assert.equal(event.defaultPrevented, true);
    assert.equal(dom.window.document.title, 'Edit');
    assert.equal(dom.window.document.body.dataset.executed, undefined);
    assert.deepEqual(replaced, []);
    assert.equal(errors.length, 1);
    assert.match(
      String(errors[0]),
      /refused to replace.*Content-Security-Policy/,
    );
  } finally {
    dom.window.close();
  }
});

test('oac form transport: strict CSP defaults to full same-origin browser navigation', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head><title>Edit</title></head>
        <body>
          <form action="/save" method="post" data-facetheory-oac-form>
            <input name="title" value="">
          </form>
        </body>
      </html>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    let writeCount = 0;
    dom.window.document.write = () => {
      writeCount += 1;
    };

    const assigned: string[] = [];
    const replaced: string[] = [];
    startAwsOacFormTransport({
      document: dom.window.document,
      fetcher: async () =>
        responseWithUrl(
          new Response(
            '<!doctype html><html><head><title>Invalid</title></head><body><main>Title is required</main></body></html>',
            {
              headers: {
                'content-security-policy': "script-src 'self'",
                'content-type': 'text/html; charset=utf-8',
              },
              status: 422,
            },
          ),
          'https://example.test/save',
        ),
      strictCsp: true,
      window: fakeNavigationWindow(dom, assigned, replaced),
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.equal(dom.window.document.title, 'Edit');
    assert.equal(writeCount, 0);
    assert.deepEqual(assigned, ['https://example.test/save']);
    assert.deepEqual(replaced, []);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: SPA navigation policy loads external hydration before mutation', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head><title>Edit</title></head>
        <body>
          <form action="/save" method="post" data-facetheory-oac-form>
            <input name="title" value="Draft">
          </form>
          <main data-facetheory-view>Editing</main>
        </body>
      </html>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    let writeCount = 0;
    dom.window.document.write = () => {
      writeCount += 1;
    };

    const fetched: string[] = [];
    const hydrated: Array<{ data: unknown; text: string | null; url: string }> =
      [];
    const replaced: string[] = [];
    const navigated = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async (input) => {
          fetched.push(String(input));
          if (String(input).endsWith('/_facetheory/hydration/save.json')) {
            return new Response(JSON.stringify({ saved: true }), {
              headers: { 'content-type': 'application/json' },
              status: 200,
            });
          }
          return responseWithUrl(
            new Response(
              `<!doctype html>
                <html>
                  <head>
                    <title>Saved</title>
                    <link rel="facetheory-hydration" href="/_facetheory/hydration/save.json" type="application/json">
                    <script src="/assets/entry-client.js" type="module"></script>
                  </head>
                  <body>
                    <main data-facetheory-view>Saved view</main>
                  </body>
                </html>`,
              {
                headers: {
                  'content-security-policy': "script-src 'self'",
                  'content-type': 'text/html; charset=utf-8',
                },
                status: 200,
              },
            ),
            'https://example.test/save',
          );
        },
        navigationPolicy: 'spa',
        onError: (error) => {
          throw error;
        },
        spaNavigation: {
          importModule: async () => ({
            hydrateFaceNavigation: (context) => {
              hydrated.push({
                data: context.data,
                text: context.view?.textContent?.trim() ?? null,
                url: context.url.toString(),
              });
              resolve();
            },
          }),
          parser: new dom.window.DOMParser(),
        },
        window: fakeNavigationWindow(dom, [], replaced),
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await navigated;
    await flushEventLoop();

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(fetched, [
      'https://example.test/save',
      'https://example.test/_facetheory/hydration/save.json',
    ]);
    assert.equal(writeCount, 0);
    assert.equal(dom.window.document.title, 'Saved');
    assert.equal(
      dom.window.document.querySelector('[data-facetheory-view]')?.textContent,
      'Saved view',
    );
    assert.deepEqual(hydrated, [
      {
        data: { saved: true },
        text: 'Saved view',
        url: 'https://example.test/save',
      },
    ]);
    assert.deepEqual(replaced, ['https://example.test/save']);
  } finally {
    dom.window.close();
  }
});

test('oac form transport: SPA policy rejects unsafe hydration targets before mutation', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head><title>Edit</title></head>
        <body>
          <form action="/save" method="post" data-facetheory-oac-form>
            <input name="title" value="Draft">
          </form>
          <main data-facetheory-view>Editing</main>
        </body>
      </html>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    let writeCount = 0;
    dom.window.document.write = () => {
      writeCount += 1;
    };

    const errors: unknown[] = [];
    const replaced: string[] = [];
    const errored = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async () =>
          responseWithUrl(
            new Response(
              `<!doctype html>
                <html>
                  <head>
                    <title>Saved</title>
                    <link rel="facetheory-hydration" href="https://evil.test/hydration.json" type="application/json">
                    <script src="/assets/entry-client.js" type="module"></script>
                  </head>
                  <body>
                    <main data-facetheory-view>Unsafe saved view</main>
                  </body>
                </html>`,
              {
                headers: {
                  'content-security-policy': "script-src 'self'",
                  'content-type': 'text/html; charset=utf-8',
                },
                status: 200,
              },
            ),
            'https://example.test/save',
          ),
        navigationPolicy: 'spa',
        onError: (error) => {
          errors.push(error);
          resolve();
        },
        spaNavigation: {
          parser: new dom.window.DOMParser(),
        },
        window: fakeNavigationWindow(dom, [], replaced),
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await errored;

    assert.equal(event.defaultPrevented, true);
    assert.equal(dom.window.document.title, 'Edit');
    assert.equal(
      dom.window.document.querySelector('[data-facetheory-view]')?.textContent,
      'Editing',
    );
    assert.equal(writeCount, 0);
    assert.deepEqual(replaced, []);
    assert.equal(errors.length, 1);
    assert.match(
      String(errors[0]),
      /FaceTheory SPA hydration data resolved cross-origin/,
    );
  } finally {
    dom.window.close();
  }
});

test('oac form transport: lets hosts override navigation outcomes', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <head><title>Edit</title></head>
        <body>
          <form action="/save" method="post" data-facetheory-oac-form>
            <input name="title" value="Draft">
          </form>
        </body>
      </html>`,
    { url: 'https://example.test/edit' },
  );

  try {
    const form = dom.window.document.querySelector('form');
    assert.ok(form instanceof dom.window.HTMLFormElement);

    const navigations: Array<{
      html: string | null;
      navigation: string;
      url: string;
    }> = [];
    const navigated = new Promise<void>((resolve) => {
      startAwsOacFormTransport({
        document: dom.window.document,
        fetcher: async () =>
          responseWithUrl(
            new Response('<!doctype html><title>Saved</title><p>Saved</p>', {
              headers: { 'content-type': 'text/html' },
              status: 200,
            }),
            'https://example.test/save',
          ),
        onNavigate: (context) => {
          navigations.push({
            html: context.html,
            navigation: context.navigation,
            url: context.finalUrl.toString(),
          });
          resolve();
          return true;
        },
        window: fakeNavigationWindow(dom, []),
      });
    });

    const event = new dom.window.SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    });
    form.dispatchEvent(event);
    await navigated;

    assert.equal(event.defaultPrevented, true);
    assert.equal(dom.window.document.title, 'Edit');
    assert.equal(navigations.length, 1);
    assert.equal(navigations[0]?.navigation, 'replace-document');
    assert.equal(navigations[0]?.url, 'https://example.test/save');
    assert.match(navigations[0]?.html ?? '', /Saved/);
  } finally {
    dom.window.close();
  }
});
