<script lang="ts">
  export interface AuthFlowStep {
    key: string;
    label: string;
    description?: unknown;
  }

  export let steps: AuthFlowStep[] = [];
  export let currentIndex: number;
</script>

<ol
  class="facetheory-stitch-auth-flow-stepper"
  style="display:flex;align-items:center;gap:12px;margin:0;padding:0;list-style:none;"
>
  {#each steps as step, index (step.key)}
    <li
      aria-current={index === currentIndex ? 'step' : undefined}
      style="display:flex;align-items:center;gap:8px;"
    >
      <span
        aria-hidden="true"
        style={`width:10px;height:10px;border-radius:9999px;display:inline-block;background:${
          index < currentIndex || index === currentIndex
            ? 'var(--stitch-color-primary, #1f108e)'
            : 'var(--stitch-color-surface-container-high, #e2e7ff)'
        };`}
      />
      <span
        style={`font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${
          index === currentIndex
            ? 'var(--stitch-color-on-surface, #131b2e)'
            : 'var(--stitch-color-on-surface-variant, #464553)'
        };font-weight:${index === currentIndex ? 600 : 400};`}
      >
        {step.label}
      </span>
    </li>
  {/each}
</ol>
