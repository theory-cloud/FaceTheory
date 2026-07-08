// FaceTheory requires Svelte >=5.55.7. `Component` is Svelte 5's component type
// (runes components compile to this shape); there is no Svelte 4
// `SvelteComponentTyped` fallback.
declare module '*.svelte' {
  import type { Component } from 'svelte';

  const component: Component<Record<string, unknown>>;
  export default component;
}
