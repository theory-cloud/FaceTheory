import {
  classifyFaceNavigationAnchorClick,
  FACE_NAVIGATION_CLASSIFIER_SOURCE,
} from './spa.js';
import type { ClassifyFaceNavigationAnchorClickOptions } from './spa.js';

export const NAVIGATION_PENDING_CLASSIFIER_SOURCE = FACE_NAVIGATION_CLASSIFIER_SOURCE;
export const NAVIGATION_PENDING_ATTRIBUTE = 'data-facetheory-navigation-pending';
export const NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE =
  'data-facetheory-reduced-motion';
export const DEFAULT_NAVIGATION_PENDING_INDICATOR_ID =
  'facetheory-navigation-pending';
export const DEFAULT_NAVIGATION_PENDING_TEXT = 'Loading…';

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
  element: Element;
  textContent?: string | null;
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
  const indicatorId = options.indicatorId ?? DEFAULT_NAVIGATION_PENDING_INDICATOR_ID;
  const indicatorText = options.indicatorText ?? DEFAULT_NAVIGATION_PENDING_TEXT;

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
    targets: ReadonlyArray<{ element: Element; role: 'link' | 'form' | 'submitter' }>,
  ): void => {
    if (stopped) return;
    clearPending();

    for (const target of targets) {
      markPendingElement(target.element, target.role, classNames, pendingElements);
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
    const navigation = classifyFaceNavigationAnchorClick(event, classifyOptions());
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
  const existing = options.doc.getElementById(options.id);
  const element = existing ?? options.doc.createElement('div');
  const snapshot = snapshotElement(element, [
    'role',
    'aria-live',
    'aria-atomic',
    'class',
    NAVIGATION_PENDING_ATTRIBUTE,
    NAVIGATION_PENDING_REDUCED_MOTION_ATTRIBUTE,
  ]);

  if (!existing) {
    element.id = options.id;
  }
  element.textContent = options.text;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  element.setAttribute(NAVIGATION_PENDING_ATTRIBUTE, options.source);
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
): ElementSnapshot {
  const attributes = new Map<string, string | null>();
  for (const name of attributeNames) {
    attributes.set(name, element.getAttribute(name));
  }
  return {
    attributes,
    element,
    textContent: element.textContent,
  };
}

function restoreElementSnapshot(snapshot: ElementSnapshot): void {
  for (const [name, value] of snapshot.attributes) {
    if (value === null) {
      snapshot.element.removeAttribute(name);
    } else {
      snapshot.element.setAttribute(name, value);
    }
  }

  if (snapshot.textContent !== undefined) {
    snapshot.element.textContent = snapshot.textContent;
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

function isElement(value: EventTarget | null): value is Element {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { tagName?: unknown }).tagName === 'string' &&
    typeof (value as { setAttribute?: unknown }).setAttribute === 'function' &&
    typeof (value as { classList?: unknown }).classList === 'object'
  );
}

function isElementWithTag(value: EventTarget | null, tagName: string): value is Element {
  return isElement(value) && value.tagName.toLowerCase() === tagName;
}
