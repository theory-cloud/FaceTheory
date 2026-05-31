import * as React from 'react';

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

const h = React.createElement;

export interface SpinnerProps extends Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  'role'
> {
  label?: string;
  size?: SpinnerSize;
  tone?: SpinnerTone;
}

export interface SkeletonProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children'
> {
  animation?: SkeletonAnimation;
  decorative?: boolean;
  height?: SkeletonHeightPreset;
  loading?: boolean;
  variant?: SkeletonVariant;
  width?: SkeletonWidthPreset;
  children?: React.ReactNode;
}

export interface LoadingStateProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'role'
> {
  fullscreen?: boolean;
  label?: string;
  message?: React.ReactNode;
  size?: LoadingStateSize;
  spinner?: React.ReactNode;
}

export interface AsyncStateBoundaryProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  'children'
> {
  empty?: React.ReactNode;
  error?: React.ReactNode | ((error: unknown) => React.ReactNode);
  errorValue?: unknown;
  idle?: React.ReactNode;
  loading?: React.ReactNode;
  loadingMessage?: string;
  state: AsyncViewStateStatus;
  children?: React.ReactNode | (() => React.ReactNode);
}

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'disabled' | 'prefix'
> {
  disabled?: boolean;
  loading?: boolean;
  loadingAnnouncement?: React.ReactNode;
  loadingPlacement?: LoadingPlacement;
  prefix?: React.ReactNode;
  size?: ButtonSize;
  spinner?: React.ReactNode;
  suffix?: React.ReactNode;
  variant?: ButtonVariant;
}

export interface LinkProps extends Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'onNavigate'
> {
  onNavigate?: ResponsiveLinkNavigateHandler;
  sameOriginBaseHref?: string | URL;
  shouldHandleUrl?: (url: URL, anchor: HTMLAnchorElement | null) => boolean;
  window?: Window;
}

export function Spinner(props: SpinnerProps): React.ReactElement {
  const {
    className,
    label = 'Loading',
    size = 'md',
    tone = 'primary',
    ...rest
  } = props;
  const pixelSize = spinnerSvgSize(size);

  return h(
    'span',
    {
      ...rest,
      className: spinnerClassName({ className, size, tone }),
      role: 'status',
      'aria-label': label,
      'data-size': size,
      'data-tone': tone,
    },
    h(
      'svg',
      {
        className: 'facetheory-rcp-spinner__glyph',
        width: pixelSize,
        height: pixelSize,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
      },
      h('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' }),
    ),
    h('span', { className: 'facetheory-rcp-visually-hidden' }, label),
  );
}

export function Skeleton(props: SkeletonProps): React.ReactElement | null {
  const {
    animation = 'pulse',
    children,
    className,
    decorative = true,
    height,
    loading = true,
    variant = 'text',
    width,
    ...rest
  } = props;

  if (!loading) {
    return h(React.Fragment, null, children);
  }

  const a11yProps = decorative
    ? { 'aria-hidden': true }
    : {
        role: rest.role ?? 'status',
        'aria-label': rest['aria-label'] ?? 'Loading',
      };

  return h('div', {
    ...rest,
    ...a11yProps,
    className: skeletonClassName({
      animation,
      className,
      decorative,
      height,
      loading,
      variant,
      width,
    }),
    'data-animation': animation,
    'data-loading': 'true',
  });
}

export function LoadingState(props: LoadingStateProps): React.ReactElement {
  const {
    children,
    className,
    fullscreen = false,
    label = 'Loading',
    message,
    size = 'md',
    spinner,
    ...rest
  } = props;

  return h(
    'div',
    {
      ...rest,
      className: loadingStateClassName({ className, fullscreen, label, size }),
      role: 'status',
      'aria-live': 'polite',
      'aria-busy': true,
      'data-fullscreen': fullscreen ? 'true' : undefined,
    },
    h(
      'div',
      { className: 'facetheory-rcp-loading-state__content' },
      children ?? spinner ?? h(Spinner, { label, size }),
      message !== undefined
        ? h(
            'p',
            { className: 'facetheory-rcp-loading-state__message' },
            message,
          )
        : null,
    ),
  );
}

