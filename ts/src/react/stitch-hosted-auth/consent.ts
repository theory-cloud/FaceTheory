import * as React from 'react';

import {
  authConsentItemBackground,
  authConsentItemOpacity,
  type ConsentItemProps as SharedConsentItemProps,
  type ConsentListProps as SharedConsentListProps,
} from '../../stitch-hosted-auth/index.js';

const h = React.createElement;

export type ConsentItemProps = SharedConsentItemProps<React.ReactNode>;

/**
 * Single scope / permission line inside an OAuth consent screen. Rendered as
 * a Stitch-tonal strip rather than a list row — the design MD explicitly
 * forbids horizontal dividers, so items are separated by vertical gap.
 */
export function ConsentItem(props: ConsentItemProps): React.ReactElement {
  const { label, description, icon, granted } = props;
  return h(
    'li',
    {
      className: 'facetheory-stitch-consent-item',
      style: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 16px',
        background: authConsentItemBackground(granted),
        borderRadius: 'var(--stitch-radius-md, 6px)',
        opacity: authConsentItemOpacity(granted),
      },
    },
    icon !== undefined
      ? h(
          'span',
          {
            'aria-hidden': 'true',
            style: {
              fontSize: '18px',
              color: 'var(--stitch-color-primary, #1f108e)',
              flexShrink: 0,
              marginTop: 2,
            },
          },
          icon,
        )
      : null,
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 } },
      h(
        'span',
        {
          style: {
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--stitch-color-on-surface, #131b2e)',
          },
        },
        label,
      ),
      description !== undefined
        ? h(
            'span',
            {
              style: {
                fontSize: '12px',
                color: 'var(--stitch-color-on-surface-variant, #464553)',
              },
            },
            description,
          )
        : null,
    ),
  );
}

export interface ConsentListProps
  extends Omit<SharedConsentListProps<React.ReactNode>, 'children'> {
  children: React.ReactNode;
}

/**
 * Vertical list of ConsentItems for OAuth consent screens. Uses a flex column
 * with gap rather than a border-separated list.
 */
export function ConsentList(props: ConsentListProps): React.ReactElement {
  return h(
    'ul',
    {
      className: 'facetheory-stitch-consent-list',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        margin: 0,
        padding: 0,
        listStyle: 'none',
      },
    },
    props.children,
  );
}
