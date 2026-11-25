import { App } from 'aws-cdk-lib';

import { FaceTheoryAppTheorySsrSiteStack } from '../src/stack.js';
import { REFERENCE_STAGE_CONFIG, stageEnvironment } from '../src/stage-config.js';

const app = new App();
new FaceTheoryAppTheorySsrSiteStack(app, 'FaceTheoryAppTheorySsrSite', {
  env: stageEnvironment(REFERENCE_STAGE_CONFIG),
});
app.synth();
