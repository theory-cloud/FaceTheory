import { defineComponent, h, ref } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import type { TabItem as SharedTabItem } from '../../stitch-admin/tabs-types.js';
import {
  renderDefaultSlot,
  renderPropContent,
} from '../stitch-common.js';

export interface TabItem extends Omit<SharedTabItem, 'label' | 'icon'> {
  label: VNodeChild;
  icon?: VNodeChild;
}

export interface TabsProps {
  items: TabItem[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
  variant?: 'line' | 'card';
}

export const Tabs = defineComponent({
  name: 'FaceTheoryVueTabs',
  props: {
    items: {
      type: Array as PropType<TabItem[]>,
      required: true,
    },
    activeKey: { type: String, required: false },
    defaultActiveKey: { type: String, required: false },
    onChange: {
      type: Function as PropType<((key: string) => void) | undefined>,
      required: false,
    },
    variant: {
      type: String as PropType<'line' | 'card'>,
      default: 'line',
    },
  },
  setup(props, { slots }) {
    const internalActiveKey = ref<string | undefined>(props.defaultActiveKey);

    return () => {
      const visibleItems = props.items.filter((item) => item.hidden !== true);
      const activeKey =
        props.activeKey ?? internalActiveKey.value ?? visibleItems[0]?.key;
      const panelContent = renderDefaultSlot(slots);

      return h(
        'div',
        {
          class: 'facetheory-stitch-tabs',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          },
        },
        [
          h(
            'div',
            {
              class: 'facetheory-stitch-tabs-bar',
              role: 'tablist',
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: props.variant === 'card' ? '8px' : '24px',
                borderBottom:
                  props.variant === 'line'
                    ? '1px solid var(--stitch-color-outline-variant, #c8c4d5)'
                    : undefined,
              },
            },
            visibleItems.map((item) => {
              const isActive = item.key === activeKey;
              return h(
                'button',
                {
                  key: item.key,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': isActive ? 'true' : 'false',
                  disabled: item.disabled === true,
                  class: 'facetheory-stitch-tabs-trigger',
                  onClick: () => {
                    if (item.disabled) return;
                    if (props.activeKey === undefined) {
                      internalActiveKey.value = item.key;
                    }
                    props.onChange?.(item.key);
                  },
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding:
                      props.variant === 'card' ? '8px 12px' : '10px 0 12px',
                    marginBottom: props.variant === 'line' ? '-1px' : undefined,
                    border:
                      props.variant === 'card'
                        ? '1px solid var(--stitch-color-outline-variant, #c8c4d5)'
                        : 'none',
                    borderBottom:
                      props.variant === 'line'
                        ? `2px solid ${
                            isActive
                              ? 'var(--stitch-color-primary, #3a48c8)'
                              : 'transparent'
                          }`
                        : undefined,
                    borderRadius:
                      props.variant === 'card'
                        ? 'var(--stitch-radius-md, 8px)'
                        : undefined,
                    background:
                      props.variant === 'card' && isActive
                        ? 'var(--stitch-color-surface-container-low, #f2f3ff)'
                        : 'transparent',
                    color: item.disabled
                      ? 'var(--stitch-color-on-surface-variant, #868391)'
                      : isActive
                        ? 'var(--stitch-color-on-surface, #131b2e)'
                        : 'var(--stitch-color-on-surface-variant, #464553)',
                    cursor: item.disabled ? 'default' : 'pointer',
                    font: 'inherit',
                  },
                },
                [
                  h(
                    'span',
                    {
                      class: 'facetheory-stitch-tabs-label',
                      style: {
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                      },
                    },
                    [
                      item.icon !== undefined
                        ? h(
                            'span',
                            {
                              class: 'facetheory-stitch-tabs-icon',
                              style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                              },
                            },
                            renderPropContent(item.icon),
                          )
                        : null,
                      h('span', null, renderPropContent(item.label)),
                      item.count !== undefined
                        ? h(
                            'span',
                            {
                              class: 'facetheory-stitch-tabs-count',
                              style: {
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: '20px',
                                height: '18px',
                                padding: '0 6px',
                                fontSize: '11px',
                                fontWeight: 600,
                                lineHeight: 1,
                                borderRadius: '9999px',
                                background:
                                  'var(--stitch-color-surface-container-high, #e2e7ff)',
                                color:
                                  'var(--stitch-color-on-surface-variant, #464553)',
                              },
                            },
                            String(item.count),
                          )
                        : null,
                    ],
                  ),
                ],
              );
            }),
          ),
          panelContent.length > 0 && activeKey !== undefined
            ? h(
                'div',
                {
                  class: 'facetheory-stitch-tabs-panel',
                },
                panelContent,
              )
            : null,
        ],
      );
    };
  },
});
