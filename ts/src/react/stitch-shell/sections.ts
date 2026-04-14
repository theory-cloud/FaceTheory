import * as React from 'react';
import { Typography } from 'antd';

const h = React.createElement;

export interface SectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A labeled content section. Groups body content under an optional title +
 * description and an optional action slot. Use this to structure routes
 * instead of free-floating headings.
 */
export function Section(props: SectionProps): React.ReactElement {
  const { title, description, actions, children } = props;
  return h(
    'section',
    {
      className: 'facetheory-stitch-section',
      style: { display: 'flex', flexDirection: 'column', gap: '12px' },
    },
    title !== undefined || actions !== undefined || description !== undefined
      ? h(
          'header',
          {
            className: 'facetheory-stitch-section-header',
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '16px',
            },
          },
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
            title !== undefined
              ? h(
                  Typography.Title,
                  {
                    level: 2,
                    style: { margin: 0, fontSize: '18px', lineHeight: 1.3 },
                  },
                  title,
                )
              : null,
            description !== undefined
              ? h(
                  Typography.Text,
                  { type: 'secondary', style: { fontSize: '13px' } },
                  description,
                )
              : null,
          ),
          actions !== undefined
            ? h(
                'div',
                { style: { display: 'flex', gap: '8px', flexShrink: 0 } },
                actions,
              )
            : null,
        )
      : null,
    children,
  );
}

export interface PanelProps {
  children: React.ReactNode;
  /** Apply padding inside the panel. Default `true`. */
  padded?: boolean;
  /** Render with an elevated surface (lowest container). Default `true`. */
  elevated?: boolean;
}

/**
 * A surface-backed content block. No borders, no shadows — relies on the
 * Stitch tonal layering rule so it reads as "lifted" against the page
 * background without ever drawing a stroke.
 */
export function Panel(props: PanelProps): React.ReactElement {
  const { children, padded = true, elevated = true } = props;
  return h(
    'div',
    {
      className: 'facetheory-stitch-panel',
      style: {
        background: elevated
          ? 'var(--stitch-color-surface-container-lowest, #ffffff)'
          : 'var(--stitch-color-surface-container-low, #f2f3ff)',
        borderRadius: 'var(--stitch-radius-xl, 16px)',
        padding: padded ? '24px' : '0',
      },
    },
    children,
  );
}

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  delta?: {
    value: React.ReactNode;
    trend?: 'up' | 'down' | 'flat';
  };
  icon?: React.ReactNode;
}

const TREND_COLOR: Record<'up' | 'down' | 'flat', string> = {
  up: 'var(--stitch-color-tertiary, #00332e)',
  down: 'var(--stitch-color-error, #ba1a1a)',
  flat: 'var(--stitch-color-on-surface-variant, #464553)',
};

/**
 * A single stat block used inside a SummaryStrip. Emits label, value, and
 * optional delta with a trend-aware color. Keep value content short — the
 * component is meant to be glanceable.
 */
export function StatCard(props: StatCardProps): React.ReactElement {
  const { label, value, delta, icon } = props;
  const trend = delta?.trend ?? 'flat';
  const inner = h(
    'div',
    {
      className: 'facetheory-stitch-stat-card',
      style: { display: 'flex', alignItems: 'flex-start', gap: '16px' },
    },
    icon !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-stat-card-icon',
            style: { fontSize: '20px', flexShrink: 0 },
          },
          icon,
        )
      : null,
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flex: 1,
          minWidth: 0,
        },
      },
      h(
        'span',
        {
          className: 'facetheory-stitch-stat-card-label',
          style: {
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        label,
      ),
      h(
        'span',
        {
          className: 'facetheory-stitch-stat-card-value',
          style: {
            fontSize: '28px',
            fontWeight: 600,
            lineHeight: 1.2,
            color: 'var(--stitch-color-on-surface, #131b2e)',
          },
        },
        value,
      ),
      delta !== undefined
        ? h(
            'span',
            {
              className: 'facetheory-stitch-stat-card-delta',
              style: { fontSize: '12px', color: TREND_COLOR[trend] },
            },
            delta.value,
          )
        : null,
    ),
  );
  return h(Panel, { padded: true, children: inner });
}

export interface SummaryStripProps {
  children: React.ReactNode;
  /** Target column count. `auto` uses a responsive minmax grid. Default `auto`. */
  columns?: number | 'auto';
}

/**
 * Horizontal arrangement of StatCards used at the top of overview pages.
 * Uses a CSS grid so it responds gracefully as the viewport narrows.
 */
export function SummaryStrip(props: SummaryStripProps): React.ReactElement {
  const { children, columns = 'auto' } = props;
  const gridTemplateColumns =
    columns === 'auto'
      ? 'repeat(auto-fit, minmax(220px, 1fr))'
      : `repeat(${columns}, 1fr)`;
  return h(
    'div',
    {
      className: 'facetheory-stitch-summary-strip',
      style: {
        display: 'grid',
        gridTemplateColumns,
        gap: '16px',
      },
    },
    children,
  );
}
