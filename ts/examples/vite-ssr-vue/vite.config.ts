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
      ssr: ssr ? path.resolve(root, 'src/entry-server.ts') : undefined,
      rollupOptions: {
        input: ssr
          ? path.resolve(root, 'src/entry-server.ts')
          : path.resolve(root, 'src/entry-client.ts'),
        output: ssr
          ? {
              entryFileNames: '[name].js',
              chunkFileNames: 'chunks/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash][extname]',
            }
          : undefined,
      },
    },
  };
});
