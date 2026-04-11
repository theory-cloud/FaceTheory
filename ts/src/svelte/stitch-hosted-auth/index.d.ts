import type { Component } from 'svelte';

export interface AuthPageLayoutProps {
  background?: 'surface' | 'gradient';
}

export interface AuthCardProps {
  title: unknown;
  description?: unknown;
}

export interface AuthFlowStep {
  key: string;
  label: string;
  description?: unknown;
}

export interface AuthFlowStepperProps {
  steps: AuthFlowStep[];
  currentIndex: number;
}

export interface AuthFlowSectionProps {
  eyebrow?: unknown;
  title?: unknown;
  description?: unknown;
}

export interface PasskeyCTAProps {
  loading?: boolean;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  type?: 'button' | 'submit';
}

export interface OTPInputProps {
  length?: number;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}

export interface ConsentItemProps {
  label: unknown;
  description?: unknown;
  granted?: boolean;
}

export interface ConsentListProps {}

export type AuthStateVariant = 'info' | 'success' | 'warning' | 'error';

export interface AuthStateCardProps {
  variant?: AuthStateVariant;
  title: unknown;
  description?: unknown;
}

export declare const AuthPageLayout: Component<AuthPageLayoutProps>;
export declare const AuthCard: Component<AuthCardProps>;
export declare const AuthFlowStepper: Component<AuthFlowStepperProps>;
export declare const AuthFlowSection: Component<AuthFlowSectionProps>;
export declare const PasskeyCTA: Component<PasskeyCTAProps>;
export declare const OTPInput: Component<OTPInputProps>;
export declare const ConsentItem: Component<ConsentItemProps>;
export declare const ConsentList: Component<ConsentListProps>;
export declare const AuthStateCard: Component<AuthStateCardProps>;
