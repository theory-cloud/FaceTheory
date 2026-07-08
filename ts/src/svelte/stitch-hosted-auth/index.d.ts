import type { Component } from 'svelte';
import type {
  AuthCardProps as SharedAuthCardProps,
  AuthFlowSectionProps as SharedAuthFlowSectionProps,
  AuthFlowStepperProps as SharedAuthFlowStepperProps,
  AuthPageLayoutProps as SharedAuthPageLayoutProps,
  AuthStateCardProps as SharedAuthStateCardProps,
  ConsentItemProps as SharedConsentItemProps,
  PasskeyCTAProps as SharedPasskeyCTAProps,
} from '../../stitch-hosted-auth/index.js';

export type {
  AuthFlowStep,
  AuthPageBackground,
  AuthPasskeyButtonType,
  AuthStateVariant,
  ConsentListProps,
  OTPInputProps,
} from '../../stitch-hosted-auth/index.js';

export type AuthPageLayoutProps = Pick<
  SharedAuthPageLayoutProps,
  'background'
>;

export type AuthCardProps = Pick<
  SharedAuthCardProps,
  'title' | 'description'
>;

export type AuthFlowStepperProps = SharedAuthFlowStepperProps;

export type AuthFlowSectionProps = Pick<
  SharedAuthFlowSectionProps,
  'eyebrow' | 'title' | 'description'
>;

export type PasskeyCTAProps = Pick<
  SharedPasskeyCTAProps<unknown, (event: MouseEvent) => void>,
  'loading' | 'disabled' | 'onClick' | 'type'
>;

export type ConsentItemProps = Pick<
  SharedConsentItemProps,
  'label' | 'description' | 'granted'
>;

export type AuthStateCardProps = Pick<
  SharedAuthStateCardProps,
  'variant' | 'title' | 'description'
>;

export declare const AuthPageLayout: Component<AuthPageLayoutProps>;
export declare const AuthCard: Component<AuthCardProps>;
export declare const AuthFlowStepper: Component<AuthFlowStepperProps>;
export declare const AuthFlowSection: Component<AuthFlowSectionProps>;
export declare const PasskeyCTA: Component<PasskeyCTAProps>;
export declare const OTPInput: Component<
  import('../../stitch-hosted-auth/index.js').OTPInputProps
>;
export declare const ConsentItem: Component<ConsentItemProps>;
export declare const ConsentList: Component<
  import('../../stitch-hosted-auth/index.js').ConsentListProps
>;
export declare const AuthStateCard: Component<AuthStateCardProps>;
