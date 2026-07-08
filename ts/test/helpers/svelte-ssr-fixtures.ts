import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { compile } from 'svelte/compiler';

import { createFaceApp } from '../../src/app.js';
import { InMemoryHtmlStore, InMemoryIsrMetaStore } from '../../src/isr.js';
import { createSvelteFace } from '../../src/svelte/index.js';
import type { FaceMode, FaceModule } from '../../src/types.js';

export const SVELTE_SSR_FIXTURE_COMPONENT_ROOTS = [
  'src/svelte/responsive-primitives',
  'src/svelte/stitch-admin',
  'src/svelte/stitch-hosted-auth',
  'src/svelte/stitch-shell',
] as const;

export const SVELTE_SSR_FIXTURE_ROOT = 'test/fixtures/svelte-ssr';

const SVELTE_SSR_FIXTURE_TEMP_PREFIX = '.tmp-facetheory-svelte-ssr-fixtures-';

/*
 * These fixtures are compiler-shape snapshots for the Svelte version pinned by
 * the workspace lockfile, not a portable proof that two Svelte compiler
 * generations emit identical bytes. The harness intentionally compiles wrapper
 * components with svelte/compiler so every component flows through
 * createSvelteFace across SSR/SSG/ISR without depending on Vite/Rollup's bundle
 * graph. Production bundler coverage still lives in the Vite Svelte example
 * tests; the assertions below make this direct-compiler path fail closed if the
 * current Svelte output/import shape moves beyond the narrow rewrites used here.
 */
export interface SvelteSsrFixtureDefinition {
  componentPath: string;
  props?: Record<string, unknown>;
  wrapperMarkup?: string;
}

export interface SvelteSsrRenderedFixture {
  componentPath: string;
  cssText: string | undefined;
  htmlByMode: Record<'ssr' | 'ssg' | 'isr', string>;
  snapshot: string;
}

interface CompiledComponent {
  cssText: string | undefined;
  importSpecifiers: string[];
  outputPath: string;
}

export async function listSvelteSsrFixtureComponents(): Promise<string[]> {
  const out: string[] = [];
  for (const root of SVELTE_SSR_FIXTURE_COMPONENT_ROOTS) {
    await collectSvelteComponents(path.resolve(root), out);
  }
  return out
    .map((componentPath) => path.relative(process.cwd(), componentPath))
    .sort();
}

export function snapshotPathForSvelteComponent(componentPath: string): string {
  const sourceRelative = path.relative('src/svelte', componentPath);
  assert.ok(
    !sourceRelative.startsWith('..') && sourceRelative.endsWith('.svelte'),
    `Svelte fixture component must live below src/svelte: ${componentPath}`,
  );
  return path.join(
    SVELTE_SSR_FIXTURE_ROOT,
    sourceRelative.replace(/\.svelte$/, '.html'),
  );
}

export function storedSvelteSsrSnapshot(html: string): string {
  return `${html}\n`;
}

export async function readSnapshotPaths(
  root = SVELTE_SSR_FIXTURE_ROOT,
): Promise<string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  await collectHtmlSnapshots(path.resolve(root), out);
  return out
    .map((snapshotPath) => path.relative(process.cwd(), snapshotPath))
    .sort();
}

export async function withSvelteSsrFixtureRenderer<T>(
  fn: (renderer: SvelteSsrFixtureRenderer) => Promise<T>,
): Promise<T> {
  const tempRoot = await createSvelteSsrFixtureTempRoot();
  const renderer = new SvelteSsrFixtureRenderer(tempRoot);

  try {
    await renderer.compileComponents(await listSvelteSsrFixtureComponents());
    return await fn(renderer);
  } finally {
    await removeSvelteSsrFixtureTempRoot(tempRoot);
  }
}

export class SvelteSsrFixtureRenderer {
  readonly #compiled = new Map<string, CompiledComponent>();

  constructor(readonly tempRoot: string) {}

  async compileComponents(componentPaths: string[]): Promise<void> {
    for (const componentPath of componentPaths) {
      await this.#compileComponent(componentPath);
    }
  }

