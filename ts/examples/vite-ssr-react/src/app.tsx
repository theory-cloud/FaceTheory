import * as React from 'react';

import { chunkLabel } from './chunk.js';

export function App({ message }: { message: string }) {
  return React.createElement('main', null, `Hello ${message} (${chunkLabel})`);
}

