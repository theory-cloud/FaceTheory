export function useLocation() {
  return { pathname: '/dashboard' };
}

export function useNavigate() {
  return (_to: string) => {};
}

export function matchPath(pattern: string, pathname: string): unknown {
  const key = String(pattern ?? '');
  const path = String(pathname ?? '');
  if (key.endsWith('/*')) {
    const prefix = key.slice(0, -2);
    return path === prefix || path.startsWith(`${prefix}/`) ? { path: key } : null;
  }
  return key === path ? { path: key } : null;
}

