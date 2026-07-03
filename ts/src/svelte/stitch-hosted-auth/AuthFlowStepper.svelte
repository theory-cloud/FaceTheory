<script lang="ts">
  import { resolveAuthFlowStepState } from '../../stitch-hosted-auth/index.js';
  import type { AuthFlowStep } from '../../stitch-hosted-auth/index.js';

  export let steps: AuthFlowStep[] = [];
  export let currentIndex: number;

  function stepAriaCurrent(index: number): 'step' | undefined {
    return resolveAuthFlowStepState(index, currentIndex).ariaCurrent;
  }

  function stepDotColor(index: number): string {
    return resolveAuthFlowStepState(index, currentIndex).dotColor;
  }

  function stepLabelColor(index: number): string {
    return resolveAuthFlowStepState(index, currentIndex).labelColor;
  }

  function stepLabelWeight(index: number): 400 | 600 {
    return resolveAuthFlowStepState(index, currentIndex).labelFontWeight;
  }
</script>

<ol
  class="facetheory-stitch-auth-flow-stepper"
  style="display:flex;align-items:center;gap:12px;margin:0;padding:0;list-style:none;"
>
  {#each steps as step, index (step.key)}
    <li
      aria-current={stepAriaCurrent(index)}
      style="display:flex;align-items:center;gap:8px;"
    >
      <span
        aria-hidden="true"
        style={`width:10px;height:10px;border-radius:9999px;display:inline-block;background:${stepDotColor(index)};`}
      />
      <span
        style={`font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${stepLabelColor(index)};font-weight:${stepLabelWeight(index)};`}
      >
        {step.label}
      </span>
    </li>
  {/each}
</ol>
