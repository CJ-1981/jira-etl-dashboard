import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone output only in production
  ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),

  // Enable typed routes for better TypeScript support
  typedRoutes: true,

  // Turbopack configuration to silence Next.js 16 errors
  turbopack: {
    root: process.cwd(),
  },
  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: true,
  },

  // React strict mode (recommended to keep true for better error detection)
  reactStrictMode: false,

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
      
      // Explicitly tell webpack to ignore node: schemes
      config.externals = [
        ...(config.externals || []),
        { 
          'node:fs': 'empty', 
          'node:path': 'empty', 
          'node:crypto': 'empty',
          'node:https': 'empty',
          'node:http': 'empty',
          'node:zlib': 'empty'
        }
      ];
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
          }
        ]
      }
    ];
  },

  // Redirects
  async redirects() {
    return [];
  },

  // Rewrites for API proxying if needed
  async rewrites() {
    return [];
  }
};

export default nextConfig;
