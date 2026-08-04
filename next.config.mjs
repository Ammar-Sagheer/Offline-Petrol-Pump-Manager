/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundled and run as a child process by Electron - standalone gives a
  // self-contained server directory with no separate `node_modules` install
  // needed at the user's machine.
  output: 'standalone',
  // We keep our own CLAUDE.md/PROGRESS.md checked into git as the real
  // project record - Next's auto-generated version would overwrite it on
  // every `next dev` run.
  agentRules: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
};

export default nextConfig;
