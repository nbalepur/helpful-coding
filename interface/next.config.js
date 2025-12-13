/** @type {import('next').NextConfig} */
const nextConfig = {
    // Static export disabled because we have API routes that need a server
    // ...(process.env.NODE_ENV === 'production' && { output: 'export' }),
    images: {
        unoptimized: true,
    },
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
    // Proxy backend API requests to the backend server
    // This allows the frontend to access the backend through the same port (4827)
    async rewrites() {
        let backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:4828';
        // Force IPv4 (127.0.0.1) instead of localhost which can resolve to IPv6 (::1)
        backendUrl = backendUrl.replace('localhost', '127.0.0.1');
        const backendHost = new URL(backendUrl).origin;
        
        return [
            // Proxy all API requests to the backend
            {
                source: '/api/:path*',
                destination: `${backendHost}/api/:path*`,
            },
            // Proxy auth endpoints
            {
                source: '/login',
                destination: `${backendHost}/login`,
            },
            {
                source: '/signup',
                destination: `${backendHost}/signup`,
            },
            {
                source: '/auth/:path*',
                destination: `${backendHost}/auth/:path*`,
            },
            // Proxy other backend endpoints
            {
                source: '/validate-reset-token',
                destination: `${backendHost}/validate-reset-token`,
            },
            {
                source: '/reset-password',
                destination: `${backendHost}/reset-password`,
            },
            {
                source: '/send-password-reset',
                destination: `${backendHost}/send-password-reset`,
            },
            // Proxy WebSocket upgrade requests (though WebSocket itself won't work through rewrites)
            {
                source: '/ws/:path*',
                destination: `${backendHost}/ws/:path*`,
            },
        ];
    },
}

module.exports = nextConfig
