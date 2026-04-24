import { defineComponent, h } from 'vue';
import type { PropType, Slots, VNodeChild } from 'vue';

import type {
  OperatorEmptyStateConfig,
  OperatorGuardState,
  OperatorGuardStatus,
  OperatorPlaceholderDataPolicy,
} from '../../stitch-admin/operator-visibility-types.js';
import {
  renderDefaultSlot,
  renderPropContent,
  vnodeChildProp,
} from '../stitch-common.js';
import { OperatorEmptyState } from './operator-notices.js';

export type { OperatorGuardState, OperatorGuardStatus };

export interface GuardedOperatorShellProps {
  guard: OperatorGuardStatus;
  unauthorized?: VNodeChild;
  loading?: VNodeChild;
  error?: VNodeChild;
  placeholderDataPolicy?: OperatorPlaceholderDataPolicy;
}

export const GuardedOperatorShell = defineComponent({
  name: 'FaceTheoryVueGuardedOperatorShell',
  props: {
    guard: {
      type: Object as PropType<OperatorGuardStatus>,
      required: true,
    },
    unauthorized: vnodeChildProp,
    loading: vnodeChildProp,
    error: vnodeChildProp,
    placeholderDataPolicy: {
      type: String as PropType<OperatorPlaceholderDataPolicy>,
      default: 'no-production-like-data',
    },
  },
  setup(props, { slots }) {
    return () =>
      h(
        'section',
        {
          class: `facetheory-stitch-guarded-operator-shell facetheory-stitch-guarded-operator-shell-${props.guard.state}`,
          'data-operator-guard-state': props.guard.state,
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            minWidth: 0,
          },
        },
        renderGuardContent(props, slots),
      );
  },
});

function renderGuardContent(
  props: GuardedOperatorShellProps & {
    placeholderDataPolicy: OperatorPlaceholderDataPolicy;
  },
  slots: Slots,
): VNodeChild[] {
  const guard = props.guard;
  if (guard.state === 'authorized') return renderDefaultSlot(slots);

  if (guard.state === 'unauthorized') {
    const fallback =
      slots.unauthorized?.() ?? renderPropContent(props.unauthorized);
    if (fallback.length > 0) return fallback;
  }

  if (guard.state === 'loading') {
    const fallback = slots.loading?.() ?? renderPropContent(props.loading);
    if (fallback.length > 0) return fallback;
  }

  if (guard.state === 'error') {
    const fallback = slots.error?.() ?? renderPropContent(props.error);
    if (fallback.length > 0) return fallback;
  }

  return [
    h(OperatorEmptyState, {
      config: guardToEmptyStateConfig(guard, props.placeholderDataPolicy),
    }),
  ];
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
