const http = require('http');
const path = require('path');
const handler = require('serve-handler');

const BUILD_PATH = process.env.BUILD_PATH || path.join(__dirname, 'build');
const PORT = parseInt(process.env.PORT, 10) || 3000;

const server = http.createServer((req, res) => {
  return handler(req, res, {
    public: BUILD_PATH,
    cleanUrls: true,
    directoryListing: false,
    rewrites: [{ source: '**', destination: '/index.html' }],
  });
});

server.listen(PORT, () => {
  console.log(`Serving ${BUILD_PATH} on http://localhost:${PORT}`);
});
