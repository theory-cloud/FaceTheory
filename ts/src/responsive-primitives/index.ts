import {
  classifyFaceNavigationAnchorClick,
  FACE_NAVIGATION_CLASSIFIER_SOURCE,
} from '../spa.js';
import type { ClassifyFaceNavigationAnchorClickOptions } from '../spa.js';

export const RESPONSIVE_PRIMITIVES_SURFACE_ID =
  'theorycloud_responsive_control_plane.primitives';
export const RESPONSIVE_PRIMITIVES_CONTRACT =
  'theorycloud_responsive_control_plane.v0.1';
export const RESPONSIVE_PRIMITIVES_CLASS_PREFIX = 'facetheory-rcp';
export const RESPONSIVE_LINK_CLASSIFIER_SOURCE =
  FACE_NAVIGATION_CLASSIFIER_SOURCE;

export type ResponsivePrimitiveFramework =
  | 'neutral'
  | 'react'
  | 'vue'
  | 'svelte';

export type ResponsivePrimitiveName =
  | 'Spinner'
  | 'Skeleton'
  | 'LoadingState'
  | 'AsyncStateBoundary'
  | 'Button'
  | 'Link';

export interface ResponsivePrimitiveA11yContract {
  readonly role?: string;
  readonly liveRegion?: 'off' | 'polite' | 'assertive';
  readonly ariaBusy?: boolean;
  readonly reducedMotion: boolean;
  readonly decorativeDefault?: boolean;
  readonly notes: readonly string[];
}

export interface ResponsivePrimitiveContract {
  readonly primitive: ResponsivePrimitiveName;
  readonly frameworks: Readonly<Record<ResponsivePrimitiveFramework, true>>;
  readonly a11y: ResponsivePrimitiveA11yContract;
}

const ALL_FRAMEWORKS: Readonly<Record<ResponsivePrimitiveFramework, true>> = {
  neutral: true,
  react: true,
  vue: true,
  svelte: true,
};

export const RESPONSIVE_PRIMITIVE_CONTRACTS: readonly ResponsivePrimitiveContract[] =
  [
    {
      primitive: 'Spinner',
      frameworks: ALL_FRAMEWORKS,
      a11y: {
        role: 'status',
        reducedMotion: true,
        notes: [
          'The visible glyph is aria-hidden; the host element exposes the status label.',
          'CSS disables spin animation under prefers-reduced-motion: reduce.',
        ],
      },
    },
    {
      primitive: 'Skeleton',
      frameworks: ALL_FRAMEWORKS,
      a11y: {
        reducedMotion: true,
        decorativeDefault: true,
        notes: [
          'The loading placeholder is aria-hidden by default because it is decorative.',
          'Preset width and height classes are used instead of inline styles.',
          'Children are only rendered when loading is false.',
        ],
      },
    },
    {
      primitive: 'LoadingState',
      frameworks: ALL_FRAMEWORKS,
      a11y: {
        role: 'status',
        liveRegion: 'polite',
        ariaBusy: true,
        reducedMotion: true,
        notes: [
          'The wrapper announces a polite busy status and can render a fullscreen overlay.',
          'The embedded spinner inherits the Spinner reduced-motion contract.',
        ],
      },
    },
    {
      primitive: 'AsyncStateBoundary',
      frameworks: ALL_FRAMEWORKS,
      a11y: {
        liveRegion: 'polite',
        ariaBusy: true,
        reducedMotion: true,
        notes: [
          'The loading branch composes LoadingState; empty, error, idle, and success branches remain caller-supplied.',
        ],
      },
    },
    {
      primitive: 'Button',
      frameworks: ALL_FRAMEWORKS,
      a11y: {
        liveRegion: 'polite',
        ariaBusy: true,
        reducedMotion: true,
        notes: [
          'Loading buttons set aria-busy and disabled/aria-disabled.',
          'Activation is suppressed in the click handler while disabled or loading.',
          'A visually-hidden role=status announcement is emitted while loading.',
        ],
      },
    },
    {
      primitive: 'Link',
      frameworks: ALL_FRAMEWORKS,
      a11y: {
        reducedMotion: false,
        notes: [
          'The component always renders a real anchor with href.',
          'Only accepted same-origin plain left clicks are intercepted through the shared spa.ts classifier.',
          'External and target=_blank links force noopener noreferrer rel tokens.',
        ],
      },
    },
  ] as const;

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type SpinnerTone = 'primary' | 'current' | 'inverse' | 'neutral';

