import {
  classifyFaceNavigationAnchorClick,
  FACE_NAVIGATION_CLASSIFIER_SOURCE,
} from './spa.js';
import { isElement, isElementWithTag } from './dom-guards.js';
import type { ClassifyFaceNavigationAnchorClickOptions } from './spa.js';

export const NAVIGATION_PENDING_CLASSIFIER_SOURCE =
  FACE_NAVIGATION_CLASSIFIER_SOURCE;
export const NAVIGATION_PENDING_ATTRIBUTE =
  'data-facetheory-navigation-pending';
export const NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE =
  'data-facetheory-reduced-motion';
export const NAVIGATION_PENDING_INDICATOR_ATTRIBUTE =
  'data-facetheory-navigation-pending-indicator';
export const DEFAULT_NAVIGATION_PENDING_INDICATOR_ID =
  'facetheory-navigation-pending';
export const DEFAULT_NAVIGATION_PENDING_TEXT = 'Loading…';

export const NAVIGATION_PENDING_BOOTSTRAP_SOURCE = `const NAV_ATTR=${JSON.stringify(NAVIGATION_PENDING_ATTRIBUTE)};
const INDICATOR_ATTR=${JSON.stringify(NAVIGATION_PENDING_INDICATOR_ATTRIBUTE)};
const DEFAULT_INDICATOR_ID=${JSON.stringify(DEFAULT_NAVIGATION_PENDING_INDICATOR_ID)};
function sameOriginUrl(href){try{const url=new URL(href,window.location.href);return url.origin===window.location.origin?url:null;}catch{return null;}}
function acceptedAnchor(event){if(event.defaultPrevented||event.button!==0||event.metaKey||event.altKey||event.ctrlKey||event.shiftKey)return null;const target=event.target instanceof Element?event.target.closest('a[href]'):null;if(!(target instanceof HTMLAnchorElement))return null;if(target.target&&target.target.toLowerCase()!=='_self')return null;if(target.hasAttribute('download')||target.hasAttribute('data-facetheory-reload'))return null;const rel=(target.getAttribute('rel')||'').toLowerCase().split(/\\s+/);if(rel.includes('external'))return null;const url=sameOriginUrl(target.href);if(!url||url.href===window.location.href)return null;return target;}
function isIndicator(el){return el instanceof HTMLElement&&el.getAttribute(INDICATOR_ATTR)==='true';}
function indicatorElement(id){const existing=document.getElementById(id);if(isIndicator(existing))return existing;if(!existing){const el=document.createElement('div');el.id=id;return el;}for(let i=1;i<1000;i+=1){const candidate=id+'-'+String(i);const next=document.getElementById(candidate);if(isIndicator(next))return next;if(!next){const el=document.createElement('div');el.id=candidate;console.warn('FaceTheory navigation pending indicator id "'+id+'" already belongs to a non-indicator element; using "'+candidate+'" instead.');return el;}}throw new Error('FaceTheory navigation pending could not allocate indicator id');}
function showPending(source,targets){for(const target of targets){target.setAttribute(NAV_ATTR,source);target.setAttribute('aria-busy','true');target.classList.add('facetheory-navigation-pending-control');}const el=indicatorElement(DEFAULT_INDICATOR_ID);el.textContent='Loading…';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');el.setAttribute(NAV_ATTR,source);el.setAttribute(INDICATOR_ATTR,'true');el.classList.add('facetheory-navigation-pending-pill');if(!el.parentNode)(document.body||document.documentElement).appendChild(el);}
function startNavigationPending(){document.addEventListener('click',event=>{const anchor=acceptedAnchor(event);if(anchor)showPending('link',[anchor]);});document.addEventListener('submit',event=>{const form=event.target instanceof HTMLFormElement?event.target:null;if(!form)return;const targets=[form];if(event.submitter instanceof HTMLElement)targets.push(event.submitter);showPending('form',targets);},true);}`;

export interface NavigationPendingClassNames {
  form?: string;
  indicator?: string;
  link?: string;
  pendingControl?: string;
  reducedMotion?: string;
  submitter?: string;
}

export interface StartNavigationPendingOptions {
  classNames?: NavigationPendingClassNames;
  document?: Document;
  indicatorId?: string;
  indicatorText?: string;
  shouldHandleUrl?: (url: URL, anchor: HTMLAnchorElement | null) => boolean;
  window?: Window;
}

export interface NavigationPendingController {
  clear: () => void;
  isPending: () => boolean;
  stop: () => void;
}

interface ResolvedNavigationPendingClassNames {
  form: string;
  indicator: string;
  link: string;
  pendingControl: string;
  reducedMotion: string;
  submitter: string;
}

interface ElementSnapshot {
  attributes: Map<string, string | null>;
  childNodes?: Node[] | undefined;
  element: Element;
}

interface IndicatorSnapshot extends ElementSnapshot {
  created: boolean;
}

