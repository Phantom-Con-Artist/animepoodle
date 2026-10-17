import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync } from 'node:fs';
const result = spawnSync(
  'cargo',
  [
    'build',
    '--manifest-path',
    'crates/recommender/Cargo.toml',
    '--target',
    'wasm32-unknown-unknown',
    '--release',
  ],
  { stdio: 'inherit' },
);
if (result.status !== 0) {
  console.error('Install the target with: rustup target add wasm32-unknown-unknown');
  process.exit(1);
}
mkdirSync('apps/web/public/wasm', { recursive: true });
copyFileSync(
  'crates/recommender/target/wasm32-unknown-unknown/release/animepoodle_recommender.wasm',
  'apps/web/public/wasm/recommender.wasm',
);
console.log('Rust recommendation engine built → apps/web/public/wasm/recommender.wasm');
