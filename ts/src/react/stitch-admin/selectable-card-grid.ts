import * as React from 'react';

import type {
  ChoiceCardProps,
  SelectableCardGrid,
  SelectableCardGridLayout,
  SelectableCardGridSelection,
  SelectableCardGridSize,
  SelectableCardOption,
  SelectableCardTone,
} from '../../stitch-admin/selectable-card-grid-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';
import { MetadataBadgeGroup } from './operator-notices.js';

const h = React.createElement;

export type {
  ChoiceCardProps,
  SelectableCardGrid,
  SelectableCardGridLayout,
  SelectableCardGridSelection,
  SelectableCardGridSize,
  SelectableCardOption,
  SelectableCardTone,
};

interface TonePalette {
  background: string;
  color: string;
  border: string;
}

const TONE_PALETTE: Record<SelectableCardTone, TonePalette> = {
  neutral: {
    background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
    color: 'var(--stitch-color-on-surface, #131b2e)',
    border: 'var(--stitch-color-outline-variant, #c6c5d0)',
  },
  info: {
    background: 'var(--stitch-color-primary-container, #e0e0ff)',
    color: 'var(--stitch-color-on-primary-container, #000066)',
    border: 'var(--stitch-color-primary-container, #e0e0ff)',
  },
  success: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-tertiary-container, #004c45)',
  },
  warning: {
    background: 'var(--stitch-color-secondary-container, #ffecc0)',
    color: 'var(--stitch-color-on-secondary-container, #3f2e00)',
    border: 'var(--stitch-color-secondary-container, #ffecc0)',
  },
  danger: {
    background: 'var(--stitch-color-error-container, #ffdad6)',
    color: 'var(--stitch-color-on-error-container, #93000a)',
    border: 'var(--stitch-color-error-container, #ffdad6)',
  },
  recommended: {
    background: 'var(--stitch-color-tertiary-container, #004c45)',
    color: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
    border: 'var(--stitch-color-on-tertiary-container, #52c1b4)',
  },
};

interface SizeTokens {
  padding: string;
  gap: string;
  titleFontSize: string;
  descriptionFontSize: string;
  borderRadius: string;
}

const SIZE_TOKENS: Record<SelectableCardGridSize, SizeTokens> = {
  sm: {
    padding: '10px 12px',
    gap: '6px',
    titleFontSize: '13px',
    descriptionFontSize: '12px',
    borderRadius: 'var(--stitch-radius-sm, 8px)',
  },
  md: {
    padding: '14px 16px',
    gap: '8px',
    titleFontSize: '14px',
    descriptionFontSize: '13px',
    borderRadius: 'var(--stitch-radius-md, 10px)',
  },
  lg: {
    padding: '18px 20px',
    gap: '10px',
    titleFontSize: '15px',
    descriptionFontSize: '14px',
    borderRadius: 'var(--stitch-radius-lg, 12px)',
  },
};

function layoutContainerStyle(
  layout: SelectableCardGridLayout,
): React.CSSProperties {
  switch (layout) {
    case 'stack':
      return { display: 'flex', flexDirection: 'column', gap: '10px' };
    case 'two-column':
      return {
        display: 'grid',
        gap: '10px',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      };
    case 'grid':
    default:
      return {
        display: 'grid',
        gap: '10px',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      };
  }
}

function isOptionDisabled(option: SelectableCardOption): boolean {
  return option.blocked === true || option.disabledReason !== undefined;
}

function deriveCardClassName(
  option: SelectableCardOption,
  selected: boolean,
): string {
  const tone = option.tone ?? 'neutral';
  const disabled = isOptionDisabled(option);
  const cls = [
    'facetheory-stitch-selectable-card',
    `facetheory-stitch-selectable-card-tone-${tone}`,
  ];
  if (selected) cls.push('facetheory-stitch-selectable-card-selected');
  if (disabled) cls.push('facetheory-stitch-selectable-card-disabled');
  if (option.blocked === true) cls.push('facetheory-stitch-selectable-card-blocked');
  if (option.recommended === true) cls.push('facetheory-stitch-selectable-card-recommended');
  return cls.join(' ');
}