export interface SpinnerPrimitiveOptions {
  className?: string | undefined;
  label?: string | undefined;
  size?: SpinnerSize | undefined;
  tone?: SpinnerTone | undefined;
}

export type SkeletonVariant = 'text' | 'circle' | 'rectangle' | 'rounded';
export type SkeletonAnimation = 'pulse' | 'wave' | 'none';
export type SkeletonWidthPreset =
  | 'auto'
  | 'content'
  | 'full'
  | 'three-quarters'
  | 'two-thirds'
  | 'half'
  | 'third'
  | 'quarter';
export type SkeletonHeightPreset = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface SkeletonPrimitiveOptions {
  animation?: SkeletonAnimation | undefined;
  className?: string | undefined;
  decorative?: boolean | undefined;
  height?: SkeletonHeightPreset | undefined;
  loading?: boolean | undefined;
  variant?: SkeletonVariant | undefined;
  width?: SkeletonWidthPreset | undefined;
}

export type LoadingStateSize = SpinnerSize;

export interface LoadingStatePrimitiveOptions {
  className?: string | undefined;
  fullscreen?: boolean | undefined;
  label?: string | undefined;
  message?: string | undefined;
  size?: LoadingStateSize | undefined;
}

export type AsyncViewStateStatus =
  | 'idle'
  | 'loading'
  | 'empty'
  | 'error'
  | 'success';

export interface AsyncViewStateInput {
  status: AsyncViewStateStatus;
  error?: unknown;
  loadingMessage?: string | undefined;
}

