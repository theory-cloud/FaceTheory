import * as React from 'react';

import {
  resolveAuthFlowStepState,
  type AuthFlowSectionProps as SharedAuthFlowSectionProps,
  type AuthFlowStep as SharedAuthFlowStep,
  type AuthFlowStepperProps as SharedAuthFlowStepperProps,
} from '../../stitch-hosted-auth/index.js';

const h = React.createElement;

export type AuthFlowStep = SharedAuthFlowStep<React.ReactNode>;

export type AuthFlowStepperProps = SharedAuthFlowStepperProps<AuthFlowStep>;

/**
 * Compact stepper for multi-step hosted-auth flows (MFA setup, passkey
 * enrollment, account recovery). Renders dots + labels, marks completed
 * steps with the primary tone. Keep step counts ≤ 4 — longer flows should
 * use contextual progress cues instead.
 */
export function AuthFlowStepper(
  props: AuthFlowStepperProps,
): React.ReactElement {
  const { steps, currentIndex } = props;

  return h(
    'ol',
    {
      className: 'facetheory-stitch-auth-flow-stepper',
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        margin: 0,
        padding: 0,
        listStyle: 'none',
      },
    },
    steps.map((step, index) => {
      const stepState = resolveAuthFlowStepState(index, currentIndex);
      return h(
        'li',
        {
          key: step.key,
          'aria-current': stepState.ariaCurrent,
          style: { display: 'flex', alignItems: 'center', gap: '8px' },
        },
        h('span', {
          'aria-hidden': 'true',
          style: {
            width: 10,
            height: 10,
            borderRadius: '9999px',
            background: stepState.dotColor,
            display: 'inline-block',
          },
        }),
        h(
          'span',
          {
            style: {
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: stepState.labelColor,
              fontWeight: stepState.labelFontWeight,
            },
          },
          step.label,
        ),
      );
    }),
  );
}

export interface AuthFlowSectionProps
  extends Omit<SharedAuthFlowSectionProps<React.ReactNode>, 'children'> {
  children: React.ReactNode;
}

/**
 * Inner section within an auth card — used to frame one step of a multi-step
 * flow without duplicating the AuthCard header treatment.
 */
export function AuthFlowSection(
  props: AuthFlowSectionProps,
): React.ReactElement {
  const { eyebrow, title, description, children } = props;
  return h(
    'div',
    {
      className: 'facetheory-stitch-auth-flow-section',
      style: { display: 'flex', flexDirection: 'column', gap: '16px' },
    },
    eyebrow !== undefined
      ? h(
          'span',
          {
            style: {
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          eyebrow,
        )
      : null,
    title !== undefined
      ? h(
          'h2',
          {
            style: {
              margin: 0,
              fontSize: '18px',
              lineHeight: 1.3,
              color: 'var(--stitch-color-on-surface, #131b2e)',
            },
          },
          title,
        )
      : null,
    description !== undefined
      ? h(
          'p',
          {
            style: {
              margin: 0,
              fontSize: '14px',
              lineHeight: 1.5,
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          description,
        )
      : null,
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      children,
    ),
  );
}
