/**
 * Vue parity for `WizardAuthorityContextStripPanel` (alias
 * `WizardServerResolvedContextBarPanel`). Mirrors the React adapter's
 * class names, data-* attributes, ARIA wiring, role markers, and
 * safety-policy footnote.
 */

import { defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import { safeMetadataHref } from '../../stitch-admin/safe-url.js';
import type {
  WizardAuthorityContextItem,
  WizardAuthorityContextItemTone,
  WizardAuthorityContextStrip,
  WizardAuthorityContextStripLayout,
  WizardAuthorityContextStripSize,
  WizardServerResolvedContextBar,
  WizardServerResolvedContextBarItem,
  WizardServerResolvedContextBarLayout,
  WizardServerResolvedContextBarSize,
  WizardServerResolvedContextBarTone,
} from '../../stitch-admin/wizard-authority-context-strip-types.js';
import type { WizardSafetyPolicy } from '../../stitch-admin/wizard-types.js';
import { renderPropContent, vnodeChildProp } from '../stitch-common.js';

export type {
  WizardAuthorityContextItem,
  WizardAuthorityContextItemTone,
  WizardAuthorityContextStrip,
  WizardAuthorityContextStripLayout,
  WizardAuthorityContextStripSize,
  WizardServerResolvedContextBar,
  WizardServerResolvedContextBarItem,
  WizardServerResolvedContextBarLayout,
  WizardServerResolvedContextBarSize,
  WizardServerResolvedContextBarTone,
};

export interface WizardAuthorityContextStripPanelProps {
  title?: VNodeChild;
  description?: VNodeChild;
  strip: WizardAuthorityContextStrip;
  onCopyItem?: (itemKey: string, copyValue: string) => void;
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

function renderHeader(
  title: VNodeChild | undefined,
  description: VNodeChild | undefined,
  strip: WizardAuthorityContextStrip,
): VNodeChild {
  const hasTitle = title !== undefined;
  const hasDescription = description !== undefined;
  const hasAuthority = strip.authorityLabel !== undefined;
  const hasReadOnly = strip.readOnlyLabel !== undefined;
  const hasActions = strip.actions !== undefined;
  if (!hasTitle && !hasDescription && !hasAuthority && !hasReadOnly && !hasActions) {
    return null;
  }
  return h(
    'header',
    { class: 'facetheory-stitch-wizard-authority-context-strip-header' },
    [
      h('div', null, [
        hasTitle ? h('h2', null, renderPropContent(title)) : null,
        hasDescription ? h('p', null, renderPropContent(description)) : null,
        hasAuthority || hasReadOnly
          ? h(
              'div',
              { class: 'facetheory-stitch-wizard-authority-context-strip-status' },
              [
                hasAuthority
                  ? h(
                      'span',
                      {
                        class: 'facetheory-stitch-wizard-authority-context-strip-authority',
                        'data-authority-label': 'true',
                      },
                      renderPropContent(strip.authorityLabel as VNodeChild),
                    )
                  : null,
                hasReadOnly
                  ? h(
                      'span',
                      {
                        class: 'facetheory-stitch-wizard-authority-context-strip-readonly',
                        'data-read-only-label': 'true',
                        'aria-label': 'Read-only',
                      },
                      renderPropContent(strip.readOnlyLabel as VNodeChild),
                    )
                  : null,
              ],
            )
          : null,
      ]),
      hasActions
        ? h(
            'div',
            { class: 'facetheory-stitch-wizard-authority-context-strip-actions' },
            renderPropContent(strip.actions as VNodeChild),
          )
        : null,
    ],
  );
}

function renderItem(
  item: WizardAuthorityContextItem,
  onCopyItem: WizardAuthorityContextStripPanelProps['onCopyItem'],
): VNodeChild {
  const tone: WizardAuthorityContextItemTone = item.tone ?? 'neutral';
  const valueString =
    item.copyValue !== undefined
      ? item.copyValue
      : typeof item.value === 'string'
        ? (item.value as string)
        : undefined;
  const showCopy = item.copyable === true && valueString !== undefined;
  const safeHref = safeMetadataHref(item.href);
  return h(
    'div',
    {
      key: item.key,
      class: `facetheory-stitch-wizard-authority-context-strip-item facetheory-stitch-wizard-authority-context-strip-item-tone-${tone}`,
      'data-item-key': item.key,
      'data-item-tone': tone,
      'data-item-copyable': showCopy ? 'true' : 'false',
    },
    [
      h(
        'dt',
        {
          class: 'facetheory-stitch-wizard-authority-context-strip-item-label',
        },
        [
          item.icon !== undefined
            ? h(
                'span',
                {
                  class: 'facetheory-stitch-wizard-authority-context-strip-item-icon',
                  'aria-hidden': 'true',
                },
                renderPropContent(item.icon as VNodeChild),
              )
            : null,
          h(
            'span',
            {
              class: 'facetheory-stitch-wizard-authority-context-strip-item-label-text',
            },
            renderPropContent(item.label as VNodeChild),
          ),
          item.badge !== undefined
            ? h(
                'span',
                {
                  class: 'facetheory-stitch-wizard-authority-context-strip-item-badge',
                },
                renderPropContent(item.badge as VNodeChild),
              )
            : null,
        ],
      ),
      h(
        'dd',
        {
          class: 'facetheory-stitch-wizard-authority-context-strip-item-value',
          title: item.title,
        },
        [
          safeHref !== undefined
            ? h(
                'a',
                {
                  href: safeHref,
                  class: 'facetheory-stitch-wizard-authority-context-strip-item-value-link',
                },
                renderPropContent(item.value as VNodeChild),
              )
            : h(
                'span',
                {
                  class: 'facetheory-stitch-wizard-authority-context-strip-item-value-text',
                },
                renderPropContent(item.value as VNodeChild),
              ),
          showCopy && valueString !== undefined
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'facetheory-stitch-wizard-authority-context-strip-item-copy',
                  'aria-label': `Copy ${typeof item.label === 'string' ? item.label : `item ${item.key}`}`,
                  'data-copy-item-key': item.key,
                  'data-copy-value': valueString,
                  onClick: onCopyItem !== undefined
                    ? () => onCopyItem(item.key, valueString)
                    : undefined,
                },
                'Copy',
              )
            : null,
        ],
      ),
    ],
  );
}

