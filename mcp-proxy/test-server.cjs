const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8085;
const HTML_PATH = path.join(__dirname, 'test.html');

const server = http.createServer(async (req, res) => {
  // Enable CORS for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    if (req.url === '/' || req.url === '/index.html') {
      const html = fs.readFileSync(HTML_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else if (req.url === '/health') {
      const backendRes = await fetch('https://a.smartearningplatformbd.net/health');
      const txt = await backendRes.text();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(txt);
    } else if (req.url === '/agents') {
      const backendRes = await fetch('https://a.smartearningplatformbd.net/agents');
      const txt = await backendRes.text();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(txt);
    } else if (req.url === '/chat/stream' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const backendRes = await fetch('https://a.smartearningplatformbd.net/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          res.writeHead(backendRes.status, { 'Content-Type': 'text/event-stream' });
          backendRes.body.pipe(res);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Proxy error: ${e.message}`);
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Server error: ${e.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Test server running at http://localhost:${PORT}`);
  console.log(`📄 Open browser: http://localhost:${PORT}`);
  console.log(`🔗 Proxies to: https://a.smartearningplatformbd.net`);
});
