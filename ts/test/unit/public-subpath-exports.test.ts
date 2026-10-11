import assert from 'node:assert/strict';
import test from 'node:test';

import type { Component as SvelteComponent, Snippet } from 'svelte';

import type {
  BrandHeaderProps as SvelteBrandHeaderProps,
  PageFrameProps as SveltePageFrameProps,
  ShellProps as SvelteShellProps,
} from '@theory-cloud/facetheory/svelte/stitch-shell';
import type {
  AuthCardProps as SvelteAuthCardProps,
  AuthFlowSectionProps as SvelteAuthFlowSectionProps,
  AuthPageLayoutProps as SvelteAuthPageLayoutProps,
  AuthStateCardProps as SvelteAuthStateCardProps,
  ConsentItemProps as SvelteConsentItemProps,
  PasskeyCTAProps as SvelteHostedAuthPasskeyCTAProps,
} from '@theory-cloud/facetheory/svelte/stitch-hosted-auth';
import type {
  DataTableProps as SvelteDataTableProps,
  PackageSourceInputPanelProps as SveltePackageSourceInputPanelProps,
  WizardReconciliationPlanPanelProps as SvelteWizardReconciliationPlanPanelProps,
} from '@theory-cloud/facetheory/svelte/stitch-admin';
import type {
  AsyncStateBoundaryProps as SvelteAsyncStateBoundaryProps,
  ButtonProps as SvelteResponsiveButtonProps,
  LinkProps as SvelteResponsiveLinkProps,
  LoadingStateProps as SvelteLoadingStateProps,
  SkeletonProps as SvelteSkeletonProps,
  SpinnerProps as SvelteSpinnerProps,
} from '@theory-cloud/facetheory/svelte/responsive-primitives';

import type {
  BrandHeaderProps as VueBrandHeaderProps,
  CalloutProps as VueCalloutProps,
  NavItem as VueNavItem,
} from '@theory-cloud/facetheory/vue/stitch-shell';
import type {
  AuthCardProps as VueAuthCardProps,
  AuthPageLayoutProps as VueAuthPageLayoutProps,
  ConsentItemProps as VueConsentItemProps,
} from '@theory-cloud/facetheory/vue/stitch-hosted-auth';
import type {
  DataTableColumn as VueDataTableColumn,
  PackageSourceInputPanelProps as VuePackageSourceInputPanelProps,
  WizardReconciliationPlanPanelProps as VueWizardReconciliationPlanPanelProps,
} from '@theory-cloud/facetheory/vue/stitch-admin';

type Expect<T extends true> = T;
type ValueExport<Module, Key extends keyof Module> = Module[Key];
type SvelteComponentExport<T> = T extends SvelteComponent<any> ? true : false;

type _SveltePublicStitchSubpathSmoke = [
  Expect<
    SvelteComponentExport<
      ValueExport<
        typeof import('@theory-cloud/facetheory/svelte/stitch-shell'),
        'Shell' | 'PageFrame' | 'BrandHeader'
      >
    >
  >,
  Expect<
    SvelteComponentExport<
      ValueExport<
        typeof import('@theory-cloud/facetheory/svelte/stitch-hosted-auth'),
        'AuthPageLayout' | 'AuthCard' | 'ConsentItem'
      >
    >
  >,
  Expect<
    SvelteComponentExport<
      ValueExport<
        typeof import('@theory-cloud/facetheory/svelte/stitch-admin'),
        | 'DataTable'
        | 'PackageSourceInputPanel'
        | 'WizardReconciliationPlanPanel'
      >
    >
  >,
  SvelteShellProps,
  SveltePageFrameProps,
  SvelteBrandHeaderProps,
  SvelteAuthPageLayoutProps,
  SvelteAuthCardProps,
  SvelteConsentItemProps,
  SvelteDataTableProps,
  SveltePackageSourceInputPanelProps,
  SvelteWizardReconciliationPlanPanelProps,
];

type _SvelteResponsivePrimitivesSubpathSmoke = [
  Expect<
    SvelteComponentExport<
      ValueExport<
        typeof import('@theory-cloud/facetheory/svelte/responsive-primitives'),
        | 'Spinner'
        | 'Skeleton'
        | 'LoadingState'
        | 'AsyncStateBoundary'
        | 'Button'
        | 'Link'
      >
    >
  >,
  SvelteSpinnerProps,
  SvelteSkeletonProps,
  SvelteLoadingStateProps,
  SvelteAsyncStateBoundaryProps,
  SvelteResponsiveButtonProps,
  SvelteResponsiveLinkProps,
];

