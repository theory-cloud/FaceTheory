import assert from 'node:assert/strict';
import test from 'node:test';

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import { createAntdIntegration } from '../../src/react/antd.js';
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
} from '../../src/react/stitch-hosted-auth/index.js';

const h = React.createElement;

async function renderSSR(element: React.ReactElement): Promise<string> {
  const app = createFaceApp({
    faces: [
      createReactFace({
        route: '/',
        mode: 'ssr',
        render: () => element,
        renderOptions: {
          integrations: [createAntdIntegration({ hashed: false })],
        },
      }),
    ],
  });
  const resp = await app.handle({ method: 'GET', path: '/' });
  return new TextDecoder().decode(resp.body as Uint8Array);
}

test('AuthPageLayout with gradient background applies Stitch signature gradient', async () => {
  const body = await renderSSR(
    h(AuthPageLayout, {
      background: 'gradient',
      brand: h('span', null, 'Autheory'),
      children: h('div', null, 'card'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-auth-page'));
  assert.ok(body.includes('Autheory'));
  assert.ok(body.includes('linear-gradient(135deg'));
  assert.ok(body.includes('--stitch-color-primary'));
  assert.ok(body.includes('--stitch-color-primary-container'));
});

test('AuthPageLayout with surface background does not emit gradient', async () => {
  const body = await renderSSR(
    h(AuthPageLayout, {
      children: h('div', null, 'card'),
    }),
  );
  assert.ok(body.includes('--stitch-color-surface'));
  assert.ok(!body.includes('linear-gradient'));
});

test('AuthCard renders title, description, body, header action, and footer', async () => {
  const body = await renderSSR(
    h(AuthCard, {
      title: 'Sign in to Autheory',
      description: 'Use your passkey or password',
      headerAction: h('a', { href: '/signup' }, 'Sign up'),
      footer: h('a', { href: '/help' }, 'Trouble signing in?'),
      children: h('input', { type: 'email', placeholder: 'Email' }),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-auth-card'));
  assert.ok(body.includes('Sign in to Autheory'));
  assert.ok(body.includes('Use your passkey or password'));
  assert.ok(body.includes('Sign up'));
  assert.ok(body.includes('Trouble signing in?'));
  assert.ok(body.includes('--stitch-color-surface-container-lowest'));
  assert.ok(body.includes('--stitch-radius-xl'));
});

test('AuthFlowStepper marks the current step with aria-current', async () => {
  const body = await renderSSR(
    h(AuthFlowStepper, {
      steps: [
        { key: 'method', label: 'Method' },
        { key: 'verify', label: 'Verify' },
        { key: 'done', label: 'Done' },
      ],
      currentIndex: 1,
    }),
  );
  assert.ok(body.includes('facetheory-stitch-auth-flow-stepper'));
  assert.ok(body.includes('aria-current="step"'));
  // All three labels render.
  assert.ok(body.includes('Method'));
  assert.ok(body.includes('Verify'));
  assert.ok(body.includes('Done'));
});

test('AuthFlowSection renders eyebrow, title, description, and children', async () => {
  const body = await renderSSR(
    h(AuthFlowSection, {
      eyebrow: 'Step 2 of 3',
      title: 'Confirm code',
      description: 'We sent a 6-digit code to your device',
      children: h('span', null, 'otp-placeholder'),
    }),
  );
  assert.ok(body.includes('Step 2 of 3'));
  assert.ok(body.includes('Confirm code'));
  assert.ok(body.includes('We sent a 6-digit code'));
  assert.ok(body.includes('otp-placeholder'));
});

test('PasskeyCTA applies gradient background and pill radius', async () => {
  const body = await renderSSR(
    h(PasskeyCTA, {
      children: 'Continue with passkey',
    }),
  );
  assert.ok(body.includes('facetheory-stitch-passkey-cta'));
  assert.ok(body.includes('Continue with passkey'));
  assert.ok(body.includes('linear-gradient(135deg'));
  assert.ok(body.includes('border-radius:9999px'));
});

test('OTPInput wraps AntD Input.OTP with the Stitch class name', async () => {
  const body = await renderSSR(
    h(OTPInput, { length: 6 }),
  );
  assert.ok(body.includes('facetheory-stitch-otp-input'));
});

test('OTPInput marked invalid adds the invalid class and error status', async () => {
  const body = await renderSSR(
    h(OTPInput, { length: 6, invalid: true }),
  );
  assert.ok(body.includes('facetheory-stitch-otp-input-invalid'));
});

test('ConsentList renders granted and ungranted ConsentItems distinctly', async () => {
  const body = await renderSSR(
    h(ConsentList, {
      children: [
        h(ConsentItem, {
          key: 'read',
          label: 'Read your profile',
          description: 'Name, email, and tenant memberships',
          icon: '◈',
        }),
        h(ConsentItem, {
          key: 'manage',
          label: 'Manage API clients',
          granted: true,
        }),
      ],
    }),
  );
  assert.ok(body.includes('facetheory-stitch-consent-list'));
  assert.ok(body.includes('facetheory-stitch-consent-item'));
  assert.ok(body.includes('Read your profile'));
  assert.ok(body.includes('Name, email, and tenant memberships'));
  assert.ok(body.includes('Manage API clients'));
  // Granted entry uses surface-container-low; ungranted uses surface-container-lowest.
  assert.ok(body.includes('--stitch-color-surface-container-low'));
  assert.ok(body.includes('--stitch-color-surface-container-lowest'));
});

test('AuthStateCard error variant uses the error container surface and role=alert', async () => {
  const body = await renderSSR(
    h(AuthStateCard, {
      variant: 'error',
      title: 'Account locked',
      description: 'Too many failed attempts',
      icon: '!',
      actions: h('button', null, 'Contact support'),
    }),
  );
  assert.ok(body.includes('facetheory-stitch-auth-state-error'));
  assert.ok(body.includes('role="alert"'));
  assert.ok(body.includes('Account locked'));
  assert.ok(body.includes('Too many failed attempts'));
  assert.ok(body.includes('Contact support'));
  assert.ok(body.includes('--stitch-color-error-container'));
});

test('AuthStateCard success variant omits role=alert and uses tertiary accent', async () => {
  const body = await renderSSR(
    h(AuthStateCard, {
      variant: 'success',
      title: 'You are all set',
      icon: '✓',
    }),
  );
  assert.ok(body.includes('facetheory-stitch-auth-state-success'));
  assert.ok(!body.includes('role="alert"'));
  assert.ok(body.includes('--stitch-color-tertiary'));
});
