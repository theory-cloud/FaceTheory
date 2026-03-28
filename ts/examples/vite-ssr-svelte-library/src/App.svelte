<script lang="ts">
  import { LibraryPanel } from '@theory-cloud/facetheory-svelte-library-example';

  export let title: string;
  export let intro: string;
  export let initialCount: number;
</script>

<svelte:head>
  <meta content="external-svelte-library" name="example" />
</svelte:head>

<main class="library-host">
  <p class="library-host__eyebrow">FaceTheory Svelte Library Host</p>
  <LibraryPanel {initialCount} {title}>
    <p class="library-host__intro">{intro}</p>
  </LibraryPanel>
</main>