export function AsyncStateBoundary(
  props: AsyncStateBoundaryProps,
): React.ReactElement {
  const {
    children,
    className,
    empty,
    error,
    errorValue,
    idle,
    loading,
    loadingMessage,
    state,
    ...rest
  } = props;
  const descriptor = normalizeAsyncViewState({
    error: errorValue,
    loadingMessage,
    status: state,
  });

  let content: React.ReactNode;
  if (descriptor.status === 'loading') {
    content =
      loading ??
      h(LoadingState, { message: descriptor.loadingMessage ?? 'Loading…' });
  } else if (descriptor.status === 'idle') {
    content = idle ?? null;
  } else if (descriptor.status === 'empty') {
    content = empty ?? null;
  } else if (descriptor.status === 'error') {
    content =
      typeof error === 'function'
        ? error(descriptor.error)
        : (error ?? 'Something went wrong.');
  } else {
    content = typeof children === 'function' ? children() : children;
  }

  return h(
    'section',
    {
      ...rest,
      className: ['facetheory-rcp-async-boundary', className]
        .filter(Boolean)
        .join(' '),
      'data-state': descriptor.status,
      'aria-busy': descriptor.ariaBusy,
      'aria-live': descriptor.status === 'loading' ? 'polite' : undefined,
      role: descriptor.status === 'error' ? 'alert' : rest.role,
    },
    content,
  );
}

export function Button(props: ButtonProps): React.ReactElement {
  const {
    children,
    className,
    disabled = false,
    loading = false,
    loadingAnnouncement = 'Loading',
    loadingPlacement = 'replace-prefix',
    onClick,
    prefix,
    size = 'md',
    spinner,
    suffix,
    type = 'button',
    variant = 'primary',
    ...rest
  } = props;
  const blocked = disabled || loading;
  const spinnerNode =
    spinner ??
    h(Spinner, {
      label: 'Loading',
      size: size === 'lg' ? 'sm' : 'xs',
      tone: 'current',
    });

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (blocked) {
      suppressButtonActivation(event);
      return;
    }
    onClick?.(event);
  };

  return h(
    'button',
    {
      ...rest,
      type,
      className: buttonClassName({
        className,
        disabled,
        loading,
        loadingPlacement,
        size,
        variant,
      }),
      disabled: blocked,
      'aria-disabled': blocked,
      'aria-busy': loading ? true : undefined,
      'data-loading': loading ? 'true' : undefined,
      onClick: handleClick,
    },
    loading && loadingPlacement === 'prepend'
      ? h(
          'span',
          {
            className:
              'facetheory-rcp-button__spinner facetheory-rcp-button__spinner--prepend',
            'aria-hidden': true,
          },
          spinnerNode,
        )
      : null,
    loading && loadingPlacement === 'replace-prefix'
      ? h(
          'span',
          {
            className:
              'facetheory-rcp-button__spinner facetheory-rcp-button__spinner--prefix',
            'aria-hidden': true,
          },
          spinnerNode,
        )
      : prefix !== undefined
        ? h('span', { className: 'facetheory-rcp-button__prefix' }, prefix)
        : null,
    h('span', { className: 'facetheory-rcp-button__content' }, children),
    loading && loadingPlacement === 'append'
      ? h(
          'span',
          {
            className:
              'facetheory-rcp-button__spinner facetheory-rcp-button__spinner--append',
            'aria-hidden': true,
          },
          spinnerNode,
        )
      : suffix !== undefined
        ? h('span', { className: 'facetheory-rcp-button__suffix' }, suffix)
        : null,
    loading
      ? h(
          'span',
          {
            className: 'facetheory-rcp-visually-hidden',
            role: 'status',
            'aria-live': 'polite',
          },
          loadingAnnouncement,
        )
      : null,
  );
}

export function Link(props: LinkProps): React.ReactElement {
  const {
    children,
    className,
    href,
    onClick,
    onNavigate,
    rel,
    sameOriginBaseHref,
    shouldHandleUrl,
    target,
    window,
    ...rest
  } = props;
  const resolvedHref = href ?? '';
  const safeRel = forcedSafeLinkRel({
    href: resolvedHref,
    rel,
    sameOriginBaseHref,
    target,
  });

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (onNavigate === undefined) return;

    const nativeEvent = event.nativeEvent;
    const classifierOptions = responsiveLinkClassifierOptions(
      shouldHandleUrl,
      window,
    );
    const intent = classifyResponsiveLinkClick(nativeEvent, classifierOptions);
    if (!intent) return;

    handleResponsiveLinkClick(nativeEvent, {
      ...classifierOptions,
      onNavigate,
    });
  };

  return h(
    'a',
    {
      ...rest,
      className: ['facetheory-rcp-link', className].filter(Boolean).join(' '),
      href: resolvedHref,
      onClick: handleClick,
      rel: safeRel,
      target,
    },
    children,
  );
}

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
