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

type ParsedPatternSegment =
  | { kind: 'static'; value: string }
  | { kind: 'param'; name: string }
  | { kind: 'proxy_plus'; name: string }
  | { kind: 'proxy_star'; name: string };

export type RoutePatternConflict = 'duplicate' | 'ambiguous';

function parsePatternSegment(segment: string): ParsedPatternSegment {
  if (
    !(segment.startsWith('{') && segment.endsWith('}')) ||
    segment.length <= 2
  ) {
    return { kind: 'static', value: segment };
  }

  const token = segment.slice(1, -1);
  if (token.endsWith('+'))
    return { kind: 'proxy_plus', name: token.slice(0, -1) };
  if (token.endsWith('*'))
    return { kind: 'proxy_star', name: token.slice(0, -1) };
  return { kind: 'param', name: token };
}

function segmentWeight(segment: string): number {
  const parsed = parsePatternSegment(segment);
  if (parsed.kind === 'proxy_plus' || parsed.kind === 'proxy_star') return 1;
  if (parsed.kind === 'param') return 2;
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

function isProxySegment(
  segment: ParsedPatternSegment,
): segment is
  | { kind: 'proxy_plus'; name: string }
  | { kind: 'proxy_star'; name: string } {
  return segment.kind === 'proxy_plus' || segment.kind === 'proxy_star';
}

function minRemainingSegments(
  segments: string[],
  start: number,
): number | null {
  let count = 0;

  for (let i = start; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!segment) return null;

    const parsed = parsePatternSegment(segment);
    if (isProxySegment(parsed)) {
      if (i !== segments.length - 1 || !parsed.name) return null;
      return count + (parsed.kind === 'proxy_plus' ? 1 : 0);
    }

    if (parsed.kind === 'param' && !parsed.name) return null;
    count += 1;
  }

  return count;
}

function maxRemainingSegments(
  segments: string[],
  start: number,
): number | null {
  let count = 0;

  for (let i = start; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!segment) return null;

    const parsed = parsePatternSegment(segment);
    if (isProxySegment(parsed)) {
      if (i !== segments.length - 1 || !parsed.name) return null;
      return Number.POSITIVE_INFINITY;
    }

    if (parsed.kind === 'param' && !parsed.name) return null;
    count += 1;
  }

  return count;
}

function proxyRemainingOverlaps(
  proxy: Extract<ParsedPatternSegment, { kind: 'proxy_plus' | 'proxy_star' }>,
  ownerSegments: string[],
  ownerIndex: number,
  otherSegments: string[],
  otherIndex: number,
): boolean {
  if (ownerIndex !== ownerSegments.length - 1 || !proxy.name) return false;

  const minProxySegments = proxy.kind === 'proxy_plus' ? 1 : 0;
  const maxOtherSegments = maxRemainingSegments(otherSegments, otherIndex);
  if (maxOtherSegments === null) return false;

  return maxOtherSegments >= minProxySegments;
}

function nonProxySegmentsOverlap(
  left: ParsedPatternSegment,
  right: ParsedPatternSegment,
): boolean {
  if (left.kind === 'param' && !left.name) return false;
  if (right.kind === 'param' && !right.name) return false;

  if (left.kind === 'static' && right.kind === 'static') {
    return left.value === right.value;
  }

  return true;
}

function routeSegmentsMayOverlap(
  leftSegments: string[],
  rightSegments: string[],
  leftIndex = 0,
  rightIndex = 0,
): boolean {
  if (leftIndex >= leftSegments.length) {
    return minRemainingSegments(rightSegments, rightIndex) === 0;
  }

  if (rightIndex >= rightSegments.length) {
    return minRemainingSegments(leftSegments, leftIndex) === 0;
  }

  const leftSegment = leftSegments[leftIndex];
  const rightSegment = rightSegments[rightIndex];
  if (!leftSegment || !rightSegment) return false;

  const left = parsePatternSegment(leftSegment);
  const right = parsePatternSegment(rightSegment);

  if (isProxySegment(left)) {
    return proxyRemainingOverlaps(
      left,
      leftSegments,
      leftIndex,
      rightSegments,
      rightIndex,
    );
  }

  if (isProxySegment(right)) {
    return proxyRemainingOverlaps(
      right,
      rightSegments,
      rightIndex,
      leftSegments,
      leftIndex,
    );
  }

  if (!nonProxySegmentsOverlap(left, right)) return false;

  return routeSegmentsMayOverlap(
    leftSegments,
    rightSegments,
    leftIndex + 1,
    rightIndex + 1,
  );
}

export function routePatternConflict(
  leftPattern: string,
  rightPattern: string,
): RoutePatternConflict | null {
  const leftNormalized = normalizePath(leftPattern);
  const rightNormalized = normalizePath(rightPattern);

  if (leftNormalized === rightNormalized) return 'duplicate';

  const leftSegments = splitPath(leftNormalized);
  const rightSegments = splitPath(rightNormalized);

  if (specificityScore(leftSegments) !== specificityScore(rightSegments)) {
    return null;
  }

  return routeSegmentsMayOverlap(leftSegments, rightSegments)
    ? 'ambiguous'
    : null;
}

function matchPath(
  patternSegments: string[],
  pathSegments: string[],
): { params: Record<string, string>; proxy?: string } | null {
  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i += 1) {
    const pattern = patternSegments[i];
    if (!pattern) return null;

    const parsed = parsePatternSegment(pattern);
    if (parsed.kind === 'proxy_plus' || parsed.kind === 'proxy_star') {
      if (i !== patternSegments.length - 1) return null;
      if (!parsed.name) return null;

      const restSegments = pathSegments.slice(i);
      if (parsed.kind === 'proxy_plus' && restSegments.length === 0)
        return null;

      const rest = restSegments.join('/');
      if (rest) params[parsed.name] = rest;
      return rest ? { params, proxy: rest } : { params };
    }

    const seg = pathSegments[i];
    if (!seg) return null;

    if (parsed.kind === 'param') {
      if (!parsed.name) return null;
      params[parsed.name] = seg;
      continue;
    }
    if (parsed.kind !== 'static') return null;
    if (parsed.value !== seg) return null;
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

    let best: {
      route: CompiledRoute;
      params: Record<string, string>;
      proxy?: string;
    } | null = null;
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
