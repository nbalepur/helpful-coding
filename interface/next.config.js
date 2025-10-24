/** @type {import('next').NextConfig} */
const nextConfig = {
    // Only use static export for production builds
    ...(process.env.NODE_ENV === 'production' && { output: 'export' }),
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        // !! WARN !!
        // Dangerously allow production builds to successfully complete even if
        // your project has type errors.
        // !! WARN !!
        ignoreBuildErrors: true,
      },
    // Reduce Fast Refresh logging
    logging: {
        fetches: {
            fullUrl: false,
        },
    },
    // Suppress Fast Refresh messages
    onDemandEntries: {
        // period (in ms) where the server will keep pages in the buffer
        maxInactiveAge: 25 * 1000,
        // number of pages that should be kept simultaneously without being disposed
        pagesBufferLength: 2,
    },
}

module.exports = nextConfig
