/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundled and run as a child process by Electron - standalone gives a
  // self-contained server directory with no separate `node_modules` install
  // needed at the user's machine.
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
};

export default nextConfig;
