import assert from 'node:assert/strict';
import test from 'node:test';

import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

test(
  'vue SSG example: statically generates a real Vue tree with Vite assets and generateStaticParams',
  { concurrency: false },
  async () => {
    const cwd = path.resolve('.');

    await rm(path.resolve('examples/vue-ssg/dist'), {
      recursive: true,
      force: true,
    });
    await rm(path.resolve('examples/vue-ssg/dist-static'), {
      recursive: true,
      force: true,
    });

    await execFileAsync('npm', ['run', 'example:vue:ssg:build'], { cwd });

    const staticRoot = path.resolve('examples/vue-ssg/dist-static');

    // The static route and every generateStaticParams product page are emitted.
    const homePath = path.join(staticRoot, 'index.html');
    assert.ok(await exists(homePath));
    const home = await readFile(homePath, 'utf8');
    assert.ok(home.includes('FaceTheory Vue SSG catalog'));
    for (const slug of ['aurora-lamp', 'nimbus-chair', 'zephyr-desk']) {
      assert.ok(
        home.includes(`href="/products/${slug}"`),
        `home should link to /products/${slug}`,
      );
      assert.ok(
        await exists(path.join(staticRoot, 'products', slug, 'index.html')),
        `missing generated page for ${slug}`,
      );
    }

    // The product page carries the real Vue render plus the Vite asset head tags.
    const productPath = path.join(
      staticRoot,
      'products',
      'aurora-lamp',
      'index.html',
    );
    const product = await readFile(productPath, 'utf8');
    assert.ok(product.includes('<title>Product — FaceTheory Vue SSG</title>'));
    assert.ok(product.includes('Aurora Lamp'));
    assert.ok(product.includes('dawn-simulation'));
    assert.ok(product.includes('id="__FACETHEORY_DATA__"'));

    const cssHref = product.match(
      /<link[^>]+href="(\/assets\/[^"]+\.css)"[^>]*rel="stylesheet"/,
    )?.[1];
    const jsSrc = product.match(
      /<script[^>]+src="(\/assets\/[^"]+\.js)"[^>]*type="module"/,
    )?.[1];
    assert.ok(cssHref, 'product page should link a built Vite stylesheet');
    assert.ok(jsSrc, 'product page should load the built Vite client module');

    // The referenced Vite assets exist in the built client output.
    const clientRoot = path.resolve('examples/vue-ssg/dist/client');
    assert.ok(
      await exists(path.resolve(clientRoot, `.${cssHref}`)),
      `missing built CSS asset: ${cssHref}`,
    );
    assert.ok(
      await exists(path.resolve(clientRoot, `.${jsSrc}`)),
      `missing built JS asset: ${jsSrc}`,
    );
  },
);
