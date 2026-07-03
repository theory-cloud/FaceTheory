import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildSsgSite,
  SsgBuildFailedError,
  type BuildSsgSiteOptions,
  type SsgTrailingSlashPolicy,
} from './ssg.js';
import type { FaceModule } from './types.js';

interface SsgCliConfigModule {
  faces?: FaceModule[];
  ssgOptions?: Omit<BuildSsgSiteOptions, 'faces' | 'outDir'>;
  default?: {
    faces?: FaceModule[];
    ssgOptions?: Omit<BuildSsgSiteOptions, 'faces' | 'outDir'>;
  };
}

interface ParsedSsgCliArgs {
  showHelp?: boolean;
  entryPath: string;
  outDir: string;
  trailingSlash?: SsgTrailingSlashPolicy;
  concurrency?: number;
  allowNetwork: boolean;
  emitHydrationData: boolean;
}

export async function runSsgCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseSsgCliArgs(argv);
  if (args.showHelp) return 0;
  const config = await loadSsgConfigModule(args.entryPath);

  const moduleOptions = config.ssgOptions ?? config.default?.ssgOptions ?? {};
  const faces = resolveFaces(config);

  const trailingSlash = args.trailingSlash ?? moduleOptions.trailingSlash;
  const concurrency = args.concurrency ?? moduleOptions.concurrency;
  const allowNetwork = args.allowNetwork || (moduleOptions.allowNetwork ?? false);
  const emitHydrationData = args.emitHydrationData || (moduleOptions.emitHydrationData ?? false);

  const buildOptions: BuildSsgSiteOptions = {
    ...moduleOptions,
    faces,
    outDir: path.resolve(args.outDir),
    allowNetwork,
    emitHydrationData,
    ...(trailingSlash !== undefined ? { trailingSlash } : {}),
    ...(concurrency !== undefined ? { concurrency } : {}),
  };

  let buildResult: Awaited<ReturnType<typeof buildSsgSite>>;
  try {
    buildResult = await buildSsgSite(buildOptions);
  } catch (error) {
    if (error instanceof SsgBuildFailedError) {
      printSsgBuildFailure(error);
      return 1;
    }
    throw error;
  }

  console.log(
    `SSG complete: ${buildResult.pages.length} page(s) written to ${buildResult.outDir} (manifest: ${buildResult.manifestFile})`,
  );
  return 0;
}

function parseSsgCliArgs(argv: string[]): ParsedSsgCliArgs {
  let entryPath = '';
  let outDir = '';
  let trailingSlash: SsgTrailingSlashPolicy | undefined;
  let concurrency: number | undefined;
  let allowNetwork = false;
  let emitHydrationData = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--entry') {
      const value = argv[i + 1];
      if (!value) throw new Error('missing value for --entry');
      entryPath = value;
      i += 1;
      continue;
    }
    if (arg === '--out') {
      const value = argv[i + 1];
      if (!value) throw new Error('missing value for --out');
      outDir = value;
      i += 1;
      continue;
    }
    if (arg === '--trailing-slash') {
      const value = argv[i + 1];
      if (value !== 'always' && value !== 'never') {
        throw new Error('invalid value for --trailing-slash (expected "always" or "never")');
      }
      trailingSlash = value;
      i += 1;
      continue;
    }
    if (arg === '--concurrency') {
      const value = argv[i + 1];
      if (!value) throw new Error('missing value for --concurrency');
      concurrency = parseConcurrency(value);
      i += 1;
      continue;
    }
    if (arg === '--allow-network') {
      allowNetwork = true;
      continue;
    }
    if (arg === '--emit-hydration-data') {
      emitHydrationData = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      return {
        showHelp: true,
        entryPath: '',
        outDir: '',
        allowNetwork,
        emitHydrationData,
        ...(trailingSlash !== undefined ? { trailingSlash } : {}),
        ...(concurrency !== undefined ? { concurrency } : {}),
      };
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  if (!entryPath || !outDir) {
    printUsage();
    throw new Error('both --entry and --out are required');
  }

  return {
    entryPath,
    outDir,
    ...(trailingSlash !== undefined ? { trailingSlash } : {}),
    ...(concurrency !== undefined ? { concurrency } : {}),
    allowNetwork,
    emitHydrationData,
  };
}

function parseConcurrency(value: string): number {
  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('invalid value for --concurrency (expected a positive integer)');
  }
  return concurrency;
}

async function loadSsgConfigModule(entryPath: string): Promise<SsgCliConfigModule> {
  const absolutePath = path.resolve(entryPath);
  const moduleUrl = pathToFileURL(absolutePath).href;
  const mod = (await import(moduleUrl)) as SsgCliConfigModule;
  return mod;
}

function resolveFaces(config: SsgCliConfigModule): FaceModule[] {
  const faces = config.faces ?? config.default?.faces;
  if (!faces || !Array.isArray(faces)) {
    throw new Error('SSG entry module must export `faces` (FaceModule[])');
  }
  return faces;
}

function printUsage(): void {
  console.log(
    [
      'Usage: tsx src/ssg-cli.ts --entry <module> --out <dir> [options]',
      '',
      'Options:',
      '  --trailing-slash <always|never>   HTML output style (default: always)',
      '  --concurrency <count>             Render routes with bounded concurrency (default: 1)',
      '  --emit-hydration-data             Write hydration JSON files when present',
      '  --allow-network                   Allow real fetch() calls during SSG',
    ].join('\n'),
  );
}

function printSsgBuildFailure(error: SsgBuildFailedError): void {
  console.error(
    `SSG failed: ${error.failedRoutes.length} route(s) failed; ${error.result.pages.length} page(s) written to ${error.result.outDir}`,
  );
  for (const failedRoute of error.failedRoutes) {
    const status =
      failedRoute.status === undefined ? '' : ` [status ${failedRoute.status}]`;
    console.error(
      `- ${failedRoute.path} (${failedRoute.routePattern})${status}: ${failedRoute.message}`,
    );
  }
}

function isDirectExecution(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return import.meta.url === pathToFileURL(path.resolve(argv1)).href;
}

if (isDirectExecution()) {
  runSsgCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
