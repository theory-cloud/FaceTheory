import * as React from 'react';

const h = React.createElement;

export interface PropertyItem {
  key: string;
  label: React.ReactNode;
  value: React.ReactNode;
  /** Full-width: row spans both columns. */
  span?: 'half' | 'full';
}

export interface PropertyGridProps {
  items: PropertyItem[];
  /** Number of columns at full width. Default 2. */
  columns?: number;
}

/**
 * Dense metadata grid for entity overview screens. Each item renders as a
 * label/value pair with the label in the Stitch secondary tone. `span: 'full'`
 * forces a row onto its own line.
 */
export function PropertyGrid(props: PropertyGridProps): React.ReactElement {
  const { items, columns = 2 } = props;
  return h(
    'dl',
    {
      className: 'facetheory-stitch-property-grid',
      style: {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        columnGap: '24px',
        rowGap: '16px',
        margin: 0,
      },
    },
    items.map((item) =>
      h(
        'div',
        {
          key: item.key,
          style: {
            gridColumn:
              item.span === 'full' ? `1 / span ${columns}` : undefined,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: 0,
          },
        },
        h(
          'dt',
          {
            style: {
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
              margin: 0,
            },
          },
          item.label,
        ),
        h(
          'dd',
          {
            style: {
              margin: 0,
              fontSize: '14px',
              color: 'var(--stitch-color-on-surface, #131b2e)',
              wordBreak: 'break-word',
            },
          },
          item.value,
        ),
      ),
    ),
  );
}

export interface DetailPanelProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  properties: PropertyItem[];
  columns?: number;
}

/**
 * Entity overview panel: title + optional description/actions + PropertyGrid.
 * Use this for the top-of-page metadata block on detail routes.
 */
export function DetailPanel(props: DetailPanelProps): React.ReactElement {
  const { title, description, actions, properties, columns } = props;
  const gridProps: PropertyGridProps = { items: properties };
  if (columns !== undefined) gridProps.columns = columns;

  return h(
    'section',
    {
      className: 'facetheory-stitch-detail-panel',
      style: {
        background: 'var(--stitch-color-surface-container-lowest, #ffffff)',
        borderRadius: 'var(--stitch-radius-xl, 16px)',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      },
    },
    title !== undefined || actions !== undefined || description !== undefined
      ? h(
          'header',
          {
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '16px',
            },
          },
          h(
            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
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
                      fontSize: '13px',
                      color: 'var(--stitch-color-on-surface-variant, #464553)',
                    },
                  },
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
    h(PropertyGrid, gridProps),
  );
}
