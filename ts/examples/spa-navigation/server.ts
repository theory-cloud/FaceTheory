import {
  createFaceApp,
  jsonResourceResponse,
  type FaceResourceRoute,
} from '@theory-cloud/facetheory';

import { faces, spaPageDataForPath, spaSidecarUrlForPage } from './faces.js';

// Serve each Face's hydration data as a same-origin no-store JSON sidecar. Client
// navigation loads the target Face's sidecar before swapping the DOM. The values
// are serialized with FaceTheory's XSS-safe JSON encoder via jsonResourceResponse.
const sidecars: FaceResourceRoute[] = (['home', 'details'] as const).map(
  (page) => ({
    route: spaSidecarUrlForPage(page),
    handle: () =>
      jsonResourceResponse(
        spaPageDataForPath(page === 'home' ? '/' : '/details'),
        { cacheControl: 'no-store' },
      ),
  }),
);

export function createSpaNavigationExampleApp() {
  return createFaceApp({
    faces,
    resources: sidecars,
  });
}
