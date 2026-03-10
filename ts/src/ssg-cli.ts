import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildSsgSite, type BuildSsgSiteOptions, type SsgTrailingSlashPolicy } from './ssg.js';
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
  const allowNetwork = args.allowNetwork || (moduleOptions.allowNetwork ?? false);
  const emitHydrationData = args.emitHydrationData || (moduleOptions.emitHydrationData ?? false);

  const buildOptions: BuildSsgSiteOptions = {
    ...moduleOptions,
    faces,
    outDir: path.resolve(args.outDir),
    allowNetwork,
    emitHydrationData,
    ...(trailingSlash !== undefined ? { trailingSlash } : {}),
  };

  const buildResult = await buildSsgSite(buildOptions);

  console.log(
    `SSG complete: ${buildResult.pages.length} page(s) written to ${buildResult.outDir} (manifest: ${buildResult.manifestFile})`,
  );
  return 0;
}

function parseSsgCliArgs(argv: string[]): ParsedSsgCliArgs {
  let entryPath = '';
  let outDir = '';
  let trailingSlash: SsgTrailingSlashPolicy | undefined;
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
    allowNetwork,
    emitHydrationData,
  };
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
      '  --emit-hydration-data             Write hydration JSON files when present',
      '  --allow-network                   Allow real fetch() calls during SSG',
    ].join('\n'),
  );
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