export interface AsyncViewStateDescriptor {
  ariaBusy: boolean;
  error?: unknown;
  loadingMessage?: string;
  status: AsyncViewStateStatus;
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type LoadingPlacement = 'replace-prefix' | 'prepend' | 'append';

export interface ButtonPrimitiveOptions {
  className?: string | undefined;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  loadingPlacement?: LoadingPlacement | undefined;
  size?: ButtonSize | undefined;
  variant?: ButtonVariant | undefined;
}

export interface LinkRelOptions {
  href: string;
  rel?: string | undefined;
  sameOriginBaseHref?: string | URL | undefined;
  target?: string | undefined;
}

export interface ResponsiveLinkNavigationIntent {
  anchor: HTMLAnchorElement;
  classifierSource: typeof FACE_NAVIGATION_CLASSIFIER_SOURCE;
  event: MouseEvent;
  url: URL;
}

export type ResponsiveLinkNavigateResult = boolean | void;
export type ResponsiveLinkNavigateHandler = (
  intent: ResponsiveLinkNavigationIntent,
) => ResponsiveLinkNavigateResult;

export interface ResponsiveLinkClickOptions extends ClassifyFaceNavigationAnchorClickOptions {
  onNavigate?: ResponsiveLinkNavigateHandler | undefined;
}

export const RESPONSIVE_PRIMITIVES_CSS = `
.facetheory-rcp-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.facetheory-rcp-spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--facetheory-rcp-spinner-color, currentColor);
}

.facetheory-rcp-spinner__glyph {
  display: block;
  animation: facetheory-rcp-spin 700ms linear infinite;
}

.facetheory-rcp-spinner--xs { inline-size: 0.75rem; block-size: 0.75rem; }
.facetheory-rcp-spinner--sm { inline-size: 1rem; block-size: 1rem; }
.facetheory-rcp-spinner--md { inline-size: 1.5rem; block-size: 1.5rem; }
.facetheory-rcp-spinner--lg { inline-size: 2rem; block-size: 2rem; }
.facetheory-rcp-spinner--xl { inline-size: 3rem; block-size: 3rem; }
.facetheory-rcp-spinner--primary { --facetheory-rcp-spinner-color: var(--stitch-color-primary, #2f55d4); }
.facetheory-rcp-spinner--current { --facetheory-rcp-spinner-color: currentColor; }
.facetheory-rcp-spinner--inverse { --facetheory-rcp-spinner-color: var(--stitch-color-on-primary, #ffffff); }
.facetheory-rcp-spinner--neutral { --facetheory-rcp-spinner-color: var(--stitch-color-on-surface-variant, #464553); }

@keyframes facetheory-rcp-spin {
  to { transform: rotate(360deg); }
}

.facetheory-rcp-skeleton {
  display: block;
  overflow: hidden;
  position: relative;
  background: var(--facetheory-rcp-skeleton-surface, var(--stitch-color-surface-container-high, #e2e7ff));
  color: transparent;
}

.facetheory-rcp-skeleton--text { border-radius: 999px; block-size: 1em; }
.facetheory-rcp-skeleton--circle { border-radius: 999px; aspect-ratio: 1 / 1; }
.facetheory-rcp-skeleton--rectangle { border-radius: var(--stitch-radius-sm, 6px); }
.facetheory-rcp-skeleton--rounded { border-radius: var(--stitch-radius-lg, 12px); }
.facetheory-rcp-skeleton--width-auto { inline-size: auto; }
.facetheory-rcp-skeleton--width-content { inline-size: 12ch; }
.facetheory-rcp-skeleton--width-full { inline-size: 100%; }
.facetheory-rcp-skeleton--width-three-quarters { inline-size: 75%; }
.facetheory-rcp-skeleton--width-two-thirds { inline-size: 66.666%; }
.facetheory-rcp-skeleton--width-half { inline-size: 50%; }
.facetheory-rcp-skeleton--width-third { inline-size: 33.333%; }
.facetheory-rcp-skeleton--width-quarter { inline-size: 25%; }
.facetheory-rcp-skeleton--height-xs { block-size: 0.5rem; }
.facetheory-rcp-skeleton--height-sm { block-size: 0.75rem; }
.facetheory-rcp-skeleton--height-md { block-size: 1rem; }
.facetheory-rcp-skeleton--height-lg { block-size: 1.5rem; }
.facetheory-rcp-skeleton--height-xl { block-size: 2rem; }
.facetheory-rcp-skeleton--height-2xl { block-size: 3rem; }
.facetheory-rcp-skeleton--pulse { animation: facetheory-rcp-skeleton-pulse 1.2s ease-in-out infinite; }
.facetheory-rcp-skeleton--wave::after {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline: -150% 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.42), transparent);
  animation: facetheory-rcp-skeleton-wave 1.4s linear infinite;
}

@keyframes facetheory-rcp-skeleton-pulse {
  50% { opacity: 0.56; }
}

@keyframes facetheory-rcp-skeleton-wave {
  to { transform: translateX(150%); }
}

.facetheory-rcp-loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--stitch-space-md, 1rem);
}

.facetheory-rcp-loading-state--fullscreen {
  position: fixed;
  inset: 0;
  z-index: var(--facetheory-rcp-overlay-z-index, 1000);
  background: var(--facetheory-rcp-overlay-background, rgba(0, 0, 0, 0.45));
  backdrop-filter: blur(2px);
}

.facetheory-rcp-loading-state__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--stitch-space-sm, 0.75rem);
}

.facetheory-rcp-loading-state--fullscreen .facetheory-rcp-loading-state__content {
  padding: var(--stitch-space-lg, 1.5rem);
  border-radius: var(--stitch-radius-lg, 12px);
  background: var(--stitch-color-surface, #ffffff);
  color: var(--stitch-color-on-surface, #131b2e);
}

.facetheory-rcp-loading-state__message {
  margin: 0;
  color: var(--stitch-color-on-surface-variant, #464553);
  font: inherit;
  text-align: center;
}

.facetheory-rcp-async-boundary[data-state='idle'],
.facetheory-rcp-async-boundary[data-state='empty'],
.facetheory-rcp-async-boundary[data-state='error'] {
  display: block;
}

.facetheory-rcp-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 0;
  border-radius: var(--stitch-radius-md, 10px);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.facetheory-rcp-button--sm { min-block-size: 2rem; padding: 0 0.75rem; }
.facetheory-rcp-button--md { min-block-size: 2.5rem; padding: 0 1rem; }
.facetheory-rcp-button--lg { min-block-size: 3rem; padding: 0 1.25rem; }
.facetheory-rcp-button--primary { background: var(--stitch-color-primary, #2f55d4); color: var(--stitch-color-on-primary, #ffffff); }
.facetheory-rcp-button--secondary { background: var(--stitch-color-secondary-container, #ffecc0); color: var(--stitch-color-on-secondary-container, #3f2e00); }
.facetheory-rcp-button--ghost { background: transparent; color: var(--stitch-color-primary, #2f55d4); }
.facetheory-rcp-button--danger { background: var(--stitch-color-error, #ba1a1a); color: var(--stitch-color-on-error, #ffffff); }
.facetheory-rcp-button[disabled],
.facetheory-rcp-button[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.62;
}

.facetheory-rcp-button__content,
.facetheory-rcp-button__prefix,
.facetheory-rcp-button__suffix,
.facetheory-rcp-button__spinner {
  display: inline-flex;
  align-items: center;
}

.facetheory-rcp-link {
  color: var(--stitch-color-primary, #2f55d4);
}

@media (prefers-reduced-motion: reduce) {
  .facetheory-rcp-spinner__glyph,
  .facetheory-rcp-skeleton--pulse,
  .facetheory-rcp-skeleton--wave::after {
    animation: none;
  }

  .facetheory-rcp-loading-state--fullscreen {
    backdrop-filter: none;
  }
}
`;

export function joinResponsivePrimitiveClassNames(
  ...values: Array<string | false | null | undefined>
): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}

