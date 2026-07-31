const http = require('http');
const handler = require('serve-handler');

const BUILD_PATH = "C:\\Users\\carte\\OneDrive - Yale University\\Desktop\\notif_test\\notification-dashboard\\build";
const PORT = 3000;

const server = http.createServer((req, res) => {
  return handler(req, res, { public: BUILD_PATH });
});

server.listen(PORT, () => {
  console.log(`Serving on http://localhost:${PORT}`);
});