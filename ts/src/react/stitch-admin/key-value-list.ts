import * as React from 'react';

const h = React.createElement;

export interface KeyValueEntry {
  /** Stable identifier for React keying. */
  key: string;
  /** Left-column label (typically uppercase, monospaced). */
  label: React.ReactNode;
  /** Right-column value. Monospace by default; override via `valueMono=false`. */
  value: React.ReactNode;
}

export interface InlineKeyValueListProps {
  /** Entries rendered top-to-bottom. */
  entries: KeyValueEntry[];
  /**
   * Left-column width for labels. Use a fixed value when you want multiple
   * lists to line up (e.g. one per table row). Default `48px`.
   */
  labelWidth?: number | string;
  /** Render values in a monospace font. Default `true`. */
  valueMono?: boolean;
}

/**
 * Dense, cell-sized label/value stack. Designed for use inside data-table
 * cells that need to render a small identity grid (ORG / WKSP / CLIENT,
 * for example) without wrapping each row in a full PropertyGrid. The list
 * uses a shared label-column width so sibling lists line up vertically.
 */
export function InlineKeyValueList(
  props: InlineKeyValueListProps,
): React.ReactElement {
  const { entries, labelWidth = '48px', valueMono = true } = props;
  const labelWidthValue =
    typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth;

  return h(
    'dl',
    {
      className: 'facetheory-stitch-inline-key-value-list',
      style: {
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      },
    },
    entries.map((entry) =>
      h(
        'div',
        {
          key: entry.key,
          className: 'facetheory-stitch-inline-key-value-list-row',
          style: {
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            minWidth: 0,
          },
        },
        h(
          'dt',
          {
            style: {
              flex: `0 0 ${labelWidthValue}`,
              margin: 0,
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          entry.label,
        ),
        h(
          'dd',
          {
            style: {
              margin: 0,
              minWidth: 0,
              fontSize: '12px',
              fontFamily: valueMono
                ? 'var(--stitch-font-label, ui-monospace, SFMono-Regular, Menlo, monospace)'
                : 'inherit',
              color: 'var(--stitch-color-on-surface, #131b2e)',
              overflowWrap: 'anywhere',
            },
          },
          entry.value,
        ),
      ),
    ),
  );
}
