/**
 * Shared hosted-auth Stitch contract consumed by the React, Vue, and Svelte
 * adapters. Framework-specific node, slot, and event payload types stay in
 * the adapters; deterministic variant, class, and token decisions live here
 * so the hosted-auth surface cannot drift across adapters.
 */

export type AuthPageBackground = 'surface' | 'gradient';

export type AuthPasskeyButtonType = 'button' | 'submit';

export type AuthStateVariant = 'info' | 'success' | 'warning' | 'error';

export interface AuthPageLayoutProps<TNode = unknown> {
  /** Brand mark rendered in the top-left (e.g. logo). */
  brand?: TNode;
  /** Background treatment. `gradient` applies the Stitch signature indigo gradient. */
  background?: AuthPageBackground;
  /** Right-rail slot for legal / locale / help links rendered at the bottom. */
  footer?: TNode;
  children?: TNode;
}

export interface AuthCardProps<TNode = unknown> {
  title: TNode;
  description?: TNode;
  /** Right-aligned secondary action slot inside the header (e.g. "Sign up"). */
  headerAction?: TNode;
  /** Footer slot rendered below the body (e.g. "Trouble signing in?"). */
  footer?: TNode;
  children?: TNode;
}

export interface AuthFlowStep<TDescription = unknown> {
  key: string;
  label: string;
  /** Optional long-form description shown when this step is active. */
  description?: TDescription;
}

export interface AuthFlowStepperProps<
  TStep extends AuthFlowStep = AuthFlowStep,
> {
  steps: TStep[];
  /** Zero-based index of the currently active step. */
  currentIndex: number;
}

export interface AuthFlowSectionProps<TNode = unknown> {
  /** Optional step heading (e.g. "Step 2 of 3"). */
  eyebrow?: TNode;
  title?: TNode;
  description?: TNode;
  children?: TNode;
}

export interface PasskeyCTAProps<TNode = unknown, TClick = unknown> {
  children?: TNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: TClick;
  /** Leading icon (e.g. a passkey glyph). */
  icon?: TNode;
  /** HTML button type. Default `button` so it does not submit forms. */
  type?: AuthPasskeyButtonType;
}

export interface OTPInputProps {
  /** Number of characters to accept. Default 6. */
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  /** Fires when the last digit is entered (useful for auto-submit flows). */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  /** Visually marks the input invalid. Pairs with a caller-supplied error message. */
  invalid?: boolean;
  /** Autofocus the first character box on mount. Default `true`. */
  autoFocus?: boolean;
}

export interface ConsentItemProps<TNode = unknown> {
  /** Short label (e.g. "Read your profile"). */
  label: TNode;
  /** Long-form description shown under the label. */
  description?: TNode;
  /** Leading icon glyph. */
  icon?: TNode;
  /** Mark as already granted (greys out the entry). */
  granted?: boolean;
}

export interface ConsentListProps<TNode = unknown> {
  children?: TNode;
}

export interface AuthStateCardProps<TNode = unknown> {
  variant?: AuthStateVariant;
  title: TNode;
  description?: TNode;
  /** Leading icon glyph. */
  icon?: TNode;
  /** Actions rendered below the description (e.g. "Try again", "Contact support"). */
  actions?: TNode;
}

export interface AuthStateVariantPalette {
  accent: string;
  surface: string;
  text: string;
}

export interface AuthFlowStepState {
  isCurrent: boolean;
  isCompleted: boolean;
  dotColor: string;
  labelColor: string;
  labelFontWeight: 400 | 600;
  ariaCurrent: 'step' | undefined;
}

export const AUTH_SIGNATURE_GRADIENT_BACKGROUND =
  'linear-gradient(135deg, var(--stitch-color-primary, #1f108e) 0%, var(--stitch-color-primary-container, #3730a3) 100%)';

export const AUTH_PAGE_SURFACE_BACKGROUND =
  'var(--stitch-color-surface, #faf8ff)';

export const AUTH_PRIMARY_COLOR = 'var(--stitch-color-primary, #1f108e)';

export const AUTH_INACTIVE_STEP_COLOR =
  'var(--stitch-color-surface-container-high, #e2e7ff)';

