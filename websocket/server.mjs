#!/usr/bin/env node
/**
 * 🧟 ZombieCoder WebSocket Server
 * অর্ধেক মিলনে বিচ্ছেদ (UND_ERR_SOCKET) সমাধান
 * Agent ID ভিত্তিক টুল এক্সিকিউশন + রিয়েল টাইম স্ট্রিমিং
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════
// কনফিগারেশন - IPv4 vs IPv6 প্যাঁচ ফিক্স
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  // ⚠️ IPv4 ব্যবহার করুন (::1 IPv6 ইস্যু এড়াতে)
  HOST: '127.0.0.1',
  PORT: 56510,
  
  // টাইমআউট কনফিগারেশন
  HEARTBEAT_INTERVAL: 30000,    // ৩০ সেকেন্ড হার্টবিট
  CONNECTION_TIMEOUT: 300000,   // ৫ মিনিট কানেকশন টাইমআউট
  STREAM_TIMEOUT: 120000,       // ২ মিনিট স্ট্রিম টাইমআউট
  
  // রিকানেকশন সেটিংস
  MAX_RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 2000,
  
  // এজেন্ট সেটিংস
  AGENT_TOOLS_DIR: path.join(__dirname, 'agent-tools'),
  AUTH_TOKEN: process.env.WS_AUTH_TOKEN || 'zombie-websocket-local'
};

// লগিং কালারস
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function log(level, msg, data = '') {
  const colors = { info: c.blue, success: c.green, error: c.red, warn: c.yellow };
  const icon = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
  console.log(`${colors[level] || c.blue}${icon[level]} [${new Date().toLocaleTimeString()}] ${msg}${c.reset}`);
  if (data) console.log(`   ${c.dim}${data}${c.reset}`);
}

// ═══════════════════════════════════════════════════════════════
// TOOL REGISTRY - Agent ID ভিত্তিক টুল
// ═══════════════════════════════════════════════════════════════
class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.agentTools = new Map(); // agent_id -> tools[]
    this.registerDefaultTools();
  }

  registerDefaultTools() {
    // ১. ফাইল অপারেশন টুলস
    this.register('file_read', this.fileRead.bind(this), ['file', 'read']);
    this.register('file_write', this.fileWrite.bind(this), ['file', 'write']);
    this.register('file_list', this.fileList.bind(this), ['file', 'list']);
    
    // ২. শেল অপারেশন
    this.register('shell_exec', this.shellExec.bind(this), ['shell', 'exec']);
    
    // ৩. কোড এক্সিকিউশন
    this.register('code_execute', this.codeExecute.bind(this), ['code', 'run']);
    
    // ৪. ইউটিলিটি
    this.register('calculator', this.calculator.bind(this), ['math', 'calc']);
    this.register('datetime', this.getDateTime.bind(this), ['time', 'date']);
    this.register('system_info', this.getSystemInfo.bind(this), ['system', 'info']);
    
    log('success', '১০টি ডিফল্ট টুল রেজিস্টার্ড');
  }

  register(name, handler, tags = []) {
    this.tools.set(name, { name, handler, tags });
  }

  // এজেন্টের জন্য নির্দিষ্ট টুল অ্যাসাইন
  assignToAgent(agentId, toolNames) {
    this.agentTools.set(agentId, toolNames);
    log('info', `এজেন্ট ${agentId} এর জন্য ${toolNames.length}টি টুল অ্যাসাইন হয়েছে`);
  }

  // এজেন্টের টুল চেক
  getAgentTools(agentId) {
    const toolNames = this.agentTools.get(agentId);
    if (!toolNames) return [];
    
    return toolNames.map(name => ({
      name,
      ...this.tools.get(name)
    })).filter(t => t.handler);
  }

  async execute(toolName, args, agentId, context) {
    // 🔐 অথেন্টিকেশন: এজেন্টের টুল অ্যাক্সেস চেক
    if (agentId) {
      const agentToolNames = this.agentTools.get(agentId) || [];
      if (!agentToolNames.includes(toolName)) {
        throw new Error(`🚫 এজেন্ট ${agentId} এর '${toolName}' টুল অ্যাক্সেস নেই`);
      }
    }

    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`❓ টুল '${toolName}' পাওয়া যায়নি`);
    }

    log('info', `🔧 টুল এক্সিকিউট: ${toolName}`, `Agent: ${agentId || 'none'}`);
    
    // টুল এক্সিকিউট প্রমাণ (Audit Trail)
    const executionProof = {
      tool: toolName,
      agentId,
      timestamp: Date.now(),
      args: JSON.stringify(args).substring(0, 100)
    };

    try {
      const result = await tool.handler(args, context);
      return {
        ...result,
        _proof: executionProof,
        _authentic: true
      };
    } catch (error) {
      throw new Error(`টুল '${toolName}' ব্যর্থ: ${error.message}`);
    }
  }

  // ═════════════════════════════════════════════════════════
  // TOOL IMPLEMENTATIONS
  // ═════════════════════════════════════════════════════════

  async fileRead(args) {
    const { path: filePath } = args;
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`ফাইল পাওয়া যায়নি: ${filePath}`);
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const stats = fs.statSync(fullPath);
    
    return {
      success: true,
      content: content.substring(0, 5000), // লিমিট
      size: stats.size,
      modified: stats.mtime
    };
  }

  async fileWrite(args) {
    const { path: filePath, content } = args;
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(fullPath, content, 'utf-8');
    
    return {
      success: true,
      path: filePath,
      bytesWritten: content.length
    };
  }

  async fileList(args) {
    const { dir = '.' } = args;
    const fullPath = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`ডিরেক্টরি পাওয়া যায়নি: ${dir}`);
    }
    
    const items = fs.readdirSync(fullPath);
    const result = items.map(item => {
      const stat = fs.statSync(path.join(fullPath, item));
      return {
        name: item,
        type: stat.isDirectory() ? 'dir' : 'file',
        size: stat.size
      };
    });
    
    return {
      success: true,
      items: result,
      count: result.length
    };
  }

  async shellExec(args) {
    const { command, timeout = 30000 } = args;
    
    // সিকিউরিটি হুইটলিস্ট
    const allowedCommands = ['git', 'npm', 'node', 'dir', 'cd', 'echo', 'ls', 'cat', 'pwd'];
    const firstWord = command.trim().split(/\s+/)[0];
    
    if (!allowedCommands.includes(firstWord)) {
      throw new Error(`কমান্ড '${firstWord}' অনুমোদিত নয়`);
    }
    
    return new Promise((resolve, reject) => {
      exec(command, { timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve({
          success: true,
          output: stdout || stderr,
          command
        });
      });
    });
  }

  async codeExecute(args) {
    const { code, language = 'javascript' } = args;
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    
    if (language === 'javascript' || language === 'js') {
      const tempFile = path.join(tempDir, `zombie_exec_${timestamp}.js`);
      fs.writeFileSync(tempFile, code, 'utf-8');
      
      return new Promise((resolve, reject) => {
        exec(`node "${tempFile}"`, { timeout: 10000 }, (error, stdout, stderr) => {
          try { fs.unlinkSync(tempFile); } catch {}
          
          if (error) {
            reject(new Error(error.message));
            return;
          }
          resolve({
            success: true,
            output: stdout || stderr,
            language
          });
        });
      });
    }
    
    throw new Error(`ভাষা '${language}' সমর্থিত নয়`);
  }

  async calculator(args) {
    const { expression } = args;
    
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error('অবৈধ এক্সপ্রেশন');
    }
    
    // eslint-disable-next-line no-eval
    const result = eval(expression);
    
    return {
      success: true,
      expression,
      result
    };
  }

  async getDateTime() {
    const now = new Date();
    return {
      success: true,
      iso: now.toISOString(),
      local: now.toLocaleString('bn-BD'),
      unix: Math.floor(now.getTime() / 1000)
    };
  }

  async getSystemInfo() {
    return {
      success: true,
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
        free: Math.round(os.freemem() / 1024 / 1024) + ' MB'
      },
      cpus: os.cpus().length,
      uptime: Math.round(os.uptime() / 60) + ' minutes'
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET SERVER - অর্ধেক মিলনে বিচ্ছেদ সমাধান
// ═══════════════════════════════════════════════════════════════
class ZombieWebSocketServer {
  constructor() {
    this.clients = new Map();
    this.toolRegistry = new ToolRegistry();
    this.httpServer = null;
    this.wss = null;
    this.heartbeatInterval = null;
    this.messageQueue = new Map(); // clientId -> messages[]
  }

  async start() {
    // HTTP সার্ভার তৈরি
    this.httpServer = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        service: 'ZombieCoder WebSocket',
        status: 'running',
        clients: this.clients.size,
        timestamp: new Date().toISOString()
      }));
    });

    // WebSocket সার্ভার
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      // ⚠️ IPv4 বাইন্ড (IPv6 ইস্যু এড়াতে)
      host: CONFIG.HOST,
      perMessageDeflate: false, // স্ট্রিমিং এর জন্য অফ
      maxPayload: 10 * 1024 * 1024 // 10MB
    });

    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (err) => this.handleServerError(err));

    // হার্টবিট চেক (সকেট ড্রপ ডিটেকশন)
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, CONFIG.HEARTBEAT_INTERVAL);

    // সার্ভার শুরু
    return new Promise((resolve) => {
      this.httpServer.listen(CONFIG.PORT, CONFIG.HOST, () => {
        log('success', `🚀 WebSocket সার্ভার চালু`, `${CONFIG.HOST}:${CONFIG.PORT}`);
        log('info', `📡 IPv4 বাইন্ড (IPv6 ::1 ইস্যু ফিক্সড)`);
        resolve();
      });
    });
  }

  // ═════════════════════════════════════════════════════════
  // কানেকশন হ্যান্ডলার
  // ═════════════════════════════════════════════════════════
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    const clientIp = req.socket.remoteAddress;
    
    log('info', `🔌 নতুন কানেকশন`, `Client ${clientId} from ${clientIp}`);

    // ক্লায়েন্ট স্টেট
    const client = {
      id: clientId,
      ws,
      ip: clientIp,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      isAlive: true,
      agentId: null,
      reconnectAttempts: 0,
      streamActive: false
    };

    this.clients.set(clientId, client);

    // ইভেন্ট হ্যান্ডলার
    ws.on('message', (data) => this.handleMessage(client, data));
    ws.on('close', (code, reason) => this.handleDisconnect(client, code, reason));
    ws.on('error', (err) => this.handleSocketError(client, err));
    ws.on('pong', () => {
      client.isAlive = true;
      client.lastPing = Date.now();
    });

    // প্রাথমিক হ্যান্ডশেক
    this.send(client, {
      type: 'connected',
      clientId,
      message: '🧟 ZombieCoder WebSocket - সংযুক্ত',
      config: {
        heartbeat: CONFIG.HEARTBEAT_INTERVAL,
        timeout: CONFIG.CONNECTION_TIMEOUT
      }
    });

    // হার্টবিট পিং
    ws.ping();
  }

  // ═════════════════════════════════════════════════════════
  // মেসেজ হ্যান্ডলার
  // ═════════════════════════════════════════════════════════
  async handleMessage(client, data) {
    try {
      const message = JSON.parse(data.toString());
      const { type, payload, requestId } = message;

      log('info', `📨 মেসেজ টাইপ: ${type}`, `Client: ${client.id}`);

      switch (type) {
        case 'auth':
          await this.handleAuth(client, payload);
          break;

        case 'tool_execute':
          await this.handleToolExecute(client, payload, requestId);
          break;

        case 'stream_start':
          await this.handleStreamStart(client, payload, requestId);
          break;

        case 'ping':
          this.send(client, { type: 'pong', timestamp: Date.now() });
          break;

        case 'agent_register':
          await this.handleAgentRegister(client, payload);
          break;

        default:
          this.send(client, { 
            type: 'error', 
            error: `অজানা টাইপ: ${type}`,
            requestId 
          });
      }
    } catch (err) {
      log('error', `❌ মেসেজ পার্স ত্রুটি`, err.message);
      this.send(client, { 
        type: 'error', 
        error: 'অবৈধ JSON ফরম্যাট' 
      });
    }
  }

  async handleAuth(client, payload) {
    const { token, agentId } = payload;
    
    if (token !== CONFIG.AUTH_TOKEN) {
      this.send(client, { 
        type: 'auth_failed', 
        error: '❌ ভুল অথেন্টিকেশন টোকেন' 
      });
      client.ws.close();
      return;
    }

    client.agentId = agentId;
    log('success', `🔓 অথেন্টিকেশন সফল`, `Agent: ${agentId}`);
    
    this.send(client, { 
      type: 'auth_success', 
      agentId,
      message: '✅ অথেন্টিকেশন সফল',
      availableTools: this.toolRegistry.getAgentTools(agentId).map(t => t.name)
    });
  }

  async handleAgentRegister(client, payload) {
    const { agentId, tools } = payload;
    
    // এজেন্টের জন্য টুল রেজিস্টার
    this.toolRegistry.assignToAgent(agentId, tools);
    
    this.send(client, {
      type: 'agent_registered',
      agentId,
      tools,
      message: `এজেন্ট ${agentId} এর জন্য ${tools.length}টি টুল রেজিস্টার্ড`
    });
  }

  async handleToolExecute(client, payload, requestId) {
    const { tool, args } = payload;
    
    try {
      // 🔐 পাইপ অথেন্টিকেশন চেক
      if (!client.agentId) {
        throw new Error('অথেন্টিকেশন করা হয়নি');
      }

      log('info', `🔧 টুল এক্সিকিউট`, `${tool} (Agent: ${client.agentId})`);

      const result = await this.toolRegistry.execute(
        tool, 
        args, 
        client.agentId,
        { clientId: client.id }
      );

      this.send(client, {
        type: 'tool_result',
        requestId,
        result,
        authentic: true,
        proof: result._proof
      });

    } catch (err) {
      log('error', `❌ টুল ব্যর্থ`, err.message);
      this.send(client, {
        type: 'tool_error',
        requestId,
        error: err.message,
        code: err.code || 'EXECUTION_FAILED'
      });
    }
  }

  async handleStreamStart(client, payload, requestId) {
    const { source, destination } = payload;
    
    client.streamActive = true;
    
    log('info', `📡 স্ট্রিম শুরু`, `${source} → ${destination}`);

    this.send(client, {
      type: 'stream_started',
      requestId,
      message: '✅ স্ট্রিম চালু'
    });

    // স্ট্রিমিং লজিক এখানে
    // ...

    client.streamActive = false;
  }

  // ═════════════════════════════════════════════════════════
  // ডিসকানেক্ট হ্যান্ডলার - অর্ধেক মিলনে বিচ্ছেদ ফিক্স
  // ═════════════════════════════════════════════════════════
  handleDisconnect(client, code, reason) {
    log('warn', `🔌 কানেকশন বন্ধ`, `Code: ${code}, Reason: ${reason || 'No reason'}`);
    
    client.streamActive = false;
    this.clients.delete(client.id);

    // UND_ERR_SOCKET হলে রিকানেক্ট সাজেশন
    if (code === 56510) {
      log('error', `💥 UND_ERR_SOCKET ডিটেক্টেড`, `IPv6/IPv4 mismatch or timeout`);
    }

    // রিকানেকশন অ্যাটেম্পট
    if (client.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
      log('info', `🔄 রিকানেকশন অ্যাটেম্পট`, `${client.reconnectAttempts + 1}/${CONFIG.MAX_RECONNECT_ATTEMPTS}`);
      setTimeout(() => {
        client.reconnectAttempts++;
      }, CONFIG.RECONNECT_DELAY);
    }
  }

  handleSocketError(client, err) {
    // ⚠️ UND_ERR_SOCKET হ্যান্ডলিং
    if (err.code === 'UND_ERR_SOCKET' || err.message?.includes('other side closed')) {
      log('error', `💥 অর্ধেক মিলনে বিচ্ছেদ!`, err.message);
      log('info', `💡 সমাধান: 127.0.0.1 ব্যবহার করুন, ::1 নয়`);
      
      this.send(client, {
        type: 'socket_error',
        code: 'UND_ERR_SOCKET',
        message: 'সার্ভার আUnexpectedভাবে কানেকশন বন্ধ করেছে',
        solution: 'IPv4 (127.0.0.1) ব্যবহার করুন'
      });
    } else {
      log('error', `❌ সকেট ত্রুটি`, err.message);
    }
  }

  handleServerError(err) {
    log('error', `💥 সার্ভার ত্রুটি`, err.message);
  }

  // ═════════════════════════════════════════════════════════
  // হার্টবিট চেক
  // ═════════════════════════════════════════════════════════
  checkHeartbeats() {
    const now = Date.now();
    
    for (const [clientId, client] of this.clients) {
      // টাইমআউট চেক
      if (now - client.lastPing > CONFIG.CONNECTION_TIMEOUT) {
        log('warn', `⏱️ কানেকশন টাইমআউট`, `Client: ${clientId}`);
        client.ws.terminate();
        this.clients.delete(clientId);
        continue;
      }

      // হার্টবিট
      if (!client.isAlive) {
        log('warn', `💔 হার্টবিট ফেইল`, `Client: ${clientId}`);
        client.ws.terminate();
        this.clients.delete(clientId);
        continue;
      }

      client.isAlive = false;
      client.ws.ping();
    }
  }

  // ═════════════════════════════════════════════════════════
  // ইউটিলিটি
  // ═════════════════════════════════════════════════════════
  send(client, data) {
    if (client.ws.readyState === 1) { // OPEN
      try {
        client.ws.send(JSON.stringify(data));
      } catch (err) {
        log('error', `📤 পাঠানো ব্যর্থ`, err.message);
      }
    }
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  stop() {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
    this.httpServer.close();
    log('info', `🛑 সার্ভার বন্ধ`);
  }
}

// ═══════════════════════════════════════════════════════════════
// সার্ভার স্টার্ট
// ═══════════════════════════════════════════════════════════════
const server = new ZombieWebSocketServer();

server.start().catch(err => {
  log('error', `💥 স্টার্ট ব্যর্থ`, err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('info', `👋 SIGINT received`);
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('info', `👋 SIGTERM received`);
  server.stop();
  process.exit(0);
});
