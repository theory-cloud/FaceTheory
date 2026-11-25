import { App } from 'aws-cdk-lib';

import { FaceTheoryAppTheorySsgIsrSiteStack } from '../src/stack.js';
import { REFERENCE_STAGE_CONFIG, stageEnvironment } from '../src/stage-config.js';

const app = new App();
new FaceTheoryAppTheorySsgIsrSiteStack(app, 'FaceTheoryAppTheorySsgIsrSite', {
  env: stageEnvironment(REFERENCE_STAGE_CONFIG),
});
app.synth();