  async render(
    definition: SvelteSsrFixtureDefinition,
  ): Promise<SvelteSsrRenderedFixture> {
    const componentPath = path.normalize(definition.componentPath);
    const compiled = this.#compiled.get(componentPath);
    assert.ok(
      compiled,
      `missing compiled Svelte component for ${componentPath}`,
    );

    const wrapper = await this.#compileWrapper(definition, compiled.outputPath);
    const cssText = this.#cssTextForFixture(componentPath, wrapper.cssText);
    const htmlByMode = {
      ssr: await this.#renderMode(
        'ssr',
        wrapper.outputPath,
        definition.props,
        cssText,
      ),
      ssg: await this.#renderMode(
        'ssg',
        wrapper.outputPath,
        definition.props,
        cssText,
      ),
      isr: await this.#renderMode(
        'isr',
        wrapper.outputPath,
        definition.props,
        cssText,
      ),
    };

    return {
      componentPath,
      cssText,
      htmlByMode,
      snapshot: storedSvelteSsrSnapshot(htmlByMode.ssr),
    };
  }

  async #compileComponent(componentPath: string): Promise<void> {
    const normalized = path.normalize(componentPath);
    if (this.#compiled.has(normalized)) return;

    const absoluteSourcePath = path.resolve(normalized);
    const source = await readFile(absoluteSourcePath, 'utf8');
    const compiled = compile(source, {
      generate: 'server',
      filename: path.basename(absoluteSourcePath),
    } as never);
    const importSpecifiers = Array.from(
      source.matchAll(/from\s+['"](\.\/[A-Za-z0-9_/-]+\.svelte)['"]/g),
      (match) => match[1],
    ).filter((specifier): specifier is string => specifier !== undefined);
    let code = compiled.js.code.replace(
      /(['"])(\.\/[A-Za-z0-9_/-]+)\.svelte\1/g,
      '$1$2.mjs$1',
    );
    code = rewriteRelativeRuntimeTsImports(code, absoluteSourcePath);
    assertNoUnresolvedSvelteImports(code, normalized);
    assertNoUnrewrittenRuntimeTsImports(code, absoluteSourcePath);

    const outputPath = path.join(
      this.tempRoot,
      normalized
        .replace(/^src\/svelte\//, 'components/')
        .replace(/\.svelte$/, '.mjs'),
    );
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, code, 'utf8');

    this.#compiled.set(normalized, {
      cssText: compiled.css?.code,
      importSpecifiers,
      outputPath,
    });
  }

  async #compileWrapper(
    definition: SvelteSsrFixtureDefinition,
    compiledComponentPath: string,
  ): Promise<CompiledComponent> {
    const wrapperId = definition.componentPath
      .replace(/^src\/svelte\//, '')
      .replace(/\.svelte$/, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-');
    const wrapperPath = path.join(
      this.tempRoot,
      'wrappers',
      `${wrapperId}.mjs`,
    );
    const targetUrl = pathToFileURL(compiledComponentPath).href;
    const markup = definition.wrapperMarkup ?? '<Target {...fixtureProps} />';
    const source = `<script>\n  import Target from ${JSON.stringify(targetUrl)};\n  export let fixtureProps = {};\n</script>\n${markup}\n`;
    const compiled = compile(source, {
      generate: 'server',
      filename: `${wrapperId}.fixture.svelte`,
    } as never);

    await mkdir(path.dirname(wrapperPath), { recursive: true });
    await writeFile(wrapperPath, compiled.js.code, 'utf8');

    return {
      cssText: compiled.css?.code,
      importSpecifiers: [],
      outputPath: wrapperPath,
    };
  }

  #cssTextForFixture(
    componentPath: string,
    wrapperCssText: string | undefined,
  ): string | undefined {
    const cssChunks: string[] = [];
    if (wrapperCssText) cssChunks.push(wrapperCssText);

    const seen = new Set<string>();
    const visit = (currentPath: string): void => {
      if (seen.has(currentPath)) return;
      seen.add(currentPath);
      const compiled = this.#compiled.get(currentPath);
      assert.ok(
        compiled,
        `missing compiled Svelte dependency for ${currentPath}`,
      );
      if (compiled.cssText) cssChunks.push(compiled.cssText);
      const currentDir = path.dirname(currentPath);
      for (const specifier of compiled.importSpecifiers) {
        visit(path.normalize(path.join(currentDir, specifier)));
      }
    };
    visit(componentPath);

    if (cssChunks.length === 0) return undefined;
    return cssChunks.join('\n');
  }

  async #renderMode(
    mode: Extract<FaceMode, 'ssr' | 'ssg' | 'isr'>,
    wrapperPath: string,
    props: Record<string, unknown> | undefined,
    cssText: string | undefined,
  ): Promise<string> {
    const mod = (await import(pathToFileURL(wrapperPath).href)) as {
      default: unknown;
    };
    const face = createSvelteFace({
      route: '/',
      mode,
      render: () => ({
        component: mod.default,
        props: { fixtureProps: props ?? {} },
        ...(cssText === undefined ? {} : { cssText }),
      }),
    });
    if (mode === 'isr') {
      (face as FaceModule).revalidateSeconds = 60;
    }

    const app = createFaceApp({
      faces: [face],
      ...(mode === 'isr'
        ? {
            isr: {
              htmlStore: new InMemoryHtmlStore(),
              metaStore: new InMemoryIsrMetaStore(),
              now: () => 1_000,
            },
          }
        : {}),
    });
    const response = await app.handle({ method: 'GET', path: '/' });
    assert.equal(
      response.status,
      200,
      `${mode} fixture render failed for ${path.basename(wrapperPath)}`,
    );
    return new TextDecoder().decode(response.body as Uint8Array);
  }
}

