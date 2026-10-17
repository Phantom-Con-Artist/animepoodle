import { copyFileSync } from 'node:fs';
// --outdir produces executable ESM; Wrangler's deprecated --outfile produces
// multipart upload data, which cannot be served as a Pages advanced-mode script.
copyFileSync('.wrangler/pages-worker/index.js', 'apps/web/out/_worker.js');
console.log('Hono Pages Function packaged as out/_worker.js');
