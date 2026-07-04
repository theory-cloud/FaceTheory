#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Writable } from 'node:stream';

import {
  renderCreateTemplate,
  type CreateAdapter,
  type CreateTemplateContext,
} from './create-templates/index.js';

interface PackageManifest {
  version: string;
  engines?: {
    node?: string;
  };
  devDependencies?: Record<string, string>;
}

interface CreateCliOptions {
  cwd?: string;
  packageJsonPath?: string;
  stderr?: Writable;
  stdout?: Writable;
}

interface ParsedCreateArgs {
  adapter: CreateAdapter;
  target: string;
}

const SUPPORTED_ADAPTERS: ReadonlySet<string> = new Set([
  'react',
  'vue',
  'svelte',
]);

const USAGE = `Usage: facetheory create <directory> [--adapter react|vue|svelte]

Create a FaceTheory starter with a real framework hydrate entry and an AppTheorySsrSite CDK stack.

Options:
  --adapter <name>  Starter adapter: react (default), vue, or svelte
  -h, --help        Show this help
`;

function write(stream: Writable, message: string): void {
  stream.write(message);
}

function writeLine(stream: Writable, message: string): void {
  write(stream, `${message}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate === 'string') out[key] = candidate;
  }
  return out;
}

async function readPackageManifest(packageJsonPath: string): Promise<PackageManifest> {
  const parsed = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;
  if (!isRecord(parsed) || typeof parsed.version !== 'string') {
    throw new Error(`FaceTheory package manifest is invalid: ${packageJsonPath}`);
  }

  const engines = isRecord(parsed.engines) ? parsed.engines : {};
  const nodeEngine = engines.node;
  return {
    version: parsed.version,
    ...(typeof nodeEngine === 'string' ? { engines: { node: nodeEngine } } : {}),
    devDependencies: stringRecord(parsed.devDependencies),
  };
}

function packageRootPackageJsonPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
}

function parseCreateArgs(rawArgs: readonly string[]): ParsedCreateArgs {
  const args = [...rawArgs];
  if (args[0] === 'create') args.shift();

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    throw new Error(USAGE);
  }

  let adapter: CreateAdapter = 'react';
  let target: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === '--adapter') {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error('facetheory create requires a value after --adapter');
      }
      adapter = parseAdapter(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('--adapter=')) {
      adapter = parseAdapter(arg.slice('--adapter='.length));
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`facetheory create received unknown option: ${arg}`);
    }

    if (target !== null) {
      throw new Error(`facetheory create received multiple target directories: ${target}, ${arg}`);
    }
    target = arg;
  }

  if (target === null) {
    throw new Error('facetheory create requires a target directory');
  }

  return { adapter, target };
}

function parseAdapter(value: string): CreateAdapter {
  const normalized = value.trim().toLowerCase();
  if (!SUPPORTED_ADAPTERS.has(normalized)) {
    throw new Error(
      `unsupported FaceTheory adapter "${value}"; expected react, vue, or svelte`,
    );
  }
  return normalized as CreateAdapter;
}

function packageNameFromTarget(targetDir: string): string {
  const baseName = path.basename(targetDir).trim().toLowerCase();
  const normalized = baseName
    .replace(/^@/, '')
    .replaceAll(/[^a-z0-9._-]+/g, '-')
    .replaceAll(/^[._-]+|[._-]+$/g, '')
    .slice(0, 214);
  return normalized || 'facetheory-starter';
}

function appNameFromTarget(targetDir: string): string {
  const baseName = path.basename(targetDir).trim();
  return baseName || 'FaceTheory Starter';
}

function faceTheoryTarball(version: string): string {
  return `https://github.com/theory-cloud/FaceTheory/releases/download/v${version}/theory-cloud-facetheory-${version}.tgz`;
}

function theoryReleaseVersion(packageUrl: string, packageSlug: string): string {
  const escapedSlug = packageSlug.replaceAll('-', '\\-');
  const match = packageUrl.match(new RegExp(`${escapedSlug}-(\\d+\\.\\d+\\.\\d+(?:[-+][^/]+)?)\\.tgz$`));
  if (!match?.[1]) {
    throw new Error(`could not infer ${packageSlug} release version from ${packageUrl}`);
  }
  return match[1];
}

function appTheoryCdkTarball(appTheoryTarball: string): string {
  const version = theoryReleaseVersion(appTheoryTarball, 'theory-cloud-apptheory');
  return `https://github.com/theory-cloud/AppTheory/releases/download/v${version}/theory-cloud-apptheory-cdk-${version}.tgz`;
}

function requiredDependency(
  manifest: PackageManifest,
  name: string,
  packageJsonPath: string,
): string {
  const value = manifest.devDependencies?.[name];
  if (!value) {
    throw new Error(`FaceTheory package manifest ${packageJsonPath} is missing ${name}`);
  }
  return value;
}

async function assertTargetIsWritable(targetDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(targetDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  if (entries.length > 0) {
    throw new Error(
      `target directory is not empty: ${targetDir}\nFix: choose a new directory or empty it before running facetheory create.`,
    );
  }
}

async function writeTemplateFiles(
  targetDir: string,
  files: ReturnType<typeof renderCreateTemplate>,
): Promise<void> {
  for (const file of files) {
    const destination = path.resolve(targetDir, file.path);
    if (!destination.startsWith(`${targetDir}${path.sep}`) && destination !== targetDir) {
      throw new Error(`template path escaped target directory: ${file.path}`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content, { flag: 'wx' });
  }
}

async function createContext(
  adapter: CreateAdapter,
  targetDir: string,
  packageJsonPath: string,
): Promise<CreateTemplateContext> {
  const manifest = await readPackageManifest(packageJsonPath);
  const appTheoryTarball = requiredDependency(
    manifest,
    '@theory-cloud/apptheory',
    packageJsonPath,
  );
  const tableTheoryTarball = requiredDependency(
    manifest,
    '@theory-cloud/tabletheory-ts',
    packageJsonPath,
  );
  return {
    adapter,
    appName: appNameFromTarget(targetDir),
    packageName: packageNameFromTarget(targetDir),
    nodeEngine: manifest.engines?.node ?? '>=24',
    facetheoryTarball: faceTheoryTarball(manifest.version),
    appTheoryTarball,
    appTheoryCdkTarball: appTheoryCdkTarball(appTheoryTarball),
    tableTheoryTarball,
    dependencyVersions: manifest.devDependencies ?? {},
  };
}

export async function runCreateCli(
  args: readonly string[],
  options: CreateCliOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  let parsed: ParsedCreateArgs;
  try {
    parsed = parseCreateArgs(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === USAGE) {
      write(stdout, USAGE);
      return 0;
    }
    writeLine(stderr, message);
    writeLine(stderr, 'Run `facetheory create --help` for usage.');
    return 1;
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const targetDir = path.resolve(cwd, parsed.target);
  const packageJsonPath = options.packageJsonPath ?? packageRootPackageJsonPath();

  try {
    await assertTargetIsWritable(targetDir);
    const context = await createContext(parsed.adapter, targetDir, packageJsonPath);
    const files = renderCreateTemplate(context);
    await mkdir(targetDir, { recursive: true });
    await writeTemplateFiles(targetDir, files);
    writeLine(stdout, `Created FaceTheory ${parsed.adapter} starter at ${targetDir}`);
    writeLine(stdout, 'Next steps:');
    writeLine(stdout, `  cd ${path.relative(cwd, targetDir) || '.'}`);
    writeLine(stdout, '  npm install');
    writeLine(stdout, '  npm run check');
    return 0;
  } catch (error) {
    writeLine(stderr, error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function isDirectCli(metaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  return fileURLToPath(metaUrl) === path.resolve(argv1);
}

if (isDirectCli(import.meta.url, process.argv[1])) {
  process.exitCode = await runCreateCli(process.argv.slice(2));
}
