import { readFileSync } from 'node:fs';
const path = 'apps/web/public/wasm/recommender.wasm';
try {
  const bytes = readFileSync(path);
  const { instance } = await WebAssembly.instantiate(bytes);
  for (const name of [
    'score',
    'vector_buffer',
    'vector_cosine',
    'posterior_mean',
    'posterior_variance',
  ])
    if (typeof instance.exports[name] !== 'function') throw new Error(`Missing ${name} export`);
  console.log(
    'Prebuilt Rust/WebAssembly engine verified. No Rust toolchain required for deployment.',
  );
} catch (error) {
  console.error(
    'Rebuild the engine locally with npm run build:wasm, then commit public/wasm/recommender.wasm.',
  );
  throw error;
}
