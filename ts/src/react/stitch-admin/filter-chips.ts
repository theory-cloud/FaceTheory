import * as React from 'react';

import type { FilterChipConfig as SharedFilterChipConfig } from '../../stitch-admin/filter-types.js';

const h = React.createElement;

export interface FilterChipConfig extends Omit<
  SharedFilterChipConfig,
  'label'
> {
  label: React.ReactNode;
}

export interface FilterChipProps extends FilterChipConfig {
  /** Fires when the chip body is clicked (e.g. to toggle the filter). */
  onClick?: () => void;
  /** Fires when the remove affordance is clicked. */
  onRemove?: () => void;
}

const CHIP_BASE_CLASS = 'facetheory-stitch-filter-chip';

/**
 * A single filter chip. Renders as a pill with an optional count and a
 * removal button. The chip itself is clickable (for toggling filter state);
 * the removal button is a separate target.
 */
export function FilterChip(props: FilterChipProps): React.ReactElement {
  const {
    label,
    count,
    active = true,
    removable = true,
    onClick,
    onRemove,
  } = props;

  const colors = active
    ? {
        background: 'var(--stitch-color-primary-container, #e0e0ff)',
        color: 'var(--stitch-color-on-primary-container, #000066)',
      }
    : {
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      };

  const bodyProps: React.HTMLAttributes<HTMLButtonElement> & {
    type: 'button';
  } = {
    type: 'button',
    className: `${CHIP_BASE_CLASS}-body`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: 1.4,
      background: colors.background,
      color: colors.color,
      border: 'none',
      borderRadius: '9999px',
      cursor: onClick !== undefined ? 'pointer' : 'default',
    },
  };
  if (onClick !== undefined) bodyProps.onClick = onClick;

  const removeProps: React.HTMLAttributes<HTMLButtonElement> & {
    type: 'button';
  } = {
    type: 'button',
    'aria-label': 'Remove filter',
    className: `${CHIP_BASE_CLASS}-remove`,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '16px',
      height: '16px',
      marginLeft: '4px',
      fontSize: '12px',
      lineHeight: 1,
      color: 'inherit',
      background: 'transparent',
      border: 'none',
      borderRadius: '9999px',
      cursor: 'pointer',
    },
  };
  if (onRemove !== undefined) removeProps.onClick = onRemove;

  return h(
    'span',
    {
      className: CHIP_BASE_CLASS,
      style: { display: 'inline-flex', alignItems: 'center' },
    },
    h(
      'button',
      bodyProps,
      h('span', null, label),
      count !== undefined
        ? h(
            'span',
            {
              className: `${CHIP_BASE_CLASS}-count`,
              style: {
                fontVariantNumeric: 'tabular-nums',
                opacity: 0.75,
              },
            },
            count,
          )
        : null,
    ),
    removable ? h('button', removeProps, '×') : null,
  );
}

export interface FilterChipGroupProps {
  /** Chip definitions rendered left-to-right. */
  chips: FilterChipConfig[];
  /** Fires when a chip body is clicked. */
  onChipClick?: (key: string) => void;
  /** Fires when a chip's remove affordance is clicked. */
  onChipRemove?: (key: string) => void;
  /** Optional trailing slot (e.g. "Clear all" link). */
  trailing?: React.ReactNode;
}

/**
 * Horizontal row of FilterChips with consistent spacing. Lives inside the
 * center or left slot of a `DataTable` toolbar. Rows wrap when the viewport
 * narrows rather than overflowing.
 */
export function FilterChipGroup(
  props: FilterChipGroupProps,
): React.ReactElement {
  const { chips, onChipClick, onChipRemove, trailing } = props;
  return h(
    'div',
    {
      className: 'facetheory-stitch-filter-chip-group',
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
      },
    },
    ...chips.map((chip) => {
      const chipProps: FilterChipProps = { ...chip };
      if (onChipClick !== undefined) {
        chipProps.onClick = () => onChipClick(chip.key);
      }
      if (onChipRemove !== undefined) {
        chipProps.onRemove = () => onChipRemove(chip.key);
      }
      return h(FilterChip, { ...chipProps, key: chip.key });
    }),
    trailing !== undefined
      ? h(
          'span',
          {
            className: 'facetheory-stitch-filter-chip-group-trailing',
            style: { marginLeft: 'auto', display: 'inline-flex' },
          },
          trailing,
        )
      : null,
  );
}
