import type { Component } from 'svelte';
import type {
  AsyncViewStateStatus,
  ButtonSize,
  ButtonVariant,
  LoadingPlacement,
  LoadingStateSize,
  ResponsiveLinkNavigateHandler,
  SkeletonAnimation,
  SkeletonHeightPreset,
  SkeletonVariant,
  SkeletonWidthPreset,
  SpinnerSize,
  SpinnerTone,
} from '../../responsive-primitives/index.js';

export interface SpinnerProps {
  label?: string;
  size?: SpinnerSize;
  tone?: SpinnerTone;
  class?: string;
}

export interface SkeletonProps {
  animation?: SkeletonAnimation;
  decorative?: boolean;
  height?: SkeletonHeightPreset;
  loading?: boolean;
  variant?: SkeletonVariant;
  width?: SkeletonWidthPreset;
  class?: string;
}

export interface LoadingStateProps {
  fullscreen?: boolean;
  label?: string;
  message?: unknown;
  size?: LoadingStateSize;
  class?: string;
}

export interface AsyncStateBoundaryProps {
  errorValue?: unknown;
  loadingMessage?: string;
  state: AsyncViewStateStatus;
  class?: string;
}

export interface ButtonProps {
  disabled?: boolean;
  loading?: boolean;
  loadingAnnouncement?: unknown;
  loadingPlacement?: LoadingPlacement;
  onclick?: (event: MouseEvent) => void;
  size?: ButtonSize;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  class?: string;
}

export interface LinkProps {
  href: string;
  onclick?: (event: MouseEvent) => void;
  onnavigate?: ResponsiveLinkNavigateHandler;
  rel?: string;
  sameOriginBaseHref?: string | URL;
  shouldHandleUrl?: (url: URL, anchor: HTMLAnchorElement | null) => boolean;
  target?: string;
  window?: Window;
  class?: string;
}

export const AsyncStateBoundary: Component<AsyncStateBoundaryProps>;
export const Button: Component<ButtonProps>;
export const Link: Component<LinkProps>;
export const LoadingState: Component<LoadingStateProps>;
export const Skeleton: Component<SkeletonProps>;
export const Spinner: Component<SpinnerProps>;

export type {
  AsyncViewStateStatus,
  ButtonSize,
  ButtonVariant,
  LoadingPlacement,
  LoadingStateSize,
  ResponsiveLinkNavigateHandler,
  ResponsiveLinkNavigationIntent,
  SkeletonAnimation,
  SkeletonHeightPreset,
  SkeletonVariant,
  SkeletonWidthPreset,
  SpinnerSize,
  SpinnerTone,
} from '../../responsive-primitives/index.js';
