import { Fragment, defineComponent, h } from 'vue';
import type { PropType, VNodeChild } from 'vue';

import {
  buttonClassName,
  classifyResponsiveLinkClick,
  forcedSafeLinkRel,
  handleResponsiveLinkClick,
  loadingStateClassName,
  normalizeAsyncViewState,
  skeletonClassName,
  spinnerClassName,
  spinnerSvgSize,
  suppressButtonActivation,
  type AsyncViewStateStatus,
  type ButtonSize,
  type ButtonVariant,
  type LoadingPlacement,
  type LoadingStateSize,
  type ResponsiveLinkNavigateHandler,
  type SkeletonAnimation,
  type SkeletonHeightPreset,
  type SkeletonVariant,
  type SkeletonWidthPreset,
  type SpinnerSize,
  type SpinnerTone,
} from '../../responsive-primitives/index.js';

function slotContent(value: VNodeChild | undefined): VNodeChild[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeClassValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function splitAttrs(attrs: Record<string, unknown>): {
  attrClass: unknown;
  onClick: unknown;
  rest: Record<string, unknown>;
} {
  const { class: attrClass, onClick, ...rest } = attrs;
  return { attrClass, onClick, rest };
}

function callVueHandler(handler: unknown, event: Event): void {
  if (Array.isArray(handler)) {
    for (const item of handler) callVueHandler(item, event);
    return;
  }
  if (typeof handler === 'function') {
    (handler as (event: Event) => void)(event);
  }
}

export const Spinner = defineComponent({
  name: 'FaceTheoryResponsiveSpinner',
  inheritAttrs: false,
  props: {
    label: { type: String, default: 'Loading' },
    size: { type: String as PropType<SpinnerSize>, default: 'md' },
    tone: { type: String as PropType<SpinnerTone>, default: 'primary' },
  },
  setup(props, { attrs }) {
    return () => {
      const { attrClass, rest } = splitAttrs(attrs);
      const pixelSize = spinnerSvgSize(props.size);
      return h(
        'span',
        {
          ...rest,
          class: [
            spinnerClassName({
              className: normalizeClassValue(attrClass),
              size: props.size,
              tone: props.tone,
            }),
            typeof attrClass === 'string' ? undefined : attrClass,
          ],
          role: 'status',
          'aria-label': props.label,
          'data-size': props.size,
          'data-tone': props.tone,
        },
        [
          h(
            'svg',
            {
              class: 'facetheory-rcp-spinner__glyph',
              width: pixelSize,
              height: pixelSize,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 2,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'aria-hidden': true,
              focusable: false,
            },
            [h('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' })],
          ),
          h('span', { class: 'facetheory-rcp-visually-hidden' }, props.label),
        ],
      );
    };
  },
});

export const Skeleton = defineComponent({
  name: 'FaceTheoryResponsiveSkeleton',
  inheritAttrs: false,
  props: {
    animation: {
      type: String as PropType<SkeletonAnimation>,
      default: 'pulse',
    },
    decorative: { type: Boolean, default: true },
    height: { type: String as PropType<SkeletonHeightPreset>, required: false },
    loading: { type: Boolean, default: true },
    variant: { type: String as PropType<SkeletonVariant>, default: 'text' },
    width: { type: String as PropType<SkeletonWidthPreset>, required: false },
  },
  setup(props, { attrs, slots }) {
    return () => {
      if (!props.loading) {
        return h(Fragment, null, slots.default?.() ?? []);
      }

      const { attrClass, rest } = splitAttrs(attrs);
      const a11yProps = props.decorative
        ? { 'aria-hidden': true }
        : {
            role: typeof rest.role === 'string' ? rest.role : 'status',
            'aria-label':
              typeof rest['aria-label'] === 'string'
                ? rest['aria-label']
                : 'Loading',
          };

      return h('div', {
        ...rest,
        ...a11yProps,
        class: [
          skeletonClassName({
            animation: props.animation,
            className: normalizeClassValue(attrClass),
            decorative: props.decorative,
            height: props.height,
            loading: props.loading,
            variant: props.variant,
            width: props.width,
          }),
          typeof attrClass === 'string' ? undefined : attrClass,
        ],
        'data-animation': props.animation,
        'data-loading': 'true',
      });
    };
  },
});

