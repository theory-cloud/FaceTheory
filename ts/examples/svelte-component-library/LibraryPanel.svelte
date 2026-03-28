<script lang="ts">
  import badgeUrl from './badge.svg';

  export let title: string;
  export let initialCount = 0;

  let clicks = initialCount;
</script>

<article class="library-panel" data-library-panel>
  <img
    alt="External package badge"
    class="library-panel__badge"
    height="52"
    src={badgeUrl}
    width="52"
  />

  <div class="library-panel__content">
    <p class="library-panel__eyebrow">External Svelte Package</p>
    <h2 class="library-panel__title">{title}</h2>
    <button
      class="library-panel__button"
      data-library-button
      on:click={() => {
        clicks += 1;
      }}
      type="button"
    >
      Library clicks {clicks}
    </button>
    <div class="library-panel__slot">
      <slot />
    </div>
  </div>
</article>