async function collectSvelteComponents(
  root: string,
  out: string[],
): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await collectSvelteComponents(entryPath, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.svelte')) {
      out.push(entryPath);
    }
  }
}

async function collectHtmlSnapshots(
  root: string,
  out: string[],
): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await collectHtmlSnapshots(entryPath, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(entryPath);
    }
  }
}

function rewriteRelativeRuntimeTsImports(
  code: string,
  sourcePath: string,
): string {
  const sourceDir = path.dirname(sourcePath);
  return code.replace(
    /from\s+(['"])(\.{1,2}\/[^'"]+\.js)\1/g,
    (full, quote: string, specifier: string) => {
      const jsPath = path.resolve(sourceDir, specifier);
      const tsPath = jsPath.replace(/\.js$/, '.ts');
      if (!existsSync(tsPath)) return full as string;
      return `from ${quote}${pathToFileURL(tsPath).href}${quote}`;
    },
  );
}

function assertNoUnresolvedSvelteImports(
  code: string,
  componentPath: string,
): void {
  const unresolved = Array.from(
    code.matchAll(/from\s+['"]([^'"]+\.svelte)['"]/g),
    (match) => match[1],
  ).filter((specifier): specifier is string => specifier !== undefined);
  assert.deepEqual(
    unresolved,
    [],
    `Svelte SSR fixture compiler output for ${componentPath} still contains .svelte imports; update the harness rewrite before trusting snapshots`,
  );
}

function assertNoUnrewrittenRuntimeTsImports(
  code: string,
  sourcePath: string,
): void {
  const sourceDir = path.dirname(sourcePath);
  const unresolved = Array.from(
    code.matchAll(/from\s+['"](\.{1,2}\/[^'"]+\.js)['"]/g),
    (match) => match[1],
  ).filter((specifier): specifier is string => {
    if (specifier === undefined) return false;
    const jsPath = path.resolve(sourceDir, specifier);
    return existsSync(jsPath.replace(/\.js$/, '.ts'));
  });
  assert.deepEqual(
    unresolved,
    [],
    `Svelte SSR fixture compiler output for ${path.relative(
      process.cwd(),
      sourcePath,
    )} still contains repo-local relative .js imports that map to .ts sources; update the harness rewrite before trusting snapshots`,
  );
}

async function createSvelteSsrFixtureTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(
    path.resolve(`${SVELTE_SSR_FIXTURE_TEMP_PREFIX}${process.pid}-`),
  );
  assertSvelteSsrFixtureTempRoot(tempRoot);
  return tempRoot;
}

async function removeSvelteSsrFixtureTempRoot(tempRoot: string): Promise<void> {
  assertSvelteSsrFixtureTempRoot(tempRoot);
  await rm(tempRoot, { recursive: true, force: true });
}

function assertSvelteSsrFixtureTempRoot(tempRoot: string): void {
  const relative = path.relative(process.cwd(), tempRoot);
  assert.ok(
    relative !== '' &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative) &&
      path.basename(relative).startsWith(SVELTE_SSR_FIXTURE_TEMP_PREFIX),
    `refusing to use Svelte SSR fixture temp root outside the ignored ${SVELTE_SSR_FIXTURE_TEMP_PREFIX}* pattern: ${tempRoot}`,
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeSvelteSsrSnapshot(
  componentPath: string,
  snapshot: string,
): Promise<void> {
  const snapshotPath = snapshotPathForSvelteComponent(componentPath);
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, snapshot, 'utf8');
}

export async function readSvelteSsrSnapshot(
  componentPath: string,
): Promise<string> {
  const snapshotPath = snapshotPathForSvelteComponent(componentPath);
  assert.ok(
    await pathExists(snapshotPath),
    `missing Svelte SSR snapshot fixture at ${snapshotPath}`,
  );
  return await readFile(snapshotPath, 'utf8');
}
