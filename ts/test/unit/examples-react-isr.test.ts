import assert from 'node:assert/strict';
import test from 'node:test';

import { handler as reactIsrHandler } from '../../examples/react-isr/handler.js';

test('examples integrity: React ISR handler regenerates then serves cache hits', async () => {
  const event = {
    rawPath: '/news/react-m15-smoke',
    requestContext: {
      http: { method: 'GET', path: '/news/react-m15-smoke' },
      requestId: 'm15-react-isr-smoke-1',
    },
  };

  const miss = await reactIsrHandler(event);
  const hit = await reactIsrHandler({
    ...event,
    requestContext: {
      ...event.requestContext,
      requestId: 'm15-react-isr-smoke-2',
    },
  });

  assert.equal(miss.statusCode, 200);
  assert.equal(hit.statusCode, 200);
  assert.equal(miss.headers?.['x-facetheory-isr'], 'miss');
  assert.equal(hit.headers?.['x-facetheory-isr'], 'hit');

  // Real React tree rendered into the cached HTML.
  assert.ok(miss.body.includes('<main id="root">'));
  assert.ok(miss.body.includes('<h1>react-m15-smoke</h1>'));
  assert.ok(miss.body.includes('revision 1'));

  // A HIT serves the identical cached bytes without re-rendering.
  assert.equal(hit.body, miss.body);
});