type _VuePublicStitchSubpathSmoke = [
  ValueExport<
    typeof import('@theory-cloud/facetheory/vue/stitch-shell'),
    'Shell' | 'PageFrame' | 'BrandHeader'
  >,
  ValueExport<
    typeof import('@theory-cloud/facetheory/vue/stitch-hosted-auth'),
    'AuthPageLayout' | 'AuthCard' | 'ConsentItem'
  >,
  ValueExport<
    typeof import('@theory-cloud/facetheory/vue/stitch-admin'),
    'DataTable' | 'PackageSourceInputPanel' | 'WizardReconciliationPlanPanel'
  >,
  VueNavItem,
  VueCalloutProps,
  VueBrandHeaderProps,
  VueAuthPageLayoutProps,
  VueAuthCardProps,
  VueConsentItemProps,
  VueDataTableColumn,
  VuePackageSourceInputPanelProps,
  VueWizardReconciliationPlanPanelProps,
];

const publicSubpathExportsResolve = true satisfies
  | (_SveltePublicStitchSubpathSmoke extends readonly unknown[] ? true : never)
  | (_SvelteResponsivePrimitivesSubpathSmoke extends readonly unknown[]
      ? true
      : never)
  | (_VuePublicStitchSubpathSmoke extends readonly unknown[] ? true : never);

test('public package subpaths expose Vue and Svelte stitch modules to TypeScript consumers', () => {
  assert.equal(publicSubpathExportsResolve, true);
});

/* Svelte 5 hosted-auth snippet-prop declarations (package `types` condition). */
const zeroAritySnippet = (() => undefined) as unknown as Snippet;
const oneArgSnippet = (() => undefined) as unknown as Snippet<[string]>;

const svelteHostedAuthSnippetProps = {
  authPageLayout: {
    brand: zeroAritySnippet,
    footer: zeroAritySnippet,
    children: zeroAritySnippet,
  } satisfies SvelteAuthPageLayoutProps,
  authCard: {
    title: 'Sign in',
    headerAction: zeroAritySnippet,
    footer: zeroAritySnippet,
    children: zeroAritySnippet,
  } satisfies SvelteAuthCardProps,
  authFlowSection: {
    children: zeroAritySnippet,
  } satisfies SvelteAuthFlowSectionProps,
  authStateCard: {
    title: 'State',
    icon: zeroAritySnippet,
    actions: zeroAritySnippet,
  } satisfies SvelteAuthStateCardProps,
  consentItem: {
    label: 'Email',
    icon: zeroAritySnippet,
  } satisfies SvelteConsentItemProps,
  passkeyCta: {
    icon: zeroAritySnippet,
    children: zeroAritySnippet,
  } satisfies SvelteHostedAuthPasskeyCTAProps,
  // All six snippet props stay optional.
  optionalOnly: [
    {} satisfies SvelteAuthPageLayoutProps,
    { title: 'T' } satisfies SvelteAuthCardProps,
    { title: 'T' } satisfies SvelteAuthStateCardProps,
    {} satisfies SvelteHostedAuthPasskeyCTAProps,
  ],
};

const svelteHostedAuthInvalidAuthoring = [
  // @ts-expect-error snippet props must be Snippets, not strings
  { headerAction: 'not a snippet' } satisfies SvelteAuthCardProps,
  // @ts-expect-error snippets declared by hosted-auth are zero-arity
  { children: oneArgSnippet } satisfies SvelteAuthCardProps,
  // @ts-expect-error AuthPageLayout has no `icon` snippet
  { icon: zeroAritySnippet } satisfies SvelteAuthPageLayoutProps,
  // @ts-expect-error AuthFlowSection exposes only `children`
  { footer: zeroAritySnippet } satisfies SvelteAuthFlowSectionProps,
  // @ts-expect-error AuthStateCard has no `children` snippet
  { children: zeroAritySnippet } satisfies SvelteAuthStateCardProps,
  // @ts-expect-error ConsentItem exposes only `icon`
  { actions: zeroAritySnippet } satisfies SvelteConsentItemProps,
  // @ts-expect-error PasskeyCTA has no `footer` snippet
  { footer: zeroAritySnippet } satisfies SvelteHostedAuthPasskeyCTAProps,
];

test('svelte hosted-auth declarations admit the six optional zero-arity snippet props and reject invalid authoring', () => {
  assert.ok(svelteHostedAuthSnippetProps);
  assert.ok(svelteHostedAuthInvalidAuthoring);
});
