<script lang="ts">
  import type { Snippet } from 'svelte';
  import type {
    OperatorEmptyStateConfig,
    OperatorGuardStatus,
    OperatorPlaceholderDataPolicy,
  } from './types.js';

  let {
    guard,
    authorized = undefined,
    unauthorized = undefined,
    loading = undefined,
    error = undefined,
    placeholderDataPolicy = 'no-production-like-data',
    children,
  }: {
    guard: OperatorGuardStatus;
    authorized?: unknown;
    unauthorized?: unknown;
    loading?: unknown;
    error?: unknown;
    placeholderDataPolicy?: OperatorPlaceholderDataPolicy;
    children?: Snippet;
  } = $props();

  const fallbackConfig = $derived(
    guardToEmptyStateConfig(guard, placeholderDataPolicy),
  );
  function guardToEmptyStateConfig(
    status: OperatorGuardStatus,
    policy: OperatorPlaceholderDataPolicy,
  ): OperatorEmptyStateConfig {
    if (status.state === 'loading') {
      return {
        intent: 'loading',
        title: 'Checking operator access',
        description: appendGuardContext(
          'Operator access is being verified before this dashboard renders.',
          status,
        ),
        placeholderDataPolicy: policy,
      };
    }

    if (status.state === 'error') {
      return {
        intent: 'error',
        title: 'Operator access unavailable',
        description: appendGuardContext(
          status.reason ?? 'The operator access check could not be completed.',
          status,
        ),
        placeholderDataPolicy: policy,
      };
    }

    return {
      intent: 'not-authorized',
      title: 'Operator access required',
      description: appendGuardContext(
        status.reason ??
          'The signed-in principal is not authorized to view this operator surface.',
        status,
      ),
      placeholderDataPolicy: policy,
    };
  }

  function appendGuardContext(base: string, status: OperatorGuardStatus): string {
    const details: string[] = [];
    if (status.principalLabel !== undefined) {
      details.push(`Principal: ${status.principalLabel}`);
    }
    if (status.requestId !== undefined) {
      details.push(`Request: ${status.requestId}`);
    }
    if (details.length === 0) return base;
    return `${base} ${details.join(' · ')}.`;
  }
</script>

<section
  class={`facetheory-stitch-guarded-operator-shell facetheory-stitch-guarded-operator-shell-${guard.state}`}
  data-operator-guard-state={guard.state}
  style="display:flex;flex-direction:column;gap:16px;min-width:0;"
>
  {#if guard.state === 'authorized'}
    {#if children}{@render children()}{:else}{authorized}{/if}
  {:else if guard.state === 'unauthorized' && unauthorized !== undefined}
    {unauthorized}
  {:else if guard.state === 'loading' && loading !== undefined}
    {loading}
  {:else if guard.state === 'error' && error !== undefined}
    {error}
  {:else}
    <section
      class={`facetheory-stitch-operator-empty-state facetheory-stitch-operator-empty-state-${fallbackConfig.intent}`}
      data-empty-intent={fallbackConfig.intent}
      data-placeholder-policy={fallbackConfig.placeholderDataPolicy}
      role={fallbackConfig.intent === 'error' ? 'alert' : 'status'}
      style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:24px;border-radius:var(--stitch-radius-lg, 12px);background:var(--stitch-color-surface-container-low, #f2f3ff);color:var(--stitch-color-on-surface, #131b2e);"
    >
      <span
        class="facetheory-stitch-operator-empty-state-intent"
        style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:var(--stitch-color-on-surface-variant, #464553);"
      >
        {fallbackConfig.intent === 'not-authorized'
          ? 'Not authorized'
          : fallbackConfig.intent === 'loading'
            ? 'Loading'
            : 'Unavailable'}
      </span>
      <strong style="font-size:16px;">{fallbackConfig.title}</strong>
      {#if fallbackConfig.description !== undefined}
        <p
          style="margin:0;font-size:14px;line-height:1.5;color:var(--stitch-color-on-surface-variant, #464553);"
        >
          {fallbackConfig.description}
        </p>
      {/if}
    </section>
  {/if}
</section>
