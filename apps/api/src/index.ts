import { serve } from '@hono/node-server';
import { app } from './app';
const port = Number(process.env.PORT || 8787);
serve({ fetch: (request) => app.fetch(request), hostname: '127.0.0.1', port }, (info) =>
  console.log(`animepoodle API → http://127.0.0.1:${info.port}`),
);
