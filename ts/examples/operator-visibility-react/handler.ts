// Deterministic React SSR operator visibility example.
//
// The Face `load()` function injects every authority, confidence, freshness,
// guard, health, and matrix value. The React render path only displays those
// caller-supplied values; it never computes freshness from ambient time.

import * as React from 'react';

import { createFaceApp } from '../../src/app.js';
import { createReactFace } from '../../src/adapters/react.js';
import type { FaceApp } from '../../src/app.js';
import type { FaceContext } from '../../src/types.js';
import type {
  OperatorEmptyStateConfig,
  OperatorGuardStatus,
  OperatorHealthRow,
  OperatorVisibilityMetadata,
  VisibilityMatrixDimension,
  VisibilityMatrixRow,
} from '../../src/stitch-admin/index.js';
import {
  GuardedOperatorShell,
  HealthStatusPanel,
  NonAuthoritativeBanner,
  OperatorEmptyState,
  VisibilityMatrix,
} from '../../src/react/stitch-admin/index.js';

const h = React.createElement;

const SNAPSHOT_AT = '2026-04-24T18:00:00.000Z';

export interface OperatorVisibilityExampleData {
  snapshotLabel: string;
  snapshotAt: string;
  guard: OperatorGuardStatus;
  noticeMetadata: OperatorVisibilityMetadata;
  healthRows: OperatorHealthRow[];
  dimensions: VisibilityMatrixDimension[];
  rows: VisibilityMatrixRow[];
  emptyState: OperatorEmptyStateConfig;
}

export async function loadOperatorVisibilityDashboard(
  _ctx: FaceContext,
): Promise<OperatorVisibilityExampleData> {
  return {
    snapshotLabel: 'Training snapshot · 2026-04-24 18:00 UTC',
    snapshotAt: SNAPSHOT_AT,
    guard: {
      state: 'authorized',
      principalLabel: 'Operator Training Role',
      requestId: 'req_example_visibility_001',
    },
    noticeMetadata: {
      authority: 'non-authoritative',
      provenance: {
        source: 'Example import manifest',
        sourceId: 'example-import-2026-04-24T18:00Z',
        observedAt: SNAPSHOT_AT,
      },
      confidence: {
        level: 'low',
        label: 'Low confidence',
        reason: 'Only one injected source supplied the sandbox mapping.',
      },
      staleness: {
        state: 'stale',
        ageLabel: 'refreshed 2 hours before snapshot',
        reason:
          'The fixture intentionally passes a stale caller-supplied label.',
      },
    },
    healthRows: [
      {
        key: 'policy-api',
        label: 'Policy API',
        status: 'degraded',
        description: 'Injected Lambda health observation for the policy path.',
        detail: 'p95 420ms',
        checkedAt: '2026-04-24T17:54:00.000Z',
        metadata: {
          provenance: {
            source: 'operator-health-fixture',
            sourceId: 'health_example_001',
          },
          staleness: {
            state: 'stale',
            ageLabel: 'checked 6 minutes before snapshot',
            reason: 'Health observations are supplied by load data.',
          },
        },
      },
      {
        key: 'audit-stream',
        label: 'Audit stream',
        status: 'healthy',
        description: 'Injected stream observation for audit evidence.',
        detail: 'lag 11s',
        checkedAt: '2026-04-24T17:59:00.000Z',
        metadata: {
          provenance: { source: 'operator-health-fixture' },
          staleness: {
            state: 'fresh',
            ageLabel: 'checked 1 minute before snapshot',
          },
        },
      },
    ],
    dimensions: [
      {
        key: 'checkout-sandbox',
        label: 'Checkout sandbox',
        description: 'Safe integration environment.',
      },
      {
        key: 'checkout-live-review',
        label: 'Checkout live review',
        description: 'Operator review gate for live access.',
      },
      {
        key: 'support-view',
        label: 'Support view',
        description: 'Read-only support diagnostics.',
      },
    ],
    rows: [
      {
        entity: {
          key: 'training-cohort-alpha',
          label: 'Training cohort alpha',
          description: 'Synthetic cohort with injected visibility evidence.',
          metadata: {
            authority: 'non-authoritative',
            provenance: { source: 'Example import manifest' },
            confidence: { level: 'medium', label: 'Medium confidence' },
          },
        },
        cells: [
          {
            entityKey: 'training-cohort-alpha',
            dimensionKey: 'checkout-sandbox',
            state: 'visible',
            label: 'Visible',
            detail: 'Sandbox entitlement imported by the loader.',
            metadata: {
              authority: 'non-authoritative',
              provenance: { source: 'Example import manifest' },
              confidence: { level: 'low', label: 'Low confidence' },
              staleness: {
                state: 'stale',
                ageLabel: 'refreshed 2 hours before snapshot',
              },
            },
          },
          {
            entityKey: 'training-cohort-alpha',
            dimensionKey: 'checkout-live-review',
            state: 'partial',
            label: 'Review required',
            detail: 'A human approval gate has not completed.',
            metadata: {
              authority: 'unknown',
              confidence: { level: 'low', label: 'Low confidence' },
              staleness: {
                state: 'unknown',
                ageLabel: 'freshness supplied as unknown',
              },
            },
          },
          {
            entityKey: 'training-cohort-alpha',
            dimensionKey: 'support-view',
            state: 'blocked',
            label: 'Blocked',
            detail: 'Support access is intentionally withheld.',
            metadata: {
              authority: 'authoritative',
              confidence: { level: 'high', label: 'High confidence' },
            },
          },
        ],
      },
      {
        entity: {
          key: 'training-cohort-beta',
          label: 'Training cohort beta',
          description: 'Synthetic cohort with a missing matrix cell.',
        },
        cells: [
          {
            entityKey: 'training-cohort-beta',
            dimensionKey: 'checkout-sandbox',
            state: 'not-visible',
            label: 'Not visible',
            detail: 'No sandbox entitlement was injected.',
          },
          {
            entityKey: 'training-cohort-beta',
            dimensionKey: 'checkout-live-review',
            state: 'unknown',
            detail: 'The loader supplied an unknown live-review state.',
          },
        ],
      },
    ],
    emptyState: {
      intent: 'filtered-empty',
      title: 'No matching visibility rows',
      description:
        'The filtered state is intentionally empty; the example does not render fake partner, tenant, release, or version placeholders.',
      placeholderDataPolicy: 'no-production-like-data',
    },
  };
}

