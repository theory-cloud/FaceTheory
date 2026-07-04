#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

interface DoctorCliOptions {
  cwd?: string;
  nodeVersion?: string;
  packageJsonPath?: string;
  stderr?: Writable;
  stdout?: Writable;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: {
    node?: string;
  };
  optionalDependencies?: Record<string, string>;
  overrides?: unknown;
  peerDependencies?: Record<string, string>;
  version?: string;
}

interface Version {
  major: number;
  minor: number;
  patch: number;
}

interface DoctorCheck {
  fix?: string;
  message: string;
  ok: boolean;
}

interface PeerPackage {
  name: string;
  range: string;
}

const USAGE = `Usage: facetheory doctor

Check a local FaceTheory app install for the supported Node floor, adapter peers, and AppTheory/TableTheory override alignment.

Options:
  -h, --help  Show this help
`;

const ADAPTER_GROUPS: ReadonlyArray<{
  label: string;
  packages: readonly string[];
}> = [
  { label: 'React', packages: ['react', 'react-dom'] },
  { label: 'Vue', packages: ['vue', '@vue/server-renderer'] },
  { label: 'Svelte', packages: ['svelte'] },
];

const SVELTE_EXCLUSION_RATIONALE =
  'FaceTheory requires Svelte >=5.55.7; Svelte 4 and Svelte 5 through 5.55.6 are unsupported because they are not validated for deterministic Svelte SSR/hydration.';

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

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

async function readPackageManifest(filePath: string): Promise<PackageManifest> {
  const parsed = await readJsonFile(filePath);
  if (!isRecord(parsed)) {
    throw new Error(`package manifest is invalid: ${filePath}`);
  }
  const engines = isRecord(parsed.engines) ? parsed.engines : {};
  return {
    dependencies: stringRecord(parsed.dependencies),
    devDependencies: stringRecord(parsed.devDependencies),
    optionalDependencies: stringRecord(parsed.optionalDependencies),
    overrides: parsed.overrides,
    peerDependencies: stringRecord(parsed.peerDependencies),
    ...(typeof parsed.version === 'string' ? { version: parsed.version } : {}),
    ...(typeof engines.node === 'string' ? { engines: { node: engines.node } } : {}),
  };
}

function packageRootPackageJsonPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
}

function parseVersion(input: string): Version | null {
  const match = input.trim().match(/^(?:v)?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? '0'),
    patch: Number(match[3] ?? '0'),
  };
}

function compareVersions(left: Version, right: Version): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function satisfiesComparator(version: Version, comparator: string): boolean {
  const match = comparator.match(/^(>=|>|<=|<|=)?\s*v?(\d+(?:\.\d+){0,2})$/);
  if (!match) return false;
  const operator = match[1] ?? '=';
  const target = parseVersion(match[2] ?? '');
  if (!target) return false;
  const comparison = compareVersions(version, target);
  if (operator === '>=') return comparison >= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '<') return comparison < 0;
  return comparison === 0;
}

function satisfiesRange(versionText: string, range: string): boolean {
  const version = parseVersion(versionText);
  if (!version) return false;

  const alternatives = range.split('||').map((part) => part.trim()).filter(Boolean);
  return alternatives.some((alternative) => {
    const comparators = alternative.split(/\s+/).filter(Boolean);
    return comparators.every((comparator) => satisfiesComparator(version, comparator));
  });
}

function declaredDependencyVersion(
  manifest: PackageManifest,
  packageName: string,
): string | null {
  return (
    manifest.dependencies?.[packageName] ??
    manifest.devDependencies?.[packageName] ??
    manifest.optionalDependencies?.[packageName] ??
    manifest.peerDependencies?.[packageName] ??
    null
  );
}

