import path from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => {
  const root = path.resolve(__dirname);
  const ssr = Boolean(isSsrBuild);
  const entry = path.resolve(
    root,
    ssr ? 'src/entry-server.ts' : 'src/entry-client.ts',
  );

  return {
    root,
    appType: 'custom',
    plugins: [svelte()],
    resolve: {
      alias: {
        '@theory-cloud/facetheory-svelte-library-example': path.resolve(
          root,
          '../svelte-component-library',
        ),
      },
    },
    build: {
      outDir: ssr ? 'dist/server' : 'dist/client',
      emptyOutDir: false,
      assetsInlineLimit: 0,
      manifest: !ssr,
      ...(ssr ? { ssr: entry } : {}),
      rollupOptions: {
        input: entry,
        ...(ssr
          ? {
              output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
              },
            }
          : {}),
      },
    },
  };
});