export const WizardAuthorityContextStripPanel = defineComponent({
  name: 'FaceTheoryVueWizardAuthorityContextStripPanel',
  props: {
    title: vnodeChildProp,
    description: vnodeChildProp,
    strip: { type: Object as PropType<WizardAuthorityContextStrip>, required: true },
    onCopyItem: {
      type: Function as PropType<(itemKey: string, copyValue: string) => void>,
      required: false,
    },
  },
  setup(props) {
    return () => {
      const strip = props.strip;
      const layout: WizardAuthorityContextStripLayout = strip.layout ?? 'auto';
      const size: WizardAuthorityContextStripSize = strip.size ?? 'md';
      const wrap = strip.wrap !== false;
      const itemCount = strip.items.length;
      const ariaLabel = typeof props.title === 'string' ? props.title : 'Server-resolved context';
      return h(
        'section',
        {
          class: `facetheory-stitch-wizard-authority-context-strip facetheory-stitch-wizard-authority-context-strip-layout-${layout} facetheory-stitch-wizard-authority-context-strip-size-${size}`,
          'data-safety-policy': strip.safetyPolicy,
          'data-layout': layout,
          'data-size': size,
          'data-wrap': wrap ? 'true' : 'false',
          'data-item-count': String(itemCount),
          'data-read-only': strip.readOnlyLabel !== undefined ? 'true' : 'false',
          'data-has-authority-label': strip.authorityLabel !== undefined ? 'true' : 'false',
          role: 'region',
          'aria-label': ariaLabel,
        },
        [
          renderHeader(props.title, props.description, strip),
          itemCount > 0
            ? h(
                'dl',
                {
                  class: 'facetheory-stitch-wizard-authority-context-strip-items',
                },
                strip.items.map((item) => renderItem(item, props.onCopyItem)),
              )
            : h(
                'div',
                {
                  class: 'facetheory-stitch-wizard-authority-context-strip-empty',
                  role: 'status',
                },
                strip.emptyLabel !== undefined
                  ? renderPropContent(strip.emptyLabel as VNodeChild)
                  : 'No server-resolved context available.',
              ),
          renderSafetyFootnote(strip.safetyPolicy),
        ],
      );
    };
  },
});

export const WizardServerResolvedContextBarPanel = WizardAuthorityContextStripPanel;
export type WizardServerResolvedContextBarPanelProps = WizardAuthorityContextStripPanelProps;
