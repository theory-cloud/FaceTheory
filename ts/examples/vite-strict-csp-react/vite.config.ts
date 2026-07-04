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
    // Vite/Rollup cannot follow the package exports self-reference while
    // bundling, so alias the published subpaths to the built dist entrypoints.
    resolve: {
      alias: [
        {
          find: /^@theory-cloud\/facetheory\/react$/,
          replacement: path.resolve(root, '../../dist/react/index.js'),
        },
        {
          find: /^@theory-cloud\/facetheory\/client$/,
          replacement: path.resolve(root, '../../dist/client/index.js'),
        },
        {
          find: /^@theory-cloud\/facetheory\/spa$/,
          replacement: path.resolve(root, '../../dist/spa.js'),
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
        ...(!ssr ? { preserveEntrySignatures: 'exports-only' as const } : {}),
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
