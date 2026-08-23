import type { NextConfig } from "next";
import pkg from './package.json';

const nextConfig: NextConfig = {
  // Expose the app version and build date to the client bundle
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
  },
  // Use standalone output for production, export for Electron
  ...(process.env.NODE_ENV === 'production'
    ? { output: 'standalone' }
    : {}),

  // Enable typed routes for better TypeScript support
  typedRoutes: true,

  // Turbopack configuration to silence Next.js 16 errors
  turbopack: {
    root: process.cwd(),
  },
  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: false,
  },

  // React strict mode helps catch side-effect bugs and unsafe lifecycle usage
  // during development. Double-render checks are stripped in production builds.
  reactStrictMode: true,

  // Webpack configuration for production builds
  webpack: (config, { dev, isServer }) => {
    // Optimize bundle size
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
        http: false,
        https: false,
        zlib: false,
        'node:fs': false,
        'node:path': false,
        'node:crypto': false,
        'node:stream': false,
        'node:buffer': false,
        'node:util': false,
        'node:url': false,
        'node:https': false,
        'node:http': false,
        'node:zlib': false,
      };
    }

    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20
            },
            // Common chunk
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true
            }
          }
        }
      };
    }
    return config;
  },

  // External packages that should not be bundled
  serverExternalPackages: ['@prisma/client'],

  // Transpile packages for better compatibility
  transpilePackages: [],


  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://*.jira.com https://*.atlassian.net"
          }
        ]
      }
    ];
  },
};

export default nextConfig;
