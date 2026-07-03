import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStrictCspHeader } from '../../src/security.js';

const DEFAULT_STRICT_CSP_HEADER =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'";

test('security: strict CSP extensions preserve byte-identical defaults', () => {
  assert.equal(buildStrictCspHeader(), DEFAULT_STRICT_CSP_HEADER);
  assert.equal(buildStrictCspHeader({}), DEFAULT_STRICT_CSP_HEADER);
});

test('security: strict CSP extensions append existing and new directives deterministically', () => {
  const header = buildStrictCspHeader({
    directives: {
      'connect-src': ['https://api.example.com', 'wss://events.example.com'],
      'img-src': 'https://img.example.com',
      'report-to': 'facetheory-csp',
    },
  });

  assert.equal(
    header,
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https://img.example.com; font-src 'self'; connect-src 'self' https://api.example.com wss://events.example.com; form-action 'self'; report-to facetheory-csp",
  );
});

test('security: strict CSP extensions dedupe repeated source expressions', () => {
  const header = buildStrictCspHeader({
    directives: {
      'connect-src': ["'self'", 'https://api.example.com', 'https://api.example.com'],
    },
  });

  assert.match(header, /connect-src 'self' https:\/\/api\.example\.com;/);
  assert.equal(
    (header.match(/https:\/\/api\.example\.com/g) ?? []).length,
    1,
  );
});

test('security: strict CSP extensions reject unsafe-inline and unsafe-eval', () => {
  assert.throws(
    () =>
      buildStrictCspHeader({
        directives: { 'script-src': ["'unsafe-inline'"] },
      }),
    /rejects 'unsafe-inline'.*script-src.*external assets.*request nonces/,
  );

  assert.throws(
    () =>
      buildStrictCspHeader({
        directives: { 'script-src': ['unsafe-eval'] },
      }),
    /rejects 'unsafe-eval'.*script-src.*eval-like runtime code/,
  );
});

test('security: strict CSP extensions reject injection-shaped directives and values', () => {
  assert.throws(
    () =>
      buildStrictCspHeader({
        directives: { 'connect src': 'https://api.example.com' },
      }),
    /directive name is invalid/,
  );

  assert.throws(
    () =>
      buildStrictCspHeader({
        directives: { 'connect-src': "https://api.example.com; script-src 'unsafe-inline'" },
      }),
    /individual CSP tokens/,
  );
});
