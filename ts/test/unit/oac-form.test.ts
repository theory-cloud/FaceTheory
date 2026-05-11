import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  AWS_OAC_URL_ENCODED_FORM_CONTENT_TYPE,
  collectAwsOacFormFields,
  createAwsOacUrlEncodedFormBody,
  createAwsOacUrlEncodedFormPayload,
  sha256HexForAwsOacPayload,
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
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
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
  const digest = await sha256HexForAwsOacPayload(new TextEncoder().encode('abc'));

  assert.equal(
    digest,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
