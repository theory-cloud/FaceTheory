import path from 'node:path';

import { buildSsgSite } from '../../src/ssg.js';

import { faces } from './faces.js';

const outDir = path.resolve('examples/ssg-basic/dist-static');

const result = await buildSsgSite({
  faces,
  outDir,
  trailingSlash: 'always',
  emitHydrationData: false,
});

// eslint-disable-next-line no-console
console.log(`SSG build wrote ${result.pages.length} page(s) to ${result.outDir}`);
