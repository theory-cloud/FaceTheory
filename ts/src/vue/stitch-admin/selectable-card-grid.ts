/**
 * Vue parity for `SelectableCardGridPanel` and `ChoiceCard`. Mirrors the
 * React adapter's class names, data-* attributes, ARIA wiring (radiogroup
 * vs checkbox group, aria-checked, aria-disabled, aria-describedby), role
 * markers, and safety-policy footnote.
 */

import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

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
import { renderPropContent } from '../stitch-common.js';
import { MetadataBadgeGroup } from './operator-notices.js';

export type {
  ChoiceCardProps,
  SelectableCardGrid,
  SelectableCardGridLayout,
  SelectableCardGridSelection,
  SelectableCardGridSize,
  SelectableCardOption,
  SelectableCardTone,
};

function isOptionDisabled(option: SelectableCardOption): boolean {
  return option.blocked === true || option.disabledReason !== undefined;
}

function deriveCardClassName(option: SelectableCardOption, selected: boolean): string {
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

function renderSafetyFootnote(policy: WizardSafetyPolicy): VNodeChild {
  return h(
    'p',
    {
      class: 'facetheory-stitch-wizard-safety-footnote',
      'data-safety-policy': policy,
    },
    `Safety policy: ${policy}`,
  );
}

function renderCardStatusPills(option: SelectableCardOption): VNodeChild {
  const pills: VNodeChild[] = [];
  if (option.recommended === true) {
    pills.push(
      h(
        'span',
        {
          key: 'recommended',
          class:
            'facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-recommended',
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
          class:
            'facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-blocked',
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
          class:
            'facetheory-stitch-selectable-card-pill facetheory-stitch-selectable-card-pill-risk',
          'data-pill': 'risk',
        },
        option.riskLabel,
      ),
    );
  }
  if (pills.length === 0) return null;
  return h(
    'div',
    { class: 'facetheory-stitch-selectable-card-pills' },
    pills,
  );
}

function renderCardBody(
  option: SelectableCardOption,
  reasonId: string | undefined,
): VNodeChild[] {
  const children: VNodeChild[] = [];
  children.push(
    h(
      'div',
      { class: 'facetheory-stitch-selectable-card-header' },
      [
        option.icon !== undefined
          ? h(
              'span',
              {
                class: 'facetheory-stitch-selectable-card-icon',
                'aria-hidden': 'true',
              },
              renderPropContent(option.icon as VNodeChild),
            )
          : null,
        h(
          'strong',
          { class: 'facetheory-stitch-selectable-card-title' },
          renderPropContent(option.title as VNodeChild),
        ),
        option.badge !== undefined
          ? h(
              'span',
              { class: 'facetheory-stitch-selectable-card-badge' },
              renderPropContent(option.badge as VNodeChild),
            )
          : null,
      ],
    ),
  );
  if (option.description !== undefined) {
    children.push(
      h(
        'p',
        { class: 'facetheory-stitch-selectable-card-description' },
        renderPropContent(option.description as VNodeChild),
      ),
    );
  }
  const pills = renderCardStatusPills(option);
  if (pills !== null) children.push(pills);
  if (option.blocked === true && option.blockedReason !== undefined) {
    children.push(
      h(
        'p',
        { class: 'facetheory-stitch-selectable-card-blocked-reason' },
        option.blockedReason,
      ),
    );
  }
  if (option.disabledReason !== undefined) {
    children.push(
      h(
        'p',
        {
          id: reasonId,
          class: 'facetheory-stitch-selectable-card-disabled-reason',
          'data-disabled-reason': 'true',
        },
        option.disabledReason,
      ),
    );
  }
  if (option.metadata !== undefined) {
    children.push(h(MetadataBadgeGroup, { metadata: option.metadata }));
  }
  return children;
}

function renderCardForGrid(
  option: SelectableCardOption,
  selection: SelectableCardGridSelection,
  selected: boolean,
  groupId: string,
  onActivate: (option: SelectableCardOption) => void,
): VNodeChild {
  const disabled = isOptionDisabled(option);
  const role = selection === 'single' ? 'radio' : 'checkbox';
  const reasonId =
    option.disabledReason !== undefined
      ? `${groupId}-${option.key}-reason`
      : undefined;
  const tone = option.tone ?? 'neutral';
  const props: Record<string, unknown> = {
    key: option.key,
    class: deriveCardClassName(option, selected),
    role,
    'aria-checked': selected ? 'true' : 'false',
    'data-option-key': option.key,
    'data-option-tone': tone,
    'data-option-selected': selected ? 'true' : 'false',
    'data-option-disabled': disabled ? 'true' : 'false',
    'data-option-blocked': option.blocked === true ? 'true' : 'false',
    'data-option-recommended': option.recommended === true ? 'true' : 'false',
    tabindex: disabled ? -1 : selected || selection === 'multi' ? 0 : -1,
  };
  if (disabled) props['aria-disabled'] = 'true';
  if (reasonId !== undefined) props['aria-describedby'] = reasonId;
  if (!disabled) {
    props.onClick = () => onActivate(option);
    props.onKeydown = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        onActivate(option);
      }
    };
  }
  return h('div', props, renderCardBody(option, reasonId));
}

