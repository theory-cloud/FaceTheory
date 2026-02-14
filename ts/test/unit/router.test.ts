import assert from 'node:assert/strict';
import test from 'node:test';

import { Router } from '../../src/router.js';

test('router: matches static before param before proxy', () => {
  const r = new Router();
  r.add('/{proxy+}');
  r.add('/users/{id}');
  r.add('/users/me');

  const a = r.match('/users/me');
  assert.equal(a?.pattern, '/users/me');

  const b = r.match('/users/123');
  assert.equal(b?.pattern, '/users/{id}');
  assert.equal(b?.params.id, '123');

  const c = r.match('/anything/else');
  assert.equal(c?.pattern, '/{proxy+}');
  assert.equal(c?.params.proxy, 'anything/else');
});

test('router: proxy+ does not match empty', () => {
  const r = new Router();
  r.add('/{proxy+}');
  assert.equal(r.match('/'), null);
});

test('router: supports {name+} catch-all params', () => {
  const r = new Router();
  r.add('/{rest+}');

  const m = r.match('/anything/else');
  assert.equal(m?.pattern, '/{rest+}');
  assert.equal(m?.params.rest, 'anything/else');
  assert.equal(m?.proxy, 'anything/else');
});

test('router: {name+} does not match empty', () => {
  const r = new Router();
  r.add('/{rest+}');
  assert.equal(r.match('/'), null);
});

test('router: proxy* matches empty', () => {
  const r = new Router();
  r.add('/{proxy*}');
  const m = r.match('/');
  assert.equal(m?.pattern, '/{proxy*}');
  assert.equal(m?.proxy, undefined);
});

test('router: {name*} matches empty', () => {
  const r = new Router();
  r.add('/{rest*}');
  const m = r.match('/');
  assert.equal(m?.pattern, '/{rest*}');
  assert.equal(m?.proxy, undefined);
});
