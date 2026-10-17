import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: ['@animepoodle/shared'],
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ??
      (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : ''),
  },
};
export default config;
