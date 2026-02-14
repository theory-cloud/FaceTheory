import { App } from 'aws-cdk-lib';

import { FaceTheoryAppTheorySsgIsrSiteStack } from '../src/stack.js';

const app = new App();
new FaceTheoryAppTheorySsgIsrSiteStack(app, 'FaceTheoryAppTheorySsgIsrSite');
app.synth();

