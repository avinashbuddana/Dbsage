import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  reactStrictMode: true,
  transpilePackages: ['@schemaiq/shared', '@schemaiq/types'],
};

export default nextConfig;
