<script lang="ts">
  export let message: string;
</script>

<main class="svelte-inline svelte-app">
  <h1>Svelte SSR Example</h1>
  <p>Hello {message}</p>
</main>

<style>
  .svelte-app {
    font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    padding: 12px;
  }
</style>