export const LoadingState = defineComponent({
  name: 'FaceTheoryResponsiveLoadingState',
  inheritAttrs: false,
  props: {
    fullscreen: { type: Boolean, default: false },
    label: { type: String, default: 'Loading' },
    message: { type: null as unknown as PropType<VNodeChild>, required: false },
    size: { type: String as PropType<LoadingStateSize>, default: 'md' },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const { attrClass, rest } = splitAttrs(attrs);
      const spinnerSlot = slots.spinner?.();
      const defaultSlot = slots.default?.();
      const message = slots.message?.() ?? slotContent(props.message);

      return h(
        'div',
        {
          ...rest,
          class: [
            loadingStateClassName({
              className: normalizeClassValue(attrClass),
              fullscreen: props.fullscreen,
              label: props.label,
              size: props.size,
            }),
            typeof attrClass === 'string' ? undefined : attrClass,
          ],
          role: 'status',
          'aria-live': 'polite',
          'aria-busy': true,
          'data-fullscreen': props.fullscreen ? 'true' : undefined,
        },
        [
          h('div', { class: 'facetheory-rcp-loading-state__content' }, [
            ...(defaultSlot ??
              spinnerSlot ?? [
                h(Spinner, { label: props.label, size: props.size }),
              ]),
            message.length > 0
              ? h(
                  'p',
                  { class: 'facetheory-rcp-loading-state__message' },
                  message,
                )
              : null,
          ]),
        ],
      );
    };
  },
});

export const AsyncStateBoundary = defineComponent({
  name: 'FaceTheoryResponsiveAsyncStateBoundary',
  inheritAttrs: false,
  props: {
    errorValue: { type: null as unknown as PropType<unknown>, required: false },
    loadingMessage: { type: String, required: false },
    state: {
      type: String as PropType<AsyncViewStateStatus>,
      required: true,
    },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const { attrClass, rest } = splitAttrs(attrs);
      const descriptor = normalizeAsyncViewState({
        error: props.errorValue,
        loadingMessage: props.loadingMessage,
        status: props.state,
      });

      let content: VNodeChild[];
      if (descriptor.status === 'loading') {
        content = slots.loading?.() ?? [
          h(LoadingState, { message: descriptor.loadingMessage ?? 'Loading…' }),
        ];
      } else if (descriptor.status === 'idle') {
        content = slots.idle?.() ?? [];
      } else if (descriptor.status === 'empty') {
        content = slots.empty?.() ?? [];
      } else if (descriptor.status === 'error') {
        content = slots.error?.({ error: descriptor.error }) ?? [
          'Something went wrong.',
        ];
      } else {
        content = slots.default?.() ?? [];
      }

      return h(
        'section',
        {
          ...rest,
          class: ['facetheory-rcp-async-boundary', attrClass],
          'data-state': descriptor.status,
          'aria-busy': descriptor.ariaBusy,
          'aria-live': descriptor.status === 'loading' ? 'polite' : undefined,
          role: descriptor.status === 'error' ? 'alert' : rest.role,
        },
        content,
      );
    };
  },
});