function renderSafetyFootnote(policy: WizardSafetyPolicy): React.ReactElement {
  return h(
    'p',
    {
      className: 'facetheory-stitch-wizard-safety-footnote',
      'data-safety-policy': policy,
      style: {
        margin: 0,
        fontSize: '11px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--stitch-color-on-surface-variant, #464553)',
      },
    },
    `Safety policy: ${policy}`,
  );
}

function renderCardStatusPills(
  option: SelectableCardOption,
): React.ReactElement | null {
  const pills: React.ReactElement[] = [];
  if (option.recommended === true) {
    pills.push(
      h(
        'span',
        {
          key: 'recommended',
          className: 'facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-recommended',
          'data-pill': 'recommended',
        },
        'Recommended',
      ),
    );
  }
  if (option.blocked === true) {
    pills.push(
      h(
        'span',
        {
          key: 'blocked',
          className: 'facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-blocked',
          'data-pill': 'blocked',
        },
        'Blocked',
      ),
    );
  }
  if (option.riskLabel !== undefined && option.riskLabel !== '') {
    pills.push(
      h(
        'span',
        {
          key: 'risk',
          className: 'facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-risk',
          'data-pill': 'risk',
        },
        option.riskLabel,
      ),
    );
  }
  if (pills.length === 0) return null;
  return h(
    'div',
    {
      className: 'facetheory-stitch-selectable-card-pills',
      style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    },
    pills,
  );
}

