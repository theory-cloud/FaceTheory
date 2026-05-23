import type { FaceCspPolicy, FaceHeadTag, FaceRenderResult } from './types.js';

export interface AdapterStrictCspValidationOptions {
  adapterName: string;
  /**
   * Some Face-level render modes externalize legacy/inline hydration after the
   * adapter returns, before final head emission. Keep all other strict-CSP
   * adapter checks active, but let those runtime sidecar paths validate the
   * final external hydration shape after conversion.
   */
  deferHydrationValidation?: boolean;
}

export function enforceAdapterStrictCspResult(
  out: FaceRenderResult,
  options: AdapterStrictCspValidationOptions,
): void {
  const policy = out.csp;
  if (!policy) return;

  const adapterName = normalizeAdapterName(options.adapterName);

  if (policy.inlineScripts === false) {
    if (
      out.hydration &&
      out.hydration.type !== 'external' &&
      options.deferHydrationValidation !== true
    ) {
      throw new Error(
        `FaceTheory ${adapterName} strict CSP requires external hydration data`,
      );
    }

    for (const tag of out.headTags ?? []) {
      assertNoInlineScriptHeadTag(adapterName, tag);
    }
  }

  if (policy.inlineStyles === false) {
    if ((out.styleTags ?? []).some((tag) => String(tag.cssText ?? '').trim())) {
      throw new Error(
        `FaceTheory ${adapterName} strict CSP rejects inline adapter style output`,
      );
    }

    for (const tag of out.headTags ?? []) {
      assertNoInlineStyleHeadTag(adapterName, tag);
    }
  }

  if (
    policy.rawHead === false ||
    policy.inlineScripts === false ||
    policy.inlineStyles === false
  ) {
    if (out.headTags?.some((tag) => tag.type === 'raw')) {
      throw new Error(
        `FaceTheory ${adapterName} strict CSP rejects raw adapter head output`,
      );
    }
  }
}

export function enforceReactStrictCspStreamingOptions(options: {
  adapterName: string;
  policy?: FaceCspPolicy | undefined;
  styleStrategy: 'all-ready' | 'shell';
}): void {
  if (options.policy?.inlineScripts !== false) return;
  if (options.styleStrategy !== 'shell') return;

  const adapterName = normalizeAdapterName(options.adapterName);
  throw new Error(
    `FaceTheory ${adapterName} strict CSP streaming requires styleStrategy "all-ready"`,
  );
}

function normalizeAdapterName(adapterName: string): string {
  return String(adapterName ?? '').trim() || 'adapter';
}

function assertNoInlineScriptHeadTag(
  adapterName: string,
  tag: FaceHeadTag,
): void {
  if (tag.type === 'script' && tag.body !== undefined) {
    throw new Error(
      `FaceTheory ${adapterName} strict CSP rejects inline adapter script output`,
    );
  }

  const attrs = attrsForTag(tag);
  if (!attrs) return;
  for (const name of Object.keys(attrs)) {
    if (/^on[a-z]/i.test(name.trim())) {
      throw new Error(
        `FaceTheory ${adapterName} strict CSP rejects inline adapter event handlers`,
      );
    }
  }
}

function assertNoInlineStyleHeadTag(
  adapterName: string,
  tag: FaceHeadTag,
): void {
  if (tag.type === 'style' && String(tag.cssText ?? '').trim()) {
    throw new Error(
      `FaceTheory ${adapterName} strict CSP rejects inline adapter style output`,
    );
  }

  const attrs = attrsForTag(tag);
  if (!attrs) return;
  for (const name of Object.keys(attrs)) {
    if (name.trim().toLowerCase() === 'style') {
      throw new Error(
        `FaceTheory ${adapterName} strict CSP rejects inline adapter style attributes`,
      );
    }
  }
}

function attrsForTag(tag: FaceHeadTag) {
  switch (tag.type) {
    case 'meta':
    case 'link':
    case 'script':
      return tag.attrs;
    case 'style':
      return tag.attrs;
    case 'title':
    case 'raw':
      return undefined;
  }
}
