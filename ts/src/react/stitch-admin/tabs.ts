import * as React from 'react';
import { Tabs as AntdTabs } from 'antd';
import type { TabsProps as AntdTabsProps } from 'antd';

import type { TabItem as SharedTabItem } from '../../stitch-admin/tabs-types.js';

const h = React.createElement;

export interface TabItem extends Omit<SharedTabItem, 'label' | 'icon'> {
  /** Display label rendered next to the optional count badge. */
  label: React.ReactNode;
  /** Optional leading icon node. */
  icon?: React.ReactNode;
}

export interface TabsProps {
  /** Tab definitions. Hidden items are filtered out before rendering. */
  items: TabItem[];
  /** Currently selected key. Leave undefined for uncontrolled usage. */
  activeKey?: string;
  /** Default selection when uncontrolled. */
  defaultActiveKey?: string;
  /** Fires with the newly-selected key. */
  onChange?: (key: string) => void;
  /**
   * Optional content for the active tab's panel. When omitted, the Tabs
   * primitive is used purely for navigation — callers render their own
   * content region below based on `activeKey`.
   */
  children?: React.ReactNode;
  /** `line` draws a bottom underline; `card` draws a tonal pill. Default `line`. */
  variant?: 'line' | 'card';
}

function renderLabel(
  label: React.ReactNode,
  icon: React.ReactNode | undefined,
  count: number | undefined,
): React.ReactNode {
  const countNode =
    count !== undefined
      ? h(
          'span',
          {
            className: 'facetheory-stitch-tabs-count',
            style: {
              marginLeft: '8px',
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
              background: 'var(--stitch-color-surface-container-high, #e2e7ff)',
              color: 'var(--stitch-color-on-surface-variant, #464553)',
            },
          },
          count,
        )
      : null;

  return h(
    'span',
    {
      className: 'facetheory-stitch-tabs-label',
      style: { display: 'inline-flex', alignItems: 'center', gap: '8px' },
    },
    icon !== undefined
      ? h(
          'span',
          {
            className: 'facetheory-stitch-tabs-icon',
            style: { display: 'inline-flex', alignItems: 'center' },
          },
          icon,
        )
      : null,
    h('span', null, label),
    countNode,
  );
}

/**
 * Dense-admin tab bar. Wraps AntD's `Tabs` with Stitch-tonal labels that
 * support an inline count badge and an optional leading icon. Usable as
 * either a content switcher (pass `children`) or pure navigation (omit
 * `children` and render your own content below based on `activeKey`).
 */
export function Tabs(props: TabsProps): React.ReactElement {
  const { items, activeKey, defaultActiveKey, onChange, children, variant } =
    props;

  const visibleItems = items.filter((item) => item.hidden !== true);
  const resolvedActiveKey =
    activeKey ?? defaultActiveKey ?? visibleItems[0]?.key;

  const antdItems: NonNullable<AntdTabsProps['items']> = visibleItems.map(
    (item) => {
      const out: NonNullable<AntdTabsProps['items']>[number] = {
        key: item.key,
        label: renderLabel(item.label, item.icon, item.count),
      };
      if (item.disabled === true) out.disabled = true;
      if (children !== undefined && resolvedActiveKey === item.key) {
        out.children = children;
      }
      return out;
    },
  );

  const antdProps: AntdTabsProps = { items: antdItems };
  if (activeKey !== undefined) antdProps.activeKey = activeKey;
  if (defaultActiveKey !== undefined) {
    antdProps.defaultActiveKey = defaultActiveKey;
  }
  if (onChange !== undefined) antdProps.onChange = onChange;
  if (variant === 'card') antdProps.type = 'card';

  return h(
    'div',
    { className: 'facetheory-stitch-tabs' },
    h(AntdTabs, antdProps),
  );
}
