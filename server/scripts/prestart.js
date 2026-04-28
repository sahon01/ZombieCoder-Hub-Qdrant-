const net = require('net');
const { spawn } = require('child_process');
const fs = require('fs');

function log(msg) {
  process.stdout.write(`[prestart] ${msg}\n`);
}

function isPortOpen(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (ok) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    socket.connect(port, host);
  });
}

function spawnDetached(cmd, args, logPath) {
  try {
    const out = fs.openSync(logPath, 'a');
    const child = spawn(cmd, args, {
      detached: true,
      stdio: ['ignore', out, out],
      env: process.env
    });
    child.unref();
    return true;
  } catch (e) {
    log(`Failed to spawn ${cmd}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function ensureChroma() {
  const host = '127.0.0.1';
  const port = 8001;
  const ok = await isPortOpen(host, port);
  if (ok) {
    log(`ChromaDB already listening on ${host}:${port}`);
    return;
  }

  log(`ChromaDB not listening on ${host}:${port}; starting uvicorn...`);
  spawnDetached(
    'python3',
    ['-m', 'uvicorn', 'chromadb.app:app', '--host', host, '--port', String(port)],
    '/tmp/uas-chroma.log'
  );
}

async function ensureCloudflared() {
  const cfg = process.env.CLOUDFLARED_CONFIG || `${process.cwd()}/config/cloudflared.yml`;
  // Cheap check: if any cloudflared is running, don't start another.
  // (Avoids duplication and slowness.)
  try {
    const ps = spawn('bash', ['-lc', 'pgrep -fa "cloudflared.*tunnel" || true'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    ps.stdout.on('data', (d) => { out += d.toString('utf8'); });
    await new Promise((r) => ps.on('close', r));
    if (out.trim()) {
      log('cloudflared tunnel already running; skipping start');
      return;
    }
  } catch {
    // ignore
  }

  log(`Starting cloudflared tunnel using config: ${cfg}`);
  spawnDetached(
    'cloudflared',
    ['--no-autoupdate', 'tunnel', '--config', cfg, 'run'],
    '/tmp/uas-cloudflared.log'
  );
}

async function checkMySql() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || '3306');
  const ok = await isPortOpen(host, port);
  if (ok) {
    log(`MySQL port reachable at ${host}:${port}`);
  } else {
    log(`WARNING: MySQL port not reachable at ${host}:${port}`);
  }
}

(async () => {
  try {
    await checkMySql();
    await ensureChroma();
    await ensureCloudflared();
  } catch (e) {
    log(`prestart failed: ${e instanceof Error ? e.message : String(e)}`);
    // Don't block backend startup
  }
})();
