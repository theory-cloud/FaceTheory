import * as React from 'react';

export const TransitionStatus = undefined as unknown as string;

export function Transition({
  children,
}: {
  children: ((state: 'entered') => React.ReactNode) | React.ReactNode;
}) {
  if (typeof children === 'function') return React.createElement(React.Fragment, null, children('entered'));
  return React.createElement(React.Fragment, null, children);
}

