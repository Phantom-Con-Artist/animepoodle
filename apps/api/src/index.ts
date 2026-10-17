import { serve } from '@hono/node-server';
import { app } from './app.js';
import { localHypeBindings } from './hype-dev.js';
const hype = localHypeBindings();
const port = Number(process.env.PORT || 8787);
serve({ fetch: (request) => app.fetch(request, hype), hostname: '127.0.0.1', port }, (info) =>
  console.log(`animepoodle API → http://127.0.0.1:${info.port}`),
);
