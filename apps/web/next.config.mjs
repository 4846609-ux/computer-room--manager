/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@crm/shared'],
  eslint: { ignoreDuringBuilds: true },
  output: 'standalone',
};

export default nextConfig;
