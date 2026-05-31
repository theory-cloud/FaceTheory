import { startNavigationPending } from '@theory-cloud/facetheory/navigation-pending';

const navigationPending = startNavigationPending();

window.addEventListener('beforeunload', () => {
  navigationPending.stop();
});
