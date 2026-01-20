import { normalizePath } from './types.js';

export interface RouteMatch {
  pattern: string;
  params: Record<string, string>;
  proxy?: string;
}

interface CompiledRoute {
  pattern: string;
  segments: string[];
}

function splitPath(path: string): string[] {
  const normalized = normalizePath(path).replace(/^\//, '');
  if (!normalized) return [];
  return normalized.split('/');
}

function segmentWeight(segment: string): number {
  if (segment === '{proxy+}' || segment === '{proxy*}') return 1;
  if (segment.startsWith('{') && segment.endsWith('}') && segment.length > 2) return 2;
  return 3;
}

function specificityScore(segments: string[]): number {
  let score = 0;
  for (const seg of segments) {
    score *= 10;
    score += segmentWeight(seg);
  }
  return score;
}

function matchPath(
  patternSegments: string[],
  pathSegments: string[],
): { params: Record<string, string>; proxy?: string } | null {
  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i += 1) {
    const pattern = patternSegments[i];
    if (!pattern) return null;

    if (pattern === '{proxy+}' || pattern === '{proxy*}') {
      if (i !== patternSegments.length - 1) return null;
      if (pattern === '{proxy+}' && pathSegments.length <= i) return null;

      const rest = pathSegments.slice(i).join('/');
      if (rest) params.proxy = rest;
      return rest ? { params, proxy: rest } : { params };
    }

    const seg = pathSegments[i];
    if (!seg) return null;

    if (pattern.startsWith('{') && pattern.endsWith('}') && pattern.length > 2) {
      const name = pattern.slice(1, -1);
      params[name] = seg;
      continue;
    }
    if (pattern !== seg) return null;
  }

  if (patternSegments.length !== pathSegments.length) return null;
  return { params };
}

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(pattern: string): void {
    const normalized = normalizePath(pattern);
    this.routes.push({ pattern: normalized, segments: splitPath(normalized) });
  }

  match(path: string): RouteMatch | null {
    const pathSegments = splitPath(path);

    let best: { route: CompiledRoute; params: Record<string, string>; proxy?: string } | null =
      null;
    let bestScore = -1;

    for (const route of this.routes) {
      const out = matchPath(route.segments, pathSegments);
      if (!out) continue;

      const score = specificityScore(route.segments);
      if (!best || score > bestScore) {
        best =
          out.proxy === undefined
            ? { route, params: out.params }
            : { route, params: out.params, proxy: out.proxy };
        bestScore = score;
      }
    }

    if (!best) return null;
    return best.proxy === undefined
      ? { pattern: best.route.pattern, params: best.params }
      : { pattern: best.route.pattern, params: best.params, proxy: best.proxy };
  }
}