export const Button = defineComponent({
  name: 'FaceTheoryResponsiveButton',
  inheritAttrs: false,
  props: {
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    loadingAnnouncement: { type: String, default: 'Loading' },
    loadingPlacement: {
      type: String as PropType<LoadingPlacement>,
      default: 'replace-prefix',
    },
    size: { type: String as PropType<ButtonSize>, default: 'md' },
    type: {
      type: String as PropType<'button' | 'submit' | 'reset'>,
      default: 'button',
    },
    variant: { type: String as PropType<ButtonVariant>, default: 'primary' },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const { attrClass, onClick, rest } = splitAttrs(attrs);
      const blocked = props.disabled || props.loading;
      const spinner = slots.spinner?.() ?? [
        h(Spinner, {
          label: 'Loading',
          size: props.size === 'lg' ? 'sm' : 'xs',
          tone: 'current',
        }),
      ];

      const handleClick = (event: MouseEvent): void => {
        if (blocked) {
          suppressButtonActivation(event);
          return;
        }
        callVueHandler(onClick, event);
      };

      return h(
        'button',
        {
          ...rest,
          type: props.type,
          class: [
            buttonClassName({
              className: normalizeClassValue(attrClass),
              disabled: props.disabled,
              loading: props.loading,
              loadingPlacement: props.loadingPlacement,
              size: props.size,
              variant: props.variant,
            }),
            typeof attrClass === 'string' ? undefined : attrClass,
          ],
          disabled: blocked,
          'aria-disabled': blocked,
          'aria-busy': props.loading ? true : undefined,
          'data-loading': props.loading ? 'true' : undefined,
          onClick: handleClick,
        },
        [
          props.loading && props.loadingPlacement === 'prepend'
            ? h(
                'span',
                {
                  class:
                    'facetheory-rcp-button__spinner facetheory-rcp-button__spinner--prepend',
                  'aria-hidden': true,
                },
                spinner,
              )
            : null,
          props.loading && props.loadingPlacement === 'replace-prefix'
            ? h(
                'span',
                {
                  class:
                    'facetheory-rcp-button__spinner facetheory-rcp-button__spinner--prefix',
                  'aria-hidden': true,
                },
                spinner,
              )
            : slots.prefix
              ? h(
                  'span',
                  { class: 'facetheory-rcp-button__prefix' },
                  slots.prefix(),
                )
              : null,
          h(
            'span',
            { class: 'facetheory-rcp-button__content' },
            slots.default?.(),
          ),
          props.loading && props.loadingPlacement === 'append'
            ? h(
                'span',
                {
                  class:
                    'facetheory-rcp-button__spinner facetheory-rcp-button__spinner--append',
                  'aria-hidden': true,
                },
                spinner,
              )
            : slots.suffix
              ? h(
                  'span',
                  { class: 'facetheory-rcp-button__suffix' },
                  slots.suffix(),
                )
              : null,
          props.loading
            ? h(
                'span',
                {
                  class: 'facetheory-rcp-visually-hidden',
                  role: 'status',
                  'aria-live': 'polite',
                },
                props.loadingAnnouncement,
              )
            : null,
        ],
      );
    };
  },
});

export const Link = defineComponent({
  name: 'FaceTheoryResponsiveLink',
  inheritAttrs: false,
  props: {
    href: { type: String, required: true },
    onnavigate: {
      type: Function as PropType<ResponsiveLinkNavigateHandler>,
      required: false,
    },
    rel: { type: String, required: false },
    sameOriginBaseHref: {
      type: [String, URL] as PropType<string | URL>,
      required: false,
    },
    shouldHandleUrl: {
      type: Function as PropType<
        (url: URL, anchor: HTMLAnchorElement | null) => boolean
      >,
      required: false,
    },
    target: { type: String, required: false },
    window: { type: Object as PropType<Window>, required: false },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const { attrClass, onClick, rest } = splitAttrs(attrs);
      const safeRel = forcedSafeLinkRel({
        href: props.href,
        rel: props.rel,
        sameOriginBaseHref: props.sameOriginBaseHref,
        target: props.target,
      });

      const handleClick = (event: MouseEvent): void => {
        callVueHandler(onClick, event);
        if (event.defaultPrevented) return;
        if (props.onnavigate === undefined) return;

        const classifierOptions = responsiveLinkClassifierOptions(
          props.shouldHandleUrl,
          props.window,
        );
        const intent = classifyResponsiveLinkClick(event, classifierOptions);
        if (!intent) return;

        handleResponsiveLinkClick(event, {
          ...classifierOptions,
          onNavigate: props.onnavigate,
        });
      };

      return h(
        'a',
        {
          ...rest,
          class: ['facetheory-rcp-link', attrClass],
          href: props.href,
          onClick: handleClick,
          rel: safeRel,
          target: props.target,
        },
        slots.default?.(),
      );
    };
  },
});

export type { AsyncViewStateStatus, LoadingPlacement };

function responsiveLinkClassifierOptions(
  shouldHandleUrl:
    | ((url: URL, anchor: HTMLAnchorElement | null) => boolean)
    | undefined,
  windowValue: Window | undefined,
): {
  shouldHandleUrl?: (url: URL, anchor: HTMLAnchorElement | null) => boolean;
  window?: Window;
} {
  const options: {
    shouldHandleUrl?: (url: URL, anchor: HTMLAnchorElement | null) => boolean;
    window?: Window;
  } = {};
  if (shouldHandleUrl !== undefined) options.shouldHandleUrl = shouldHandleUrl;
  if (windowValue !== undefined) options.window = windowValue;
  return options;
}
