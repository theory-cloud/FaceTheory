<script lang="ts">
  export let page: string;
  export let message: string;
  export let detail: string;
  export let logoUrl: string;

  const navItems = [
    { href: '/', label: 'Home', page: 'home' },
    { href: '/next', label: 'Next', page: 'next' },
  ];
</script>

<main class="strict-csp-shell" data-facetheory-view data-page={page}>
  <section class="strict-csp-card" aria-labelledby="strict-csp-title">
    <img class="strict-csp-logo" src={logoUrl} alt="FaceTheory strict CSP" />
    <p class="strict-csp-eyebrow">FaceTheory strict CSP</p>
    <h1 id="strict-csp-title" class="strict-csp-title">Svelte + Vite without inline output</h1>
    <p class="strict-csp-copy">Hello {message}</p>
    <p class="strict-csp-copy">{detail}</p>
    <nav class="strict-csp-nav" aria-label="Strict CSP example pages">
      {#each navItems as item}
        <a
          class="strict-csp-link"
          href={item.href}
          aria-current={item.page === page ? 'page' : undefined}
        >{item.label}</a>
      {/each}
    </nav>
  </section>
</main>