export function startNavigationPending(
  options: StartNavigationPendingOptions = {},
): NavigationPendingController {
  const doc = options.document ?? document;
  const win = options.window ?? doc.defaultView ?? window;
  const classNames = resolveClassNames(options.classNames);
  const indicatorId =
    options.indicatorId ?? DEFAULT_NAVIGATION_PENDING_INDICATOR_ID;
  const indicatorText =
    options.indicatorText ?? DEFAULT_NAVIGATION_PENDING_TEXT;

  let indicator: IndicatorSnapshot | null = null;
  let pendingElements: ElementSnapshot[] = [];
  let pending = false;
  let stopped = false;

  const classifyOptions = (): ClassifyFaceNavigationAnchorClickOptions => {
    const nextOptions: ClassifyFaceNavigationAnchorClickOptions = {
      window: win,
    };
    if (options.shouldHandleUrl !== undefined) {
      nextOptions.shouldHandleUrl = options.shouldHandleUrl;
    }
    return nextOptions;
  };

  const clearPending = (): void => {
    for (let index = pendingElements.length - 1; index >= 0; index -= 1) {
      const snapshot = pendingElements[index];
      if (snapshot) restoreElementSnapshot(snapshot);
    }
    pendingElements = [];

    if (indicator) {
      if (indicator.created) {
        indicator.element.remove();
      } else {
        restoreElementSnapshot(indicator);
      }
      indicator = null;
    }

    pending = false;
  };

  const showPending = (
    source: 'link' | 'form',
    targets: ReadonlyArray<{
      element: Element;
      role: 'link' | 'form' | 'submitter';
    }>,
  ): void => {
    if (stopped) return;
    clearPending();

    for (const target of targets) {
      markPendingElement(
        target.element,
        target.role,
        classNames,
        pendingElements,
      );
    }

    indicator = showIndicator({
      classNames,
      doc,
      id: indicatorId,
      reducedMotion: prefersReducedMotion(win),
      source,
      text: indicatorText,
    });

    pending = true;
  };

  const handleClick = (event: MouseEvent): void => {
    const navigation = classifyFaceNavigationAnchorClick(
      event,
      classifyOptions(),
    );
    if (!navigation) return;

    showPending('link', [{ element: navigation.anchor, role: 'link' }]);
  };

  const handleSubmit = (event: Event): void => {
    const submitEvent = event as SubmitEvent;
    const form = readSubmitForm(submitEvent);
    if (!form) return;

    const targets: Array<{ element: Element; role: 'form' | 'submitter' }> = [
      { element: form, role: 'form' },
    ];
    const submitter = readSubmitter(submitEvent);
    if (submitter) {
      targets.push({ element: submitter, role: 'submitter' });
    }

    showPending('form', targets);
  };

  const handleLifecycleCleanup = (): void => {
    clearPending();
  };

  doc.addEventListener('click', handleClick);
  doc.addEventListener('submit', handleSubmit, true);
  win.addEventListener('pageshow', handleLifecycleCleanup);
  win.addEventListener('pagehide', handleLifecycleCleanup);
  doc.addEventListener('visibilitychange', handleLifecycleCleanup);

  return {
    clear: clearPending,
    isPending: () => pending,
    stop: () => {
      if (stopped) return;
      stopped = true;
      doc.removeEventListener('click', handleClick);
      doc.removeEventListener('submit', handleSubmit, true);
      win.removeEventListener('pageshow', handleLifecycleCleanup);
      win.removeEventListener('pagehide', handleLifecycleCleanup);
      doc.removeEventListener('visibilitychange', handleLifecycleCleanup);
      clearPending();
    },
  };
}

function resolveClassNames(
  classNames: NavigationPendingClassNames | undefined,
): ResolvedNavigationPendingClassNames {
  return {
    form: classNames?.form ?? 'facetheory-navigation-pending-form',
    indicator: classNames?.indicator ?? 'facetheory-navigation-pending-pill',
    link: classNames?.link ?? 'facetheory-navigation-pending-link',
    pendingControl:
      classNames?.pendingControl ?? 'facetheory-navigation-pending-control',
    reducedMotion:
      classNames?.reducedMotion ??
      'facetheory-navigation-pending--reduced-motion',
    submitter:
      classNames?.submitter ?? 'facetheory-navigation-pending-submitter',
  };
}