export function spinnerClassName(
  options: SpinnerPrimitiveOptions = {},
): string {
  const size = options.size ?? 'md';
  const tone = options.tone ?? 'primary';
  return joinResponsivePrimitiveClassNames(
    'facetheory-rcp-spinner',
    `facetheory-rcp-spinner--${size}`,
    `facetheory-rcp-spinner--${tone}`,
    options.className,
  );
}

export function spinnerSvgSize(size: SpinnerSize | undefined): number {
  switch (size ?? 'md') {
    case 'xs':
      return 12;
    case 'sm':
      return 16;
    case 'lg':
      return 32;
    case 'xl':
      return 48;
    case 'md':
      return 24;
  }
}

export function skeletonClassName(
  options: SkeletonPrimitiveOptions = {},
): string {
  const variant = options.variant ?? 'text';
  const animation = options.animation ?? 'pulse';
  return joinResponsivePrimitiveClassNames(
    'facetheory-rcp-skeleton',
    `facetheory-rcp-skeleton--${variant}`,
    animation !== 'none' && `facetheory-rcp-skeleton--${animation}`,
    options.width !== undefined &&
      `facetheory-rcp-skeleton--width-${options.width}`,
    options.height !== undefined &&
      `facetheory-rcp-skeleton--height-${options.height}`,
    options.className,
  );
}

export function loadingStateClassName(
  options: LoadingStatePrimitiveOptions = {},
): string {
  return joinResponsivePrimitiveClassNames(
    'facetheory-rcp-loading-state',
    options.fullscreen === true && 'facetheory-rcp-loading-state--fullscreen',
    options.className,
  );
}

