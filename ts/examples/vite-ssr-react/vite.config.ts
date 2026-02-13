import path from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => {
  const root = path.resolve(__dirname);
  const ssr = Boolean(isSsrBuild);

  return {
    root,
    appType: 'custom',
    build: {
      outDir: ssr ? 'dist/server' : 'dist/client',
      emptyOutDir: false,
      assetsInlineLimit: 0,
      manifest: !ssr,
      ssr: ssr ? path.resolve(root, 'src/entry-server.tsx') : undefined,
      rollupOptions: {
        input: ssr
          ? path.resolve(root, 'src/entry-server.tsx')
          : path.resolve(root, 'src/entry-client.tsx'),
        output: ssr
          ? {
              entryFileNames: '[name].js',
              chunkFileNames: 'chunks/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash][extname]',
            }
          : {
              manualChunks: (id) => (id.endsWith('src/chunk.ts') ? 'chunk' : undefined),
            },
      },
    },
  };
});