export interface SelectableCardGridPanelProps {
  grid: SelectableCardGrid;
  onChange: (nextSelectedKeys: string[]) => void;
}

export const SelectableCardGridPanel = defineComponent({
  name: 'FaceTheoryVueSelectableCardGridPanel',
  props: {
    grid: { type: Object as PropType<SelectableCardGrid>, required: true },
    onChange: {
      type: Function as PropType<(nextSelectedKeys: string[]) => void>,
      required: true,
    },
  },
  setup(props) {
    return () => {
      const grid = props.grid;
      const onChange = props.onChange;
      const layout: SelectableCardGridLayout = grid.layout ?? 'grid';
      const size: SelectableCardGridSize = grid.size ?? 'md';
      const groupRole = grid.selection === 'single' ? 'radiogroup' : 'group';
      const labelId =
        grid.label !== undefined ? `${grid.groupId}-label` : undefined;
      const descriptionId =
        grid.description !== undefined
          ? `${grid.groupId}-description`
          : undefined;

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

      const groupProps: Record<string, unknown> = {
        role: groupRole,
        class: 'facetheory-stitch-selectable-card-grid-options',
      };
      if (labelId !== undefined) groupProps['aria-labelledby'] = labelId;
      if (descriptionId !== undefined)
        groupProps['aria-describedby'] = descriptionId;

      return h(
        'section',
        {
          class: `facetheory-stitch-selectable-card-grid facetheory-stitch-selectable-card-grid-${grid.selection} facetheory-stitch-selectable-card-grid-layout-${layout} facetheory-stitch-selectable-card-grid-size-${size}`,
          'data-safety-policy': grid.safetyPolicy,
          'data-group-id': grid.groupId,
          'data-selection': grid.selection,
          'data-layout': layout,
          'data-size': size,
          'data-option-count': String(grid.options.length),
          'data-selected-count': String(grid.selectedKeys.length),
        },
        [
          grid.label !== undefined || grid.description !== undefined
            ? h(
                'header',
                { class: 'facetheory-stitch-selectable-card-grid-header' },
                [
                  grid.label !== undefined
                    ? h(
                        'div',
                        {
                          id: labelId,
                          class: 'facetheory-stitch-selectable-card-grid-label',
                        },
                        renderPropContent(grid.label as VNodeChild),
                      )
                    : null,
                  grid.description !== undefined
                    ? h(
                        'p',
                        {
                          id: descriptionId,
                          class:
                            'facetheory-stitch-selectable-card-grid-description',
                        },
                        renderPropContent(grid.description as VNodeChild),
                      )
                    : null,
                ],
              )
            : null,
          h(
            'div',
            groupProps,
            grid.options.map((option) =>
              renderCardForGrid(
                option,
                grid.selection,
                grid.selectedKeys.includes(option.key),
                grid.groupId,
                handleActivate,
              ),
            ),
          ),
          renderSafetyFootnote(grid.safetyPolicy),
        ],
      );
    };
  },
});

export interface ChoiceCardPanelProps {
  card: ChoiceCardProps;
  onChange?: (selected: boolean) => void;
}

export const ChoiceCard = defineComponent({
  name: 'FaceTheoryVueChoiceCard',
  props: {
    card: { type: Object as PropType<ChoiceCardProps>, required: true },
    onChange: {
      type: Function as PropType<(selected: boolean) => void>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const card = props.card;
      const onChange = props.onChange;
      const { option, selection, selected, cardId, safetyPolicy } = card;
      const disabled = isOptionDisabled(option);
      const role = selection === 'single' ? 'radio' : 'checkbox';
      const reasonId =
        option.disabledReason !== undefined ? `${cardId}-reason` : undefined;
      const tone = option.tone ?? 'neutral';
      const cardProps: Record<string, unknown> = {
        id: cardId,
        class: `${deriveCardClassName(option, selected)} facetheory-stitch-choice-card`,
        role,
        'aria-checked': selected ? 'true' : 'false',
        'data-safety-policy': safetyPolicy,
        'data-option-key': option.key,
        'data-option-tone': tone,
        'data-option-selected': selected ? 'true' : 'false',
        'data-option-disabled': disabled ? 'true' : 'false',
        'data-option-blocked': option.blocked === true ? 'true' : 'false',
        'data-option-recommended':
          option.recommended === true ? 'true' : 'false',
        'data-selection-family': selection,
        tabindex: disabled ? -1 : 0,
      };
      if (disabled) cardProps['aria-disabled'] = 'true';
      if (reasonId !== undefined) cardProps['aria-describedby'] = reasonId;
      if (!disabled && onChange !== undefined) {
        cardProps.onClick = () => onChange(!selected);
        cardProps.onKeydown = (event: KeyboardEvent) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            onChange(!selected);
          }
        };
      }
      return h('div', cardProps, renderCardBody(option, reasonId));
    };
  },
});