async function installedPackageVersion(
  startDir: string,
  packageName: string,
): Promise<string | null> {
  let current = path.resolve(startDir);
  for (;;) {
    const candidate = path.resolve(current, 'node_modules', packageName, 'package.json');
    try {
      const manifest = await readPackageManifest(candidate);
      return manifest.version ?? null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function peerPackages(faceTheoryManifest: PackageManifest): PeerPackage[] {
  return Object.entries(faceTheoryManifest.peerDependencies ?? {}).map(
    ([name, range]) => ({ name, range }),
  );
}

function adapterInstallFix(adapterLabel: string): string {
  if (adapterLabel === 'React') return 'npm install react react-dom';
  if (adapterLabel === 'Vue') return 'npm install vue @vue/server-renderer';
  return 'npm install svelte@^5.55.7';
}

async function checkNodeFloor(
  faceTheoryManifest: PackageManifest,
  nodeVersion: string,
): Promise<DoctorCheck> {
  const range = faceTheoryManifest.engines?.node;
  if (!range) {
    return {
      ok: false,
      message: 'FaceTheory package manifest is missing engines.node',
      fix: 'Reinstall FaceTheory from an immutable GitHub Release tarball.',
    };
  }

  if (satisfiesRange(nodeVersion, range)) {
    return { ok: true, message: `Node.js ${nodeVersion} satisfies ${range}` };
  }

  return {
    ok: false,
    message: `Node.js ${nodeVersion} does not satisfy FaceTheory engines.node ${range}`,
    fix: `Install a Node.js version that satisfies ${range}, then rerun facetheory doctor.`,
  };
}

async function checkPeerVersions(
  cwd: string,
  projectManifest: PackageManifest,
  faceTheoryManifest: PackageManifest,
): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const peers = peerPackages(faceTheoryManifest);
  let completeAdapterGroup = false;

  for (const group of ADAPTER_GROUPS) {
    const presentPackages: string[] = [];
    const missingPackages: string[] = [];

    for (const packageName of group.packages) {
      const installedVersion = await installedPackageVersion(cwd, packageName);
      if (installedVersion === null) {
        missingPackages.push(packageName);
      } else {
        presentPackages.push(packageName);
      }
    }

    if (presentPackages.length === 0) continue;

    if (missingPackages.length > 0) {
      checks.push({
        ok: false,
        message: `${group.label} adapter peers are incomplete; missing ${missingPackages.join(', ')}`,
        fix: adapterInstallFix(group.label),
      });
      continue;
    }

    completeAdapterGroup = true;
    checks.push({ ok: true, message: `${group.label} adapter peers are installed` });
  }

  if (!completeAdapterGroup) {
    checks.push({
      ok: false,
      message: 'No complete FaceTheory adapter peer set is installed',
      fix: 'Install one peer set: `npm install react react-dom`, `npm install vue @vue/server-renderer`, or `npm install svelte@^5.55.7`.',
    });
  }

  for (const { name, range } of peers) {
    const installedVersion = await installedPackageVersion(cwd, name);
    if (installedVersion === null) continue;
    if (satisfiesRange(installedVersion, range)) {
      checks.push({ ok: true, message: `${name} ${installedVersion} satisfies ${range}` });
      continue;
    }

    const fix =
      name === 'svelte'
        ? `Install a supported Svelte version, for example: npm install svelte@^5.55.7. ${SVELTE_EXCLUSION_RATIONALE}`
        : `Install a version satisfying ${range}: npm install ${name}@"${range}"`;
    checks.push({
      ok: false,
      message: `${name} ${installedVersion} does not satisfy FaceTheory peer range ${range}`,
      fix,
    });
  }

  for (const group of ADAPTER_GROUPS) {
    for (const packageName of group.packages) {
      const declared = declaredDependencyVersion(projectManifest, packageName);
      const installed = await installedPackageVersion(cwd, packageName);
      if (declared !== null && installed === null) {
        checks.push({
          ok: false,
          message: `${packageName} is declared as ${declared} but is not installed`,
          fix: 'Run npm install in this project, then rerun facetheory doctor.',
        });
      }
    }
  }

  return checks;
}

function nestedOverrideValue(overrides: unknown): string | null {
  if (!isRecord(overrides)) return null;
  const appTheory = overrides['@theory-cloud/apptheory'];
  if (!isRecord(appTheory)) return null;
  const tableTheory = appTheory['@theory-cloud/tabletheory-ts'];
  return typeof tableTheory === 'string' ? tableTheory : null;
}

function checkOverrideAlignment(projectManifest: PackageManifest): DoctorCheck {
  const appTheory = declaredDependencyVersion(projectManifest, '@theory-cloud/apptheory');
  const tableTheory = declaredDependencyVersion(projectManifest, '@theory-cloud/tabletheory-ts');
  const override = nestedOverrideValue(projectManifest.overrides);

  if (!appTheory && !tableTheory && !override) {
    return {
      ok: true,
      message: 'AppTheory/TableTheory companion packages are not declared; override alignment is not required',
    };
  }

  if (!appTheory) {
    return {
      ok: false,
      message: 'TableTheory override is present without @theory-cloud/apptheory',
      fix: 'Add the pinned AppTheory GitHub Release tarball or remove the unused override block.',
    };
  }

  if (!tableTheory) {
    return {
      ok: false,
      message: '@theory-cloud/apptheory is declared without a pinned @theory-cloud/tabletheory-ts companion',
      fix: 'Add the pinned TableTheory GitHub Release tarball and mirror it under overrides["@theory-cloud/apptheory"].',
    };
  }

  if (override !== tableTheory) {
    return {
      ok: false,
      message: 'AppTheory/TableTheory override alignment is drifted',
      fix: `Set overrides["@theory-cloud/apptheory"]["@theory-cloud/tabletheory-ts"] to ${tableTheory}`,
    };
  }

  return {
    ok: true,
    message: 'AppTheory/TableTheory override aligns to the declared TableTheory tarball',
  };
}

async function runChecks(options: Required<Pick<DoctorCliOptions, 'cwd' | 'nodeVersion' | 'packageJsonPath'>>): Promise<DoctorCheck[]> {
  const projectPackageJsonPath = path.resolve(options.cwd, 'package.json');
  const [projectManifest, faceTheoryManifest] = await Promise.all([
    readPackageManifest(projectPackageJsonPath),
    readPackageManifest(options.packageJsonPath),
  ]);

  return [
    await checkNodeFloor(faceTheoryManifest, options.nodeVersion),
    ...(await checkPeerVersions(options.cwd, projectManifest, faceTheoryManifest)),
    checkOverrideAlignment(projectManifest),
  ];
}

function printChecks(stdout: Writable, checks: readonly DoctorCheck[]): void {
  for (const check of checks) {
    writeLine(stdout, `${check.ok ? '[ok]' : '[fail]'} ${check.message}`);
    if (!check.ok && check.fix) {
      writeLine(stdout, `  Fix: ${check.fix}`);
    }
  }
}

export async function runDoctorCli(
  args: readonly string[],
  options: DoctorCliOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (args.includes('--help') || args.includes('-h')) {
    write(stdout, USAGE);
    return 0;
  }

  if (args.length > 0) {
    writeLine(stderr, `facetheory doctor received unknown argument: ${args[0] ?? ''}`);
    writeLine(stderr, 'Run `facetheory doctor --help` for usage.');
    return 1;
  }

  try {
    const checks = await runChecks({
      cwd: path.resolve(options.cwd ?? process.cwd()),
      nodeVersion: options.nodeVersion ?? process.versions.node,
      packageJsonPath: options.packageJsonPath ?? packageRootPackageJsonPath(),
    });
    printChecks(stdout, checks);
    const failures = checks.filter((check) => !check.ok);
    if (failures.length === 0) {
      writeLine(stdout, 'FaceTheory doctor passed.');
      return 0;
    }
    writeLine(stdout, `FaceTheory doctor found ${failures.length} issue(s).`);
    return 1;
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
  process.exitCode = await runDoctorCli(process.argv.slice(2));
}
