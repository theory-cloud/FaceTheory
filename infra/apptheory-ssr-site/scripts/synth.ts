import { App } from 'aws-cdk-lib';

import { FaceTheoryAppTheorySsrSiteStack } from '../src/stack.js';

const app = new App();
new FaceTheoryAppTheorySsrSiteStack(app, 'FaceTheoryAppTheorySsrSite');
app.synth();