function renderCardBody(
  option: SelectableCardOption,
  sizeTokens: SizeTokens,
  reasonId: string | undefined,
): React.ReactElement[] {
  const children: React.ReactElement[] = [];
  children.push(
    h(
      'div',
      {
        key: 'header',
        className: 'facetheory-stitch-selectable-card-header',
        style: { display: 'flex', alignItems: 'center', gap: '8px' },
      },
      option.icon !== undefined
        ? h(
            'span',
            {
              key: 'icon',
              className: 'facetheory-stitch-selectable-card-icon',
              'aria-hidden': 'true',
            },
            option.icon as React.ReactNode,
          )
        : null,
      h(
        'strong',
        {
          key: 'title',
          className: 'facetheory-stitch-selectable-card-title',
          style: { fontSize: sizeTokens.titleFontSize },
        },
        option.title as React.ReactNode,
      ),
      option.badge !== undefined
        ? h(
            'span',
            {
              key: 'badge',
              className: 'facetheory-stitch-selectable-card-badge',
            },
            option.badge as React.ReactNode,
          )
        : null,
    ),
  );
  if (option.description !== undefined) {
    children.push(
      h(
        'p',
        {
          key: 'description',
          className: 'facetheory-stitch-selectable-card-description',
          style: {
            margin: 0,
            fontSize: sizeTokens.descriptionFontSize,
            lineHeight: 1.5,
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        option.description as React.ReactNode,
      ),
    );
  }
  const statusPills = renderCardStatusPills(option);
  if (statusPills !== null) children.push(statusPills);
  if (option.blocked === true && option.blockedReason !== undefined) {
    children.push(
      h(
        'p',
        {
          key: 'blocked-reason',
          className: 'facetheory-stitch-selectable-card-blocked-reason',
          style: {
            margin: 0,
            fontSize: '12px',
            color: 'var(--stitch-color-on-error-container, #93000a)',
            fontWeight: 600,
          },
        },
        option.blockedReason,
      ),
    );
  }
  if (option.disabledReason !== undefined) {
    children.push(
      h(
        'p',
        {
          key: 'disabled-reason',
          id: reasonId,
          className: 'facetheory-stitch-selectable-card-disabled-reason',
          'data-disabled-reason': 'true',
          style: {
            margin: 0,
            fontSize: '12px',
            color: 'var(--stitch-color-on-surface-variant, #464553)',
            fontStyle: 'italic',
          },
        },
        option.disabledReason,
      ),
    );
  }
  if (option.metadata !== undefined) {
    children.push(h(MetadataBadgeGroup, { key: 'metadata', metadata: option.metadata }));
  }
  return children;
}

/* -------------------------------------------------------------------------- */
/* SelectableCardGridPanel                                                    */
/* -------------------------------------------------------------------------- */

export interface SelectableCardGridPanelProps {
  grid: SelectableCardGrid;
  /**
   * Required. Called whenever the primitive wants to propose a new selected
   * key set (user activated a card). The host owns acceptance; the
   * primitive does not toggle state internally.
   */
  onChange: (nextSelectedKeys: string[]) => void;
}

export function SelectableCardGridPanel(
  props: SelectableCardGridPanelProps,
): React.ReactElement {
  const { grid, onChange } = props;
  const layout: SelectableCardGridLayout = grid.layout ?? 'grid';
  const size: SelectableCardGridSize = grid.size ?? 'md';
  const sizeTokens = SIZE_TOKENS[size];
  const groupRole = grid.selection === 'single' ? 'radiogroup' : 'group';
  const labelId = grid.label !== undefined ? `${grid.groupId}-label` : undefined;
  const descriptionId =
    grid.description !== undefined ? `${grid.groupId}-description` : undefined;
  const ariaDescribedBy = descriptionId;

  function handleActivate(option: SelectableCardOption): void {
    if (isOptionDisabled(option)) return;
    if (grid.selection === 'single') {
      onChange([option.key]);
      return;
    }
    const isSelected = grid.selectedKeys.includes(option.key);
    const next = isSelected
      ? grid.selectedKeys.filter((k) => k !== option.key)
      : [...grid.selectedKeys, option.key];
    onChange(next);
  }

  return h(
    'section',
    {
      className: `facetheory-stitch-selectable-card-grid facetheory-stitch-selectable-card-grid-${grid.selection} facetheory-stitch-selectable-card-grid-layout-${layout} facetheory-stitch-selectable-card-grid-size-${size}`,
      'data-safety-policy': grid.safetyPolicy,
      'data-group-id': grid.groupId,
      'data-selection': grid.selection,
      'data-layout': layout,
      'data-size': size,
      'data-option-count': String(grid.options.length),
      'data-selected-count': String(grid.selectedKeys.length),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        borderRadius: 'var(--stitch-radius-lg, 12px)',
        background: 'var(--stitch-color-surface-container-low, #f2f3ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
      },
    },
    grid.label !== undefined || grid.description !== undefined
      ? h(
          'header',
          {
            className: 'facetheory-stitch-selectable-card-grid-header',
            style: { display: 'flex', flexDirection: 'column', gap: '4px' },
          },
          grid.label !== undefined
            ? h(
                'div',
                {
                  id: labelId,
                  className: 'facetheory-stitch-selectable-card-grid-label',
                  style: { fontSize: '13px', fontWeight: 600 },
                },
                grid.label as React.ReactNode,
              )
            : null,
          grid.description !== undefined
            ? h(
                'p',
                {
                  id: descriptionId,
                  className: 'facetheory-stitch-selectable-card-grid-description',
                  style: {
                    margin: 0,
                    fontSize: '12px',
                    lineHeight: 1.5,
                    color: 'var(--stitch-color-on-surface-variant, #464553)',
                  },
                },
                grid.description as React.ReactNode,
              )
            : null,
        )
      : null,
    h(
      'div',
      {
        role: groupRole,
        'aria-labelledby': labelId,
        'aria-describedby': ariaDescribedBy,
        className: 'facetheory-stitch-selectable-card-grid-options',
        style: layoutContainerStyle(layout),
      },
      grid.options.map((option) =>
        renderCardForGrid(
          option,
          grid.selection,
          grid.selectedKeys.includes(option.key),
          grid.groupId,
          sizeTokens,
          handleActivate,
        ),
      ),
    ),
    renderSafetyFootnote(grid.safetyPolicy),
  );
}

function renderCardForGrid(
  option: SelectableCardOption,
  selection: SelectableCardGridSelection,
  selected: boolean,
  groupId: string,
  sizeTokens: SizeTokens,
  onActivate: (option: SelectableCardOption) => void,
): React.ReactElement {
  const disabled = isOptionDisabled(option);
  const role = selection === 'single' ? 'radio' : 'checkbox';
  const reasonId =
    option.disabledReason !== undefined
      ? `${groupId}-${option.key}-reason`
      : undefined;
  const tone = option.tone ?? 'neutral';
  const palette = TONE_PALETTE[tone];

  return h(
    'div',
    {
      key: option.key,
      className: deriveCardClassName(option, selected),
      role,
      'aria-checked': selected ? 'true' : 'false',
      'aria-disabled': disabled ? 'true' : undefined,
      'aria-describedby': reasonId,
      tabIndex: disabled ? -1 : selected || selection === 'multi' ? 0 : -1,
      'data-option-key': option.key,
      'data-option-tone': tone,
      'data-option-selected': selected ? 'true' : 'false',
      'data-option-disabled': disabled ? 'true' : 'false',
      'data-option-blocked': option.blocked === true ? 'true' : 'false',
      'data-option-recommended': option.recommended === true ? 'true' : 'false',
      onClick: !disabled ? () => onActivate(option) : undefined,
      onKeyDown: !disabled
        ? (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              onActivate(option);
            }
          }
        : undefined,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: sizeTokens.gap,
        padding: sizeTokens.padding,
        borderRadius: sizeTokens.borderRadius,
        background: palette.background,
        color: palette.color,
        border: `${selected ? '2px' : '1px'} solid ${selected ? palette.color : palette.border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      },
    },
    renderCardBody(option, sizeTokens, reasonId),
  );
}

/* -------------------------------------------------------------------------- */
/* ChoiceCard (standalone single-card primitive)                              */
/* -------------------------------------------------------------------------- */

export interface ChoiceCardPanelProps {
  card: ChoiceCardProps;
  /** Called when the user activates the card. Host owns selection state. */
  onChange?: (selected: boolean) => void;
}

export function ChoiceCard(props: ChoiceCardPanelProps): React.ReactElement {
  const { card, onChange } = props;
  const { option, selection, selected, cardId, safetyPolicy } = card;
  const size: SelectableCardGridSize = card.size ?? 'md';
  const sizeTokens = SIZE_TOKENS[size];
  const disabled = isOptionDisabled(option);
  const role = selection === 'single' ? 'radio' : 'checkbox';
  const reasonId =
    option.disabledReason !== undefined ? `${cardId}-reason` : undefined;
  const tone = option.tone ?? 'neutral';
  const palette = TONE_PALETTE[tone];

  return h(
    'div',
    {
      id: cardId,
      className: `${deriveCardClassName(option, selected)} facetheory-stitch-choice-card`,
      role,
      'aria-checked': selected ? 'true' : 'false',
      'aria-disabled': disabled ? 'true' : undefined,
      'aria-describedby': reasonId,
      tabIndex: disabled ? -1 : 0,
      'data-safety-policy': safetyPolicy,
      'data-option-key': option.key,
      'data-option-tone': tone,
      'data-option-selected': selected ? 'true' : 'false',
      'data-option-disabled': disabled ? 'true' : 'false',
      'data-option-blocked': option.blocked === true ? 'true' : 'false',
      'data-option-recommended': option.recommended === true ? 'true' : 'false',
      'data-selection-family': selection,
      onClick:
        !disabled && onChange !== undefined
          ? () => onChange(!selected)
          : undefined,
      onKeyDown:
        !disabled && onChange !== undefined
          ? (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                onChange(!selected);
              }
            }
          : undefined,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: sizeTokens.gap,
        padding: sizeTokens.padding,
        borderRadius: sizeTokens.borderRadius,
        background: palette.background,
        color: palette.color,
        border: `${selected ? '2px' : '1px'} solid ${selected ? palette.color : palette.border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      },
    },
    renderCardBody(option, sizeTokens, reasonId),
  );
}
