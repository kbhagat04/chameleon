/** @type {import('next').NextConfig} */
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(',')
  : ['http://localhost:3000']

const nextConfig = {
  reactStrictMode: true,
  // Allow dev assets to be requested from additional origins (useful for LAN testing)
  // Set ALLOWED_DEV_ORIGINS in your environment to a comma-separated list, e.g.
  // ALLOWED_DEV_ORIGINS=http://10.3.132.60:3000
  allowedDevOrigins,
}

module.exports = nextConfig;