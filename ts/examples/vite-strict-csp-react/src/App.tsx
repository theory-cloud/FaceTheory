import * as React from 'react';

export interface StrictCspReactAppProps {
  page: 'home' | 'next';
  message: string;
  detail: string;
  logoUrl: string;
}

const NAV_ITEMS = [
  { href: '/', label: 'Home', page: 'home' as const },
  { href: '/next', label: 'Next', page: 'next' as const },
];

export function App({
  page,
  message,
  detail,
  logoUrl,
}: StrictCspReactAppProps): React.ReactElement {
  return React.createElement(
    'main',
    {
      className: 'strict-csp-shell',
      'data-facetheory-view': '',
      'data-page': page,
    },
    React.createElement(
      'section',
      { className: 'strict-csp-card', 'aria-labelledby': 'strict-csp-title' },
      React.createElement('img', {
        className: 'strict-csp-logo',
        src: logoUrl,
        alt: 'FaceTheory strict CSP',
      }),
      React.createElement(
        'p',
        { className: 'strict-csp-eyebrow' },
        'FaceTheory strict CSP',
      ),
      React.createElement(
        'h1',
        { id: 'strict-csp-title', className: 'strict-csp-title' },
        'React + Vite without inline output',
      ),
      React.createElement('p', { className: 'strict-csp-copy' }, `Hello ${message}`),
      React.createElement('p', { className: 'strict-csp-copy' }, detail),
      React.createElement(
        'nav',
        { className: 'strict-csp-nav', 'aria-label': 'Strict CSP example pages' },
        NAV_ITEMS.map((item) =>
          React.createElement(
            'a',
            {
              key: item.href,
              className: 'strict-csp-link',
              href: item.href,
              ...(item.page === page ? { 'aria-current': 'page' } : {}),
            },
            item.label,
          ),
        ),
      ),
    ),
  );
}