function showIndicator(options: {
  classNames: ResolvedNavigationPendingClassNames;
  doc: Document;
  id: string;
  reducedMotion: boolean;
  source: 'link' | 'form';
  text: string;
}): IndicatorSnapshot {
  const resolved = resolveIndicatorElement(options.doc, options.id);
  const existing = resolved.created ? null : resolved.element;
  const element = resolved.element;
  const snapshot = snapshotElement(
    element,
    [
      'role',
      'aria-live',
      'aria-atomic',
      'class',
      NAVIGATION_PENDING_ATTRIBUTE,
      NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE,
      NAVIGATION_PENDING_INDICATOR_ATTRIBUTE,
    ],
    { childNodes: true },
  );

  if (!existing) {
    element.id = resolved.id;
  }
  element.textContent = options.text;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  element.setAttribute(NAVIGATION_PENDING_ATTRIBUTE, options.source);
  element.setAttribute(NAVIGATION_PENDING_INDICATOR_ATTRIBUTE, 'true');
  element.classList.add(options.classNames.indicator);

  if (options.reducedMotion) {
    element.setAttribute(NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE, 'true');
    element.classList.add(options.classNames.reducedMotion);
  } else {
    element.removeAttribute(NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE);
    element.classList.remove(options.classNames.reducedMotion);
  }

  if (!existing) {
    (options.doc.body ?? options.doc.documentElement).appendChild(element);
  }

  return {
    ...snapshot,
    created: !existing,
  };
}

function resolveIndicatorElement(
  doc: Document,
  requestedId: string,
): { created: boolean; element: HTMLElement; id: string } {
  const normalizedId = String(
    requestedId || DEFAULT_NAVIGATION_PENDING_INDICATOR_ID,
  );
  const existing = doc.getElementById(normalizedId);
  if (isNavigationPendingIndicator(existing)) {
    return { created: false, element: existing, id: normalizedId };
  }
  if (!existing) {
    return {
      created: true,
      element: doc.createElement('div'),
      id: normalizedId,
    };
  }

  const resolved = nextAvailableIndicatorElement(doc, normalizedId);
  warnIndicatorIdCollision(normalizedId, resolved.id);
  return resolved;
}

function nextAvailableIndicatorElement(
  doc: Document,
  baseId: string,
): { created: boolean; element: HTMLElement; id: string } {
  for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `${baseId}-${String(index)}`;
    const existing = doc.getElementById(candidate);
    if (isNavigationPendingIndicator(existing)) {
      return { created: false, element: existing, id: candidate };
    }
    if (!existing) {
      return {
        created: true,
        element: doc.createElement('div'),
        id: candidate,
      };
    }
  }

  throw new Error(
    'FaceTheory navigation pending could not allocate indicator id',
  );
}

function warnIndicatorIdCollision(
  requestedId: string,
  resolvedId: string,
): void {
  const warn = globalThis.console?.warn;
  if (typeof warn !== 'function') return;
  warn(
    `FaceTheory navigation pending indicator id "${requestedId}" already belongs to a non-indicator element; using "${resolvedId}" instead.`,
  );
}

function isNavigationPendingIndicator(
  element: Element | null,
): element is HTMLElement {
  return (
    isElement(element) &&
    element.getAttribute(NAVIGATION_PENDING_INDICATOR_ATTRIBUTE) === 'true'
  );
}

function markPendingElement(
  element: Element,
  role: 'link' | 'form' | 'submitter',
  classNames: ResolvedNavigationPendingClassNames,
  snapshots: ElementSnapshot[],
): void {
  snapshots.push(
    snapshotElement(element, [
      'aria-busy',
      'class',
      NAVIGATION_PENDING_ATTRIBUTE,
    ]),
  );

  element.setAttribute(NAVIGATION_PENDING_ATTRIBUTE, role);
  element.setAttribute('aria-busy', 'true');
  element.classList.add(classNames.pendingControl);

  if (role === 'link') {
    element.classList.add(classNames.link);
  } else if (role === 'form') {
    element.classList.add(classNames.form);
  } else {
    element.classList.add(classNames.submitter);
  }
}

function snapshotElement(
  element: Element,
  attributeNames: readonly string[],
  options: { childNodes?: boolean } = {},
): ElementSnapshot {
  const attributes = new Map<string, string | null>();
  for (const name of attributeNames) {
    attributes.set(name, element.getAttribute(name));
  }
  const snapshot: ElementSnapshot = { attributes, element };
  if (options.childNodes === true) {
    snapshot.childNodes = Array.from(element.childNodes).map((node) =>
      node.cloneNode(true),
    );
  }
  return snapshot;
}

function restoreElementSnapshot(snapshot: ElementSnapshot): void {
  for (const [name, value] of snapshot.attributes) {
    if (value === null) {
      snapshot.element.removeAttribute(name);
    } else {
      snapshot.element.setAttribute(name, value);
    }
  }

  if (snapshot.childNodes !== undefined) {
    snapshot.element.replaceChildren(
      ...snapshot.childNodes.map((node) => node.cloneNode(true)),
    );
  }
}

function prefersReducedMotion(win: Window): boolean {
  try {
    return (
      typeof win.matchMedia === 'function' &&
      win.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function readSubmitForm(event: SubmitEvent): HTMLFormElement | null {
  return isElementWithTag(event.target, 'form')
    ? (event.target as HTMLFormElement)
    : null;
}

function readSubmitter(event: SubmitEvent): HTMLElement | null {
  return isElement(event.submitter) ? (event.submitter as HTMLElement) : null;
}
