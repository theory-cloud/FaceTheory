import * as React from 'react';

import type {
  OperatorEmptyStateConfig,
  OperatorGuardState,
  OperatorGuardStatus,
  OperatorPlaceholderDataPolicy,
} from '../../stitch-admin/operator-visibility-types.js';
import { OperatorEmptyState } from './operator-notices.js';

const h = React.createElement;

export type { OperatorGuardState, OperatorGuardStatus };

export interface GuardedOperatorShellProps {
  /** Caller-supplied guard status; FaceTheory never reads auth/session globals. */
  guard: OperatorGuardStatus;
  /** Content rendered only when `guard.state === "authorized"`. */
  children?: React.ReactNode;
  /** Optional caller-rendered replacement for the default unauthorized state. */
  unauthorized?: React.ReactNode;
  /** Optional caller-rendered replacement for the default loading state. */
  loading?: React.ReactNode;
  /** Optional caller-rendered replacement for the default error state. */
  error?: React.ReactNode;
  /** Optional deterministic placeholder policy marker for generated states. */
  placeholderDataPolicy?: OperatorPlaceholderDataPolicy;
}

/**
 * Small presentational guard shell for operator surfaces. The caller owns auth
 * and supplies the stable guard state; this component only selects the stateful
 * view so SSR and hydration choose the same subtree.
 */
export function GuardedOperatorShell(
  props: GuardedOperatorShellProps,
): React.ReactElement {
  const {
    guard,
    children,
    unauthorized,
    loading,
    error,
    placeholderDataPolicy = 'no-production-like-data',
  } = props;

  return h(
    'section',
    {
      className: `facetheory-stitch-guarded-operator-shell facetheory-stitch-guarded-operator-shell-${guard.state}`,
      'data-operator-guard-state': guard.state,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        minWidth: 0,
      },
    },
    renderGuardContent({
      guard,
      children,
      unauthorized,
      loading,
      error,
      placeholderDataPolicy,
    }),
  );
}

function renderGuardContent(
  props: Required<
    Pick<GuardedOperatorShellProps, 'guard' | 'placeholderDataPolicy'>
  > &
    Pick<
      GuardedOperatorShellProps,
      'children' | 'unauthorized' | 'loading' | 'error'
    >,
): React.ReactNode {
  const {
    guard,
    children,
    unauthorized,
    loading,
    error,
    placeholderDataPolicy,
  } = props;

  if (guard.state === 'authorized') return children;
  if (guard.state === 'unauthorized' && unauthorized !== undefined) {
    return unauthorized;
  }
  if (guard.state === 'loading' && loading !== undefined) return loading;
  if (guard.state === 'error' && error !== undefined) return error;

  return h(OperatorEmptyState, {
    config: guardToEmptyStateConfig(guard, placeholderDataPolicy),
  });
}

function guardToEmptyStateConfig(
  guard: OperatorGuardStatus,
  placeholderDataPolicy: OperatorPlaceholderDataPolicy,
): OperatorEmptyStateConfig {
  if (guard.state === 'loading') {
    return {
      intent: 'loading',
      title: 'Checking operator access',
      description: appendGuardContext(
        'Operator access is being verified before this dashboard renders.',
        guard,
      ),
      placeholderDataPolicy,
    };
  }

  if (guard.state === 'error') {
    return {
      intent: 'error',
      title: 'Operator access unavailable',
      description: appendGuardContext(
        guard.reason ?? 'The operator access check could not be completed.',
        guard,
      ),
      placeholderDataPolicy,
    };
  }

  return {
    intent: 'not-authorized',
    title: 'Operator access required',
    description: appendGuardContext(
      guard.reason ??
        'The signed-in principal is not authorized to view this operator surface.',
      guard,
    ),
    placeholderDataPolicy,
  };
}

function appendGuardContext(base: string, guard: OperatorGuardStatus): string {
  const details: string[] = [];
  if (guard.principalLabel !== undefined) {
    details.push(`Principal: ${guard.principalLabel}`);
  }
  if (guard.requestId !== undefined) {
    details.push(`Request: ${guard.requestId}`);
  }
  if (details.length === 0) return base;
  return `${base} ${details.join(' · ')}.`;
}
