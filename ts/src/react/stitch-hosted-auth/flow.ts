import * as React from 'react';

const h = React.createElement;

export interface AuthFlowStep {
  key: string;
  label: string;
  /** Optional long-form description shown when this step is active. */
  description?: React.ReactNode;
}

export interface AuthFlowStepperProps {
  steps: AuthFlowStep[];
  /** Zero-based index of the currently active step. */
  currentIndex: number;
}

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
      const isCurrent = index === currentIndex;
      const isCompleted = index < currentIndex;
      const dotColor =
        isCompleted || isCurrent
          ? 'var(--stitch-color-primary, #1f108e)'
          : 'var(--stitch-color-surface-container-high, #e2e7ff)';
      const labelColor = isCurrent
        ? 'var(--stitch-color-on-surface, #131b2e)'
        : 'var(--stitch-color-on-surface-variant, #464553)';
      return h(
        'li',
        {
          key: step.key,
          'aria-current': isCurrent ? 'step' : undefined,
          style: { display: 'flex', alignItems: 'center', gap: '8px' },
        },
        h('span', {
          'aria-hidden': 'true',
          style: {
            width: 10,
            height: 10,
            borderRadius: '9999px',
            background: dotColor,
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
              color: labelColor,
              fontWeight: isCurrent ? 600 : 400,
            },
          },
          step.label,
        ),
      );
    }),
  );
}

export interface AuthFlowSectionProps {
  /** Optional step heading (e.g. "Step 2 of 3"). */
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
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
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, children),
  );
}
