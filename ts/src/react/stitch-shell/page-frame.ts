import * as React from 'react';
import { Breadcrumb as AntBreadcrumb, Typography } from 'antd';

import type { BreadcrumbNode } from './nav-types.js';

const h = React.createElement;

export interface BreadcrumbProps {
  items: BreadcrumbNode[];
  onNavigate?: (node: BreadcrumbNode) => void;
}

export function Breadcrumb(props: BreadcrumbProps): React.ReactElement | null {
  const { items, onNavigate } = props;
  if (items.length === 0) return null;

  const antItems = items.map((node) => {
    if (node.path !== undefined && onNavigate) {
      return {
        key: node.key,
        title: h(
          'a',
          {
            onClick: (event: React.MouseEvent) => {
              event.preventDefault();
              onNavigate(node);
            },
            href: node.path,
          },
          node.label,
        ),
      };
    }
    return { key: node.key, title: node.label };
  });

  return h(AntBreadcrumb, {
    className: 'facetheory-stitch-breadcrumb',
    items: antItems,
    separator: '›',
  });
}

export interface PageTitleProps {
  children: React.ReactNode;
  description?: React.ReactNode;
}

export function PageTitle(props: PageTitleProps): React.ReactElement {
  const { children, description } = props;
  return h(
    'div',
    {
      className: 'facetheory-stitch-page-title',
      style: { display: 'flex', flexDirection: 'column', gap: '4px' },
    },
    h(
      Typography.Title,
      {
        level: 1,
        style: { margin: 0, fontSize: '28px', lineHeight: 1.2 },
      },
      children,
    ),
    description !== undefined
      ? h(
          Typography.Text,
          { type: 'secondary', style: { fontSize: '14px' } },
          description,
        )
      : null,
  );
}

export interface PageFrameProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: BreadcrumbNode[];
  onBreadcrumbNavigate?: (node: BreadcrumbNode) => void;
  /** Right-aligned slot for primary page actions. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Per-route wrapper that stamps consistent padding, a breadcrumb, a page
 * title, an optional action slot, and the page body. Use this once per
 * route rather than constructing headers ad-hoc.
 */
export function PageFrame(props: PageFrameProps): React.ReactElement {
  const { title, description, breadcrumbs, onBreadcrumbNavigate, actions, children } =
    props;

  const breadcrumbProps: BreadcrumbProps = {
    items: breadcrumbs ?? [],
  };
  if (onBreadcrumbNavigate !== undefined) {
    breadcrumbProps.onNavigate = onBreadcrumbNavigate;
  }

  const titleProps: PageTitleProps | null =
    title !== undefined
      ? description !== undefined
        ? { children: title, description }
        : { children: title }
      : null;

  return h(
    'div',
    {
      className: 'facetheory-stitch-page-frame',
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '32px 48px',
      },
    },
    breadcrumbs && breadcrumbs.length > 0 ? h(Breadcrumb, breadcrumbProps) : null,
    titleProps !== null || actions !== undefined
      ? h(
          'div',
          {
            className: 'facetheory-stitch-page-frame-header',
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '24px',
            },
          },
          titleProps !== null ? h(PageTitle, titleProps) : h('div', null),
          actions !== undefined
            ? h(
                'div',
                {
                  className: 'facetheory-stitch-page-frame-actions',
                  style: { display: 'flex', gap: '12px', flexShrink: 0 },
                },
                actions,
              )
            : null,
        )
      : null,
    h(
      'div',
      {
        className: 'facetheory-stitch-page-frame-body',
        style: { display: 'flex', flexDirection: 'column', gap: '24px' },
      },
      children,
    ),
  );
}
