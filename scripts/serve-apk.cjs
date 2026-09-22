const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 10000);
const fileName = 'Lestra-After-Beta-0.5.5.apk';
const apkPath = path.join(process.cwd(), 'apk', fileName);
const hashPath = path.join(process.cwd(), 'apk', 'Lestra-After-Beta-0.5.5.sha256');

function sendText(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') return sendText(res, 200, 'ok');

  if (req.url === '/sha256') {
    if (!fs.existsSync(hashPath)) return sendText(res, 404, 'hash unavailable');
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return fs.createReadStream(hashPath).pipe(res);
  }

  if (req.url === '/' || req.url === `/${fileName}`) {
    if (!fs.existsSync(apkPath)) return sendText(res, 503, 'APK is not ready');
    const stat = fs.statSync(apkPath);
    res.writeHead(200, {
      'content-type': 'application/vnd.android.package-archive',
      'content-length': stat.size,
      'content-disposition': `attachment; filename="${fileName}"`,
      'cache-control': 'public, max-age=300',
    });
    return fs.createReadStream(apkPath).pipe(res);
  }

  return sendText(res, 404, 'not found');
});

server.listen(port, '0.0.0.0', () => {
  console.log(`APK server listening on ${port}`);
});
