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
    startAwsOacFormTransport({
      allowedMethods: ['POST', 'PATCH'],
      document: dom.window.document,
      fetcher: async (_input, init) => {
        methods.push(String(init?.method));
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
    assert.deepEqual(methods, ['PATCH']);
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
});
