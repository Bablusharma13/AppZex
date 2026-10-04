/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API base URL is supplied at runtime so the same build can target any
  // backend environment. Never hard-code a localhost dependency.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api',
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    // Static generation and lint workers are disabled because spawning child
    // processes fails on some Windows/container hosts with `spawn UNKNOWN`.
    // Builds are slower but deterministic, which matters more in CI.
    workerThreads: false,
    cpus: 1,
  },
};

module.exports = nextConfig;