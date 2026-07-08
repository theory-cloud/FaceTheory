import assert from 'node:assert/strict';
import test from 'node:test';

import { svelteSsrFixtureDefinitions } from '../fixtures/svelte-ssr/fixture-definitions.js';
import {
  listSvelteSsrFixtureComponents,
  readSnapshotPaths,
  readSvelteSsrSnapshot,
  snapshotPathForSvelteComponent,
  withSvelteSsrFixtureRenderer,
  writeSvelteSsrSnapshot,
} from '../helpers/svelte-ssr-fixtures.js';

const updateSnapshots =
  process.env.FACETHEORY_UPDATE_SVELTE_SSR_FIXTURES === '1';

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

test('svelte SSR fixtures cover every migration-target component', async () => {
  const componentPaths = await listSvelteSsrFixtureComponents();
  const fixtureComponentPaths = svelteSsrFixtureDefinitions
    .map((definition) => definition.componentPath)
    .sort();

  assert.deepEqual(
    fixtureComponentPaths,
    uniqueSorted(fixtureComponentPaths),
    'Svelte SSR fixture definitions must not contain duplicate component paths',
  );
  assert.deepEqual(
    fixtureComponentPaths,
    componentPaths,
    'Every Svelte component in the migration target directories must have a fixture definition',
  );

  const expectedSnapshotPaths = fixtureComponentPaths
    .map((componentPath) => snapshotPathForSvelteComponent(componentPath))
    .sort();
  const actualSnapshotPaths = await readSnapshotPaths();
  if (!updateSnapshots) {
    assert.deepEqual(
      actualSnapshotPaths,
      expectedSnapshotPaths,
      'Svelte SSR snapshot files must match the fixture component inventory exactly',
    );
  }
});

test('svelte SSR fixtures preserve current output across SSR, SSG, and ISR', async () => {
  await withSvelteSsrFixtureRenderer(async (renderer) => {
    for (const definition of svelteSsrFixtureDefinitions) {
      const rendered = await renderer.render(definition);

      assert.equal(
        rendered.htmlByMode.ssr,
        rendered.htmlByMode.ssg,
        `${definition.componentPath} must render the same HTML body in SSR and SSG modes`,
      );
      assert.equal(
        rendered.htmlByMode.ssr,
        rendered.htmlByMode.isr,
        `${definition.componentPath} must render the same HTML body in SSR and ISR modes`,
      );

      const repeated = await renderer.render(definition);
      assert.equal(
        repeated.htmlByMode.ssr,
        rendered.htmlByMode.ssr,
        `${definition.componentPath} must be byte-identical across repeated SSR renders`,
      );

      if (updateSnapshots) {
        await writeSvelteSsrSnapshot(
          definition.componentPath,
          rendered.snapshot,
        );
      } else {
        assert.equal(
          rendered.snapshot,
          await readSvelteSsrSnapshot(definition.componentPath),
          `${definition.componentPath} SSR output drifted from its captured fixture`,
        );
      }
    }
  });
});
