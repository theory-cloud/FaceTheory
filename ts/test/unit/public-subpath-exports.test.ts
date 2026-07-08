import assert from 'node:assert/strict';
import test from 'node:test';

import type { Component as SvelteComponent } from 'svelte';

import type {
  BrandHeaderProps as SvelteBrandHeaderProps,
  PageFrameProps as SveltePageFrameProps,
  ShellProps as SvelteShellProps,
} from '@theory-cloud/facetheory/svelte/stitch-shell';
import type {
  AuthCardProps as SvelteAuthCardProps,
  AuthPageLayoutProps as SvelteAuthPageLayoutProps,
  ConsentItemProps as SvelteConsentItemProps,
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