export function normalizeAsyncViewState(
  input: AsyncViewStateInput,
): AsyncViewStateDescriptor {
  const descriptor: AsyncViewStateDescriptor = {
    ariaBusy: input.status === 'loading',
    status: input.status,
  };
  if (input.error !== undefined) descriptor.error = input.error;
  if (input.loadingMessage !== undefined) {
    descriptor.loadingMessage = input.loadingMessage;
  }
  return descriptor;
}

export function buttonClassName(options: ButtonPrimitiveOptions = {}): string {
  const size = options.size ?? 'md';
  const variant = options.variant ?? 'primary';
  const loadingPlacement = options.loadingPlacement ?? 'replace-prefix';
  return joinResponsivePrimitiveClassNames(
    'facetheory-rcp-button',
    `facetheory-rcp-button--${variant}`,
    `facetheory-rcp-button--${size}`,
    options.loading === true && 'facetheory-rcp-button--loading',
    options.loading === true &&
      `facetheory-rcp-button--loading-${loadingPlacement}`,
    options.disabled === true && 'facetheory-rcp-button--disabled',
    options.className,
  );
}

export function suppressButtonActivation(
  event: Pick<Event, 'preventDefault' | 'stopPropagation'>,
): void {
  event.preventDefault();
  event.stopPropagation();
}

export function forcedSafeLinkRel(options: LinkRelOptions): string | undefined {
  const tokens = new Set(
    (options.rel ?? '')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );

  if (linkRequiresNoopener(options)) {
    tokens.add('noopener');
    tokens.add('noreferrer');
  }

  if (tokens.size === 0) return undefined;
  return Array.from(tokens).join(' ');
}

export function linkRequiresNoopener(options: LinkRelOptions): boolean {
  if (options.target === '_blank') return true;
  const href = sanitizeResponsiveLinkHref(options.href);
  if (href === undefined) return false;
  return isExternalLinkHref(href, options.sameOriginBaseHref);
}

export function sanitizeResponsiveLinkHref(
  href: string | null | undefined,
): string | undefined {
  const value = String(href ?? '');
  const scheme = unsafeNormalizedHrefScheme(value);
  if (scheme === null) return value;
  if (
    scheme === 'http' ||
    scheme === 'https' ||
    scheme === 'mailto' ||
    scheme === 'tel'
  ) {
    return value;
  }
  return undefined;
}

export function isExternalLinkHref(
  href: string,
  sameOriginBaseHref?: string | URL,
): boolean {
  if (!isHttpUrlLike(href)) return false;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  if (sameOriginBaseHref === undefined) return true;

  try {
    const base = new URL(String(sameOriginBaseHref));
    return url.origin !== base.origin;
  } catch {
    return true;
  }
}

export function classifyResponsiveLinkClick(
  event: MouseEvent,
  options: ClassifyFaceNavigationAnchorClickOptions = {},
): ResponsiveLinkNavigationIntent | null {
  const navigation = classifyFaceNavigationAnchorClick(event, options);
  if (!navigation) return null;
  return {
    anchor: navigation.anchor,
    classifierSource: navigation.classifierSource,
    event,
    url: navigation.url,
  };
}

export function handleResponsiveLinkClick(
  event: MouseEvent,
  options: ResponsiveLinkClickOptions = {},
): ResponsiveLinkNavigationIntent | null {
  const intent = classifyResponsiveLinkClick(event, options);
  if (!intent) return null;

  if (options.onNavigate === undefined) return intent;

  const result = options.onNavigate(intent);
  event.preventDefault();
  if (result === false) {
    event.stopPropagation();
  }
  return intent;
}

function isHttpUrlLike(href: string): boolean {
  return /^https?:\/\//i.test(href.trim());
}

function unsafeNormalizedHrefScheme(href: string): string | null {
  const normalized = href.trimStart().replace(/[\u0000-\u0020\u007f]+/g, '');
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(normalized);
  return match?.[1] ? match[1].toLowerCase() : null;
}
