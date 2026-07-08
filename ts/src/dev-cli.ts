#!/usr/bin/env node
import path from 'node:path';

import {
  startViteMiddlewareDevServer,
  type ViteMiddlewareFaceAppContext,
} from './dev.js';
import type { FaceApp } from './app.js';

interface DevCliArgs {
  root?: string;
  entry?: string;
  factory?: string;
  port?: number;
  host?: string;
  help: boolean;
}

function readOptionValue(argv: string[], index: number, name: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for --${name}`);
  }
  return value;
}

function parseArgs(argv: string[]): DevCliArgs {
  const parsed: DevCliArgs = { help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    const [inlineName, inlineValue] = arg.startsWith('--') ? arg.slice(2).split('=', 2) : ['', undefined];
    const name = inlineName === 'export' ? 'factory' : inlineName;

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (name === 'root' || name === 'entry' || name === 'factory' || name === 'host') {
      const value = inlineValue ?? readOptionValue(argv, index, name);
      if (inlineValue === undefined) index += 1;
      parsed[name] = value;
      continue;
    }

    if (name === 'port') {
      const value = inlineValue ?? readOptionValue(argv, index, name);
      if (inlineValue === undefined) index += 1;
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`Invalid --port value: ${value}`);
      }
      parsed.port = port;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`FaceTheory Vite middleware dev server

Usage:
  facetheory-dev --entry src/entry-server.tsx --factory createViteDevApp [--root .] [--port 5173] [--host localhost]

The server entry is loaded through vite.ssrLoadModule() on each SSR request.
The named factory export must return a FaceApp.
`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFaceApp(value: unknown): value is FaceApp {
  return isRecord(value) && typeof value.handle === 'function';
}

type FaceAppFactoryExport = (
  context: ViteMiddlewareFaceAppContext,
) => FaceApp | Promise<FaceApp>;

function factoryFromModule(
  module: unknown,
  factoryName: string,
): FaceAppFactoryExport {
  if (!isRecord(module)) {
    throw new Error('Vite SSR module did not evaluate to an object');
  }

  const factory = module[factoryName];
  if (typeof factory !== 'function') {
    throw new Error(`Vite SSR module missing FaceApp factory export "${factoryName}"`);
  }

  return async (context: ViteMiddlewareFaceAppContext): Promise<FaceApp> => {
    const app = await factory(context);
    if (!isFaceApp(app)) {
      throw new Error(`FaceApp factory export "${factoryName}" did not return a FaceApp`);
    }
    return app;
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const root = path.resolve(args.root ?? process.cwd());
  const entry = args.entry ?? 'src/entry-server.tsx';
  const factoryName = args.factory ?? 'createViteDevApp';

  const devServer = await startViteMiddlewareDevServer(
    {
      root,
      entry,
      createApp: async (context) => {
        const factory = factoryFromModule(context.module, factoryName);
        return factory(context);
      },
    },
    {
      port: args.port ?? 5173,
      ...(args.host !== undefined ? { host: args.host } : {}),
    },
  );

  console.log(`FaceTheory Vite dev server listening on ${devServer.url}`);

  const shutdown = async () => {
    await devServer.close();
  };

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