export const AUTH_ON_SURFACE_COLOR =
  'var(--stitch-color-on-surface, #131b2e)';

export const AUTH_ON_SURFACE_VARIANT_COLOR =
  'var(--stitch-color-on-surface-variant, #464553)';

export const AUTH_SURFACE_CONTAINER_LOW_BACKGROUND =
  'var(--stitch-color-surface-container-low, #f2f3ff)';

export const AUTH_SURFACE_CONTAINER_LOWEST_BACKGROUND =
  'var(--stitch-color-surface-container-lowest, #ffffff)';

export const AUTH_STATE_VARIANT_PALETTE = {
  info: {
    accent: AUTH_PRIMARY_COLOR,
    surface: AUTH_SURFACE_CONTAINER_LOWEST_BACKGROUND,
    text: AUTH_ON_SURFACE_COLOR,
  },
  success: {
    accent: 'var(--stitch-color-tertiary, #00332e)',
    surface: AUTH_SURFACE_CONTAINER_LOWEST_BACKGROUND,
    text: AUTH_ON_SURFACE_COLOR,
  },
  warning: {
    accent: 'var(--stitch-color-error, #ba1a1a)',
    surface: AUTH_SURFACE_CONTAINER_LOWEST_BACKGROUND,
    text: AUTH_ON_SURFACE_COLOR,
  },
  error: {
    accent: 'var(--stitch-color-error, #ba1a1a)',
    surface: 'var(--stitch-color-error-container, #ffdad6)',
    text: 'var(--stitch-color-on-error-container, #93000a)',
  },
} as const satisfies Record<AuthStateVariant, AuthStateVariantPalette>;

export function resolveAuthPageBackground(
  background: AuthPageBackground = 'surface',
): string {
  return background === 'gradient'
    ? AUTH_SIGNATURE_GRADIENT_BACKGROUND
    : AUTH_PAGE_SURFACE_BACKGROUND;
}

export function resolveAuthFlowStepState(
  index: number,
  currentIndex: number,
): AuthFlowStepState {
  const isCurrent = index === currentIndex;
  const isCompleted = index < currentIndex;

  return {
    isCurrent,
    isCompleted,
    dotColor:
      isCompleted || isCurrent ? AUTH_PRIMARY_COLOR : AUTH_INACTIVE_STEP_COLOR,
    labelColor: isCurrent
      ? AUTH_ON_SURFACE_COLOR
      : AUTH_ON_SURFACE_VARIANT_COLOR,
    labelFontWeight: isCurrent ? 600 : 400,
    ariaCurrent: isCurrent ? 'step' : undefined,
  };
}

export function authConsentItemBackground(
  granted: boolean | undefined,
): string {
  return granted
    ? AUTH_SURFACE_CONTAINER_LOW_BACKGROUND
    : AUTH_SURFACE_CONTAINER_LOWEST_BACKGROUND;
}

export function authConsentItemOpacity(granted: boolean | undefined): number {
  return granted ? 0.7 : 1;
}

export function authStateVariantPalette(
  variant: AuthStateVariant,
): AuthStateVariantPalette {
  return AUTH_STATE_VARIANT_PALETTE[variant];
}

export function authStateRole(
  variant: AuthStateVariant,
): 'alert' | undefined {
  return variant === 'error' || variant === 'warning' ? 'alert' : undefined;
}

export function authStateClassName(variant: AuthStateVariant): string {
  return `facetheory-stitch-auth-state facetheory-stitch-auth-state-${variant}`;
}

export function authOtpInputClassName(invalid: boolean | undefined): string {
  return invalid
    ? 'facetheory-stitch-otp-input facetheory-stitch-otp-input-invalid'
    : 'facetheory-stitch-otp-input';
}

export function splitAuthOtpValue(value: string, length: number): string[] {
  const chars = value.slice(0, length).split('');
  while (chars.length < length) chars.push('');
  return chars;
}

export function updateAuthOtpValueAtIndex(
  value: string,
  length: number,
  index: number,
  nextChar: string,
): string {
  const chars = splitAuthOtpValue(value, length);
  chars[index] = nextChar.slice(-1);
  return chars.join('').slice(0, length).trimEnd();
}
