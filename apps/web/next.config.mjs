/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@crm/shared'],
  eslint: { ignoreDuringBuilds: true },
  // Standalone output is only for the Docker image (Render/self-host). On Netlify
  // the official Next runtime handles output, so leave it default there.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
};

export default nextConfig;
