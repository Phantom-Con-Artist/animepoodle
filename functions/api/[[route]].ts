import { handle } from 'hono/cloudflare-pages';
import { app } from '../../apps/api/src/app';
// Cloudflare bundles this Hono app as a Pages Function; no Node server is deployed.
export const onRequest = handle(app);