export interface OperatorVisibilityDashboardProps {
  data: OperatorVisibilityExampleData;
}

export function OperatorVisibilityDashboard(
  props: OperatorVisibilityDashboardProps,
): React.ReactElement {
  const { data } = props;

  return h(
    'main',
    {
      className: 'facetheory-operator-visibility-example',
      'data-example': 'operator-visibility-react',
      'data-source': 'facetheory-load',
      'data-snapshot-at': data.snapshotAt,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '32px',
        background: 'var(--stitch-color-surface, #fbf8ff)',
        color: 'var(--stitch-color-on-surface, #131b2e)',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    },
    h(
      'header',
      {
        className: 'facetheory-operator-visibility-example-header',
        style: { display: 'flex', flexDirection: 'column', gap: '8px' },
      },
      h('p', { style: { margin: 0, fontSize: '13px' } }, data.snapshotLabel),
      h(
        'h1',
        { style: { margin: 0, fontSize: '30px', lineHeight: 1.15 } },
        'Operator visibility dashboard',
      ),
      h(
        'p',
        {
          style: {
            maxWidth: '760px',
            margin: 0,
            fontSize: '14px',
            lineHeight: 1.6,
            color: 'var(--stitch-color-on-surface-variant, #464553)',
          },
        },
        'All authority, confidence, freshness, guard, health, and matrix values are injected by the Face load() function before render.',
      ),
    ),
    h(
      GuardedOperatorShell,
      { guard: data.guard },
      h(
        React.Fragment,
        null,
        h(NonAuthoritativeBanner, {
          title: 'Imported visibility evidence',
          description:
            'This snapshot is useful for operator review, but it remains non-authoritative until an upstream approval gate confirms it.',
          metadata: data.noticeMetadata,
        }),
        h(HealthStatusPanel, {
          title: 'Operator dependency health',
          description:
            'Stable API and stream observations injected by the loader.',
          rows: data.healthRows,
        }),
        h(VisibilityMatrix, {
          title: 'Entity × capability visibility',
          description:
            'The host supplies each cell; missing cells render as explicit empty records.',
          dimensions: data.dimensions,
          rows: data.rows,
          emptyCellLabel: 'No injected visibility record',
        }),
        h(OperatorEmptyState, { config: data.emptyState }),
      ),
    ),
  );
}

export interface OperatorVisibilityExampleAppOptions {
  loadDashboard?: (ctx: FaceContext) => Promise<OperatorVisibilityExampleData>;
}

export function createOperatorVisibilityExampleApp(
  options: OperatorVisibilityExampleAppOptions = {},
): FaceApp {
  return createFaceApp({
    faces: [
      createReactFace<OperatorVisibilityExampleData>({
        route: '/',
        mode: 'ssr',
        load: options.loadDashboard ?? loadOperatorVisibilityDashboard,
        render: (_ctx, data) => h(OperatorVisibilityDashboard, { data }),
        renderOptions: {
          headers: { 'cache-control': 'no-store' },
          headTags: [
            {
              type: 'title',
              text: 'FaceTheory operator visibility example',
            },
            {
              type: 'meta',
              attrs: {
                name: 'facetheory-example',
                content: 'operator-visibility-react',
              },
            },
          ],
        },
      }),
    ],
  });
}

export const faceApp = createOperatorVisibilityExampleApp();

export async function handler(event: unknown): Promise<unknown> {
  const lambdaEvent = event as {
    requestContext?: { http?: { method?: string } };
    rawPath?: string;
    rawQueryString?: string;
    headers?: Record<string, string | undefined>;
  };

  return faceApp.handle({
    method: lambdaEvent.requestContext?.http?.method ?? 'GET',
    path:
      lambdaEvent.rawQueryString && lambdaEvent.rawPath
        ? `${lambdaEvent.rawPath}?${lambdaEvent.rawQueryString}`
        : (lambdaEvent.rawPath ?? '/'),
    headers: Object.fromEntries(
      Object.entries(lambdaEvent.headers ?? {}).map(([name, value]) => [
        name,
        value === undefined ? [] : [value],
      ]),
    ),
  });
}
