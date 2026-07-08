import path from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => {
  const root = path.resolve(__dirname);
  const ssr = Boolean(isSsrBuild);
  const entry = path.resolve(
    root,
    ssr ? 'src/entry-server.tsx' : 'src/entry-client.tsx',
  );

  return {
    root,
    appType: 'custom',
    resolve: {
      alias: [
        {
          find: /^@theory-cloud\/facetheory\/react$/,
          replacement: path.resolve(root, '../../dist/react/index.js'),
        },
        {
          find: /^@theory-cloud\/facetheory$/,
          replacement: path.resolve(root, '../../dist/index.js'),
        },
      ],
    },
    build: {
      outDir: ssr ? 'dist/server' : 'dist/client',
      emptyOutDir: false,
      assetsInlineLimit: 0,
      manifest: !ssr,
      ...(ssr ? { ssr: entry } : {}),
      rollupOptions: {
        input: entry,
        output: ssr
          ? {
              entryFileNames: '[name].js',
              chunkFileNames: 'chunks/[name]-[hash].js',
              assetFileNames: 'assets/[name]-[hash][extname]',
            }
          : {
              manualChunks: (id) =>
                id.endsWith('src/chunk.ts') ? 'chunk' : undefined,
            },
      },
    },
  };
});
