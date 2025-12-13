// Custom Next.js server with IPv4-only proxy support
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const http = require('http');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '4827', 10);

const app = next({ dev, hostname });
const handle = app.getRequestHandler();

// Backend URL - force IPv4
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:4828';
const backendHost = BACKEND_URL.replace(/localhost/g, '127.0.0.1');

// Helper to make HTTP requests with IPv4 preference
function proxyRequest(req, res, targetPath) {
  const targetUrl = `${backendHost}${targetPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;
  
  // Parse the backend URL to get hostname and port
  const url = new URL(targetUrl);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: url.host,
    },
    // Force IPv4 by using the numeric IP
    family: 4, // IPv4 only
  };

  console.log(`[Proxy] ${req.method} ${targetPath} -> ${options.hostname}:${options.port} (IPv${options.family})`);
  
  const proxyReq = http.request(options, (proxyRes) => {
    // Copy status code
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    // Pipe the response
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${req.method} ${targetPath}:`, err.message);
    console.error(`  Attempted to connect to: ${options.hostname}:${options.port} (IPv${options.family})`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: ' + err.message);
    }
  });

  // Pipe the request body
  req.pipe(proxyReq);
}

app.prepare().then(() => {
  createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      const { pathname } = parsedUrl;

      // Proxy API requests to backend
      if (pathname.startsWith('/api/') || 
          pathname.startsWith('/video/') ||
          pathname === '/login' ||
          pathname === '/signup' ||
          pathname.startsWith('/auth/') ||
          pathname === '/validate-reset-token' ||
          pathname === '/reset-password' ||
          pathname === '/send-password-reset' ||
          pathname.startsWith('/ws/')) {
        return proxyRequest(req, res, pathname);
      }

      // Handle all other requests with Next.js
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Proxying backend requests to ${backendHost}`);
  });
});

