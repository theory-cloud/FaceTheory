/**
 * Mirrors the server routes in entry-server.ts: `/brand` renders AppBrand and
 * every other path renders App, so the client must hydrate the same component
 * the server rendered.
 */
export function selectHydrationRoot<T>(
  pathname: string,
  app: T,
  appBrand: T,
): T {
  return pathname === '/brand' ? appBrand : app;
}
