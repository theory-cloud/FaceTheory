import assert from 'node:assert/strict';
import test from 'node:test';

import { createFaceApp } from '../../src/app.js';
import { createVueFace, h } from '../../src/vue/index.js';
import {
  AuthCard,
  AuthFlowSection,
  AuthFlowStepper,
  AuthPageLayout,
  AuthStateCard,
  ConsentItem,
  ConsentList,
  OTPInput,
  PasskeyCTA,
} from '../../src/vue/stitch-hosted-auth/index.js';

async function renderSSR(vnode: ReturnType<typeof h>): Promise<string> {
  const app = createFaceApp({
    faces: [
      createVueFace({
        route: '/',
        mode: 'ssr',
        render: () => vnode,
      }),
    ],
  });

  const resp = await app.handle({ method: 'GET', path: '/' });
  return new TextDecoder().decode(resp.body as Uint8Array);
}

test('vue stitch-hosted-auth: AuthPageLayout and AuthCard render hosted-auth chrome', async () => {
  const body = await renderSSR(
    h(
      AuthPageLayout,
      {
        background: 'gradient',
        brand: h('span', null, 'Autheory'),
        footer: h('a', { href: '/help' }, 'Help'),
      },
      {
        default: () =>
          h(
            AuthCard,
            {
              title: 'Sign in to Autheory',
              description: 'Use your passkey or password',
              headerAction: h('a', { href: '/signup' }, 'Sign up'),
              footer: h('a', { href: '/reset' }, 'Trouble signing in?'),
            },
            {
              default: () =>
                h('input', { type: 'email', placeholder: 'Email' }),
            },
          ),
      },
    ),
  );

  assert.ok(body.includes('facetheory-stitch-auth-page'));
  assert.ok(body.includes('facetheory-stitch-auth-card'));
  assert.ok(body.includes('linear-gradient(135deg'));
  assert.ok(body.includes('Autheory'));
  assert.ok(body.includes('Sign up'));
  assert.ok(body.includes('Trouble signing in?'));
});

test('vue stitch-hosted-auth: flow, otp, consent, and state components render parity markers', async () => {
  const body = await renderSSR(
    h('div', null, [
      h(AuthFlowStepper, {
        steps: [
          { key: 'method', label: 'Method' },
          { key: 'verify', label: 'Verify' },
          { key: 'done', label: 'Done' },
        ],
        currentIndex: 1,
      }),
      h(
        AuthFlowSection,
        {
          eyebrow: 'Step 2 of 3',
          title: 'Confirm code',
          description: 'We sent a 6-digit code to your device',
        },
        { default: () => h(OTPInput, { length: 6, invalid: true }) },
      ),
      h(
        PasskeyCTA,
        { type: 'button' },
        {
          default: () => 'Continue with passkey',
        },
      ),
      h(ConsentList, null, {
        default: () => [
          h(ConsentItem, {
            label: 'Read your profile',
            description: 'Name, email, and tenant memberships',
            icon: '◈',
          }),
          h(ConsentItem, {
            label: 'Manage API clients',
            granted: true,
          }),
        ],
      }),
      h(AuthStateCard, {
        variant: 'error',
        title: 'Account locked',
        description: 'Too many failed attempts',
        icon: '!',
        actions: h('button', null, 'Contact support'),
      }),
    ]),
  );

  assert.ok(body.includes('facetheory-stitch-auth-flow-stepper'));
  assert.ok(body.includes('aria-current="step"'));
  assert.ok(body.includes('facetheory-stitch-otp-input-invalid'));
  assert.ok(body.includes('facetheory-stitch-passkey-cta'));
  assert.ok(body.includes('facetheory-stitch-consent-item'));
  assert.ok(body.includes('--stitch-color-surface-container-low'));
  assert.ok(body.includes('facetheory-stitch-auth-state-error'));
  assert.ok(body.includes('role="alert"'));
});
