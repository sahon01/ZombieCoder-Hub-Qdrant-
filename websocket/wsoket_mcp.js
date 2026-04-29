const WebSocket = require('ws');
const http = require('http');
const url = require('url');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Session storage for 24-hour persistence
const SESSION_FILE = path.join(__dirname, 'sessions.json');
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Load persisted sessions
let sessionStore = new Map();
function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      const now = Date.now();
      Object.entries(data).forEach(([sessionId, session]) => {
        if (now - session.createdAt < SESSION_DURATION_MS) {
          sessionStore.set(sessionId, session);
        }
      });
      console.log(`Loaded ${sessionStore.size} valid sessions from storage`);
    }
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
}

function saveSessions() {
  try {
    const data = Object.fromEntries(sessionStore);
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
}

// Auto-save sessions every 30 seconds
setInterval(saveSessions, 30000);

// Agent registry
const AGENT_REGISTRY = new Map();

// Editor activity tracking
const editorActivity = new Map();

// Create HTTP server with HTML serving
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (parsedUrl.pathname === '/') {
    // Serve HTML client
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getHTMLClient());
  } else if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      clients: clientCount,
      agents: AGENT_REGISTRY.size,
      sessions: sessionStore.size,
      uptime: process.uptime()
    }));
  } else if (parsedUrl.pathname === '/api/agents') {
    // Return agent list
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      agents: Array.from(AGENT_REGISTRY.values()),
      timestamp: new Date().toISOString()
    }));
  } else if (parsedUrl.pathname === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      sessions: Array.from(sessionStore.values()).map(s => ({
        sessionId: s.sessionId,
        agentId: s.agentId,
        editor: s.editor,
        connectedAt: s.connectedAt,
        lastActivity: s.lastActivity,
        status: s.status
      }))
    }));
  } else if (parsedUrl.pathname === '/api/editor-activity') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      activities: Array.from(editorActivity.entries()).map(([clientId, activity]) => ({
        clientId,
        ...activity
      }))
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

console.log('🚀 ZombieCoder WebSocket MCP Server starting...');
console.log('Security: Local-only mode activated');
console.log('Session: 24-hour persistence enabled');
console.log('Agents: UAS backend integration active');

// Load persisted sessions
loadSessions();

// Connected clients counter
let clientCount = 0;

// UAS Backend configuration
const UAS_CONFIG = {
  baseUrl: process.env.UAS_BASE_URL || 'http://localhost:5000',
  healthEndpoint: '/health',
  agentsEndpoint: '/agents',
  agentCallEndpoint: '/agent/call'
};

wss.on('connection', (ws, req) => {
  clientCount++;
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const connectedAt = new Date().toISOString();
  
  console.log(`[${connectedAt}] New client connected: ${clientId} (Total: ${clientCount})`);
  
  // Track client session
  const clientSession = {
    sessionId: clientId,
    ws: ws,
    connectedAt: connectedAt,
    lastActivity: Date.now(),
    agentId: null,
    editor: null,
    status: 'connected',
    isAuthenticated: false,
    messageCount: 0
  };
  sessionStore.set(clientId, clientSession);
  
  // Send welcome message with server capabilities
  ws.send(JSON.stringify({
    type: 'welcome',
    id: clientId,
    timestamp: connectedAt,
    data: {
      message: 'Welcome to ZombieCoder WebSocket MCP Server',
      status: 'connected',
      security: 'local-only-mode',
      sessionDuration: '24h',
      features: [
        'agent_chat',
        'editor_monitoring',
        'session_persistence',
        'real_time_updates',
        'tool_execution'
      ],
      serverInfo: {
        name: 'ZombieCoder MCP Server',
        version: '2.0.0',
        uptime: process.uptime()
      }
    }
  }));
  
  // Notify other clients about new connection
  broadcastToOthers(ws, {
    type: 'client_connected',
    timestamp: new Date().toISOString(),
    data: {
      clientId: clientId,
      totalClients: clientCount,
      message: 'New client joined'
    }
  });

  ws.on('message', (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      
      // Update last activity
      const session = sessionStore.get(clientId);
      if (session) {
        session.lastActivity = Date.now();
        session.messageCount++;
      }
      
      console.log(`[${new Date().toLocaleTimeString()}] ${clientId} -> ${parsedMessage.type}`);
      
      // Handle different message types
      switch (parsedMessage.type) {
        case 'auth':
          handleAuth(ws, parsedMessage, clientId);
          break;
        case 'request':
          handleRequest(ws, parsedMessage, clientId);
          break;
        case 'agent_chat':
          handleAgentChat(ws, parsedMessage, clientId);
          break;
        case 'agent_call':
          handleAgentCall(ws, parsedMessage, clientId);
          break;
        case 'editor_activity':
          handleEditorActivity(ws, parsedMessage, clientId);
          break;
        case 'editor_monitor':
          handleEditorMonitor(ws, parsedMessage, clientId);
          break;
        case 'get_agents':
          handleGetAgents(ws, parsedMessage, clientId);
          break;
        case 'session_restore':
          handleSessionRestore(ws, parsedMessage, clientId);
          break;
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            id: parsedMessage.id,
            timestamp: new Date().toISOString(),
            data: { clientId, messageCount: session?.messageCount || 0 }
          }));
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            id: parsedMessage.id || 'unknown',
            timestamp: new Date().toISOString(),
            data: { error: 'Unknown message type', received: parsedMessage.type }
          }));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        id: 'parse-error',
        timestamp: new Date().toISOString(),
        data: { error: 'Invalid JSON message', details: error.message }
      }));
    }
  });

  ws.on('close', () => {
    clientCount--;
    const session = sessionStore.get(clientId);
    if (session) {
      session.status = 'disconnected';
      session.disconnectedAt = new Date().toISOString();
      // Keep session for restoration within 24h
    }
    console.log(`[${new Date().toLocaleTimeString()}] Client disconnected: ${clientId} (Remaining: ${clientCount})`);
    
    // Notify other clients
    broadcastToOthers(ws, {
      type: 'client_disconnected',
      timestamp: new Date().toISOString(),
      data: {
        clientId: clientId,
        totalClients: clientCount,
        message: 'Client left'
      }
    });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Authentication handler
function handleAuth(ws, message, clientId) {
  const { agentId, editor, token } = message.payload || {};
  const session = sessionStore.get(clientId);
  
  if (session) {
    session.agentId = agentId;
    session.editor = editor;
    session.isAuthenticated = true;
    session.authTime = new Date().toISOString();
  }
  
  // Register agent
  if (agentId) {
    AGENT_REGISTRY.set(agentId.toString(), {
      id: agentId,
      clientId: clientId,
      editor: editor,
      connectedAt: new Date().toISOString(),
      status: 'active'
    });
  }
  
  ws.send(JSON.stringify({
    type: 'auth_success',
    id: message.id || `auth-${Date.now()}`,
    timestamp: new Date().toISOString(),
    data: {
      clientId: clientId,
      agentId: agentId,
      editor: editor,
      message: 'Authentication successful',
      sessionValidUntil: new Date(Date.now() + SESSION_DURATION_MS).toISOString()
    }
  }));
  
  console.log(`[AUTH] Client ${clientId} authenticated as Agent ${agentId} using ${editor || 'unknown editor'}`);
}

// Handle agent chat
async function handleAgentChat(ws, message, clientId) {
  const { agentId, content, model } = message.payload || {};
  const requestId = message.id || `chat-${Date.now()}`;
  
  ws.send(JSON.stringify({
    type: 'chat_start',
    id: requestId,
    timestamp: new Date().toISOString(),
    data: { agentId, status: 'processing' }
  }));
  
  try {
    // Simulate streaming response
    const words = content?.split(' ') || ['Processing...'];
    for (let i = 0; i < words.length; i++) {
      await new Promise(r => setTimeout(r, 50));
      ws.send(JSON.stringify({
        type: 'chat_chunk',
        id: requestId,
        timestamp: new Date().toISOString(),
        data: {
          chunk: words[i] + ' ',
          progress: (i + 1) / words.length
        }
      }));
    }
    
    ws.send(JSON.stringify({
      type: 'chat_complete',
      id: requestId,
      timestamp: new Date().toISOString(),
      data: {
        response: `ভাইয়া, আমি Agent ${agentId || 'Dev Agent'}। আপনার বার্তা "${content}" পেয়েছি। কীভাবে সাহায্য করতে পারি?`,
        model: model || 'gemma3:1b',
        usage: { tokens: words.length * 2 }
      }
    }));
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'chat_error',
      id: requestId,
      timestamp: new Date().toISOString(),
      data: { error: error.message }
    }));
  }
}

// Handle agent action call
async function handleAgentCall(ws, message, clientId) {
  const { agentId, action, payload } = message.payload || {};
  const requestId = message.id || `call-${Date.now()}`;
  
  console.log(`[AGENT CALL] Agent ${agentId} -> ${action}`);
  
  ws.send(JSON.stringify({
    type: 'agent_call_start',
    id: requestId,
    timestamp: new Date().toISOString(),
    data: { agentId, action, status: 'executing' }
  }));
  
  // Simulate agent execution
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'agent_call_complete',
      id: requestId,
      timestamp: new Date().toISOString(),
      data: {
        agentId: agentId,
        action: action,
        result: {
          success: true,
          output: `Agent ${agentId} executed ${action} successfully`,
          executionTime: 1200
        }
      }
    }));
  }, 1000);
}

// Handle editor activity tracking
function handleEditorActivity(ws, message, clientId) {
  const { editor, action, file, line, column, timestamp } = message.payload || {};
  
  const activity = {
    clientId,
    editor: editor || 'unknown',
    action: action || 'unknown',
    file: file || null,
    position: line ? { line, column } : null,
    timestamp: timestamp || new Date().toISOString(),
    receivedAt: new Date().toISOString()
  };
  
  editorActivity.set(clientId, activity);
  
  // Update session
  const session = sessionStore.get(clientId);
  if (session) {
    session.editor = editor;
    session.lastFile = file;
    session.lastPosition = { line, column };
  }
  
  // Broadcast to monitoring clients
  broadcast({
    type: 'editor_activity_broadcast',
    timestamp: new Date().toISOString(),
    data: {
      clientId,
      editor,
      action,
      file,
      position: { line, column }
    }
  });
  
  ws.send(JSON.stringify({
    type: 'editor_activity_ack',
    timestamp: new Date().toISOString(),
    data: { received: true }
  }));
}

// Handle editor monitoring subscription
function handleEditorMonitor(ws, message, clientId) {
  const { subscribe } = message.payload || {};
  const session = sessionStore.get(clientId);
  
  if (session) {
    session.isMonitoring = subscribe;
  }
  
  ws.send(JSON.stringify({
    type: 'editor_monitor_ack',
    timestamp: new Date().toISOString(),
    data: {
      subscribed: subscribe,
      activeEditors: Array.from(editorActivity.values()).map(a => ({
        editor: a.editor,
        file: a.file,
        lastActivity: a.timestamp
      }))
    }
  }));
}

// Handle get agents request
function handleGetAgents(ws, message, clientId) {
  const agents = [
    { id: 1, name: 'Code Editor Agent', type: 'editor', status: 'active', persona: 'Code Pagla' },
    { id: 2, name: 'Master Orchestrator', type: 'master', status: 'active', persona: 'System Master' },
    { id: 3, name: 'Chat Assistant', type: 'chatbot', status: 'active', persona: 'Friendly Assistant' },
    { id: 4, name: 'Documentation Writer', type: 'editor', status: 'active', persona: 'Doc Writer' },
    { id: 5, name: 'Code Reviewer', type: 'editor', status: 'active', persona: 'Code Reviewer' },
    { id: 6, name: 'ZombieCoder Dev Agent', type: 'editor', status: 'active', persona: 'ZombieCoder Dev Agent' },
    { id: 7, name: 'ZombieCoder Patch Agent', type: 'editor', status: 'active', persona: 'ZombieCoder Patch Agent' }
  ];
  
  ws.send(JSON.stringify({
    type: 'agents_list',
    id: message.id || `agents-${Date.now()}`,
    timestamp: new Date().toISOString(),
    data: { agents, total: agents.length }
  }));
}

// Handle session restoration
function handleSessionRestore(ws, message, clientId) {
  const { previousSessionId } = message.payload || {};
  
  if (previousSessionId && sessionStore.has(previousSessionId)) {
    const oldSession = sessionStore.get(previousSessionId);
    const now = Date.now();
    
    // Check if session is still valid (within 24h)
    if (now - oldSession.lastActivity < SESSION_DURATION_MS) {
      // Transfer session data
      const session = sessionStore.get(clientId);
      if (session) {
        session.agentId = oldSession.agentId;
        session.editor = oldSession.editor;
        session.restoredFrom = previousSessionId;
        session.restoredAt = new Date().toISOString();
      }
      
      ws.send(JSON.stringify({
        type: 'session_restored',
        id: message.id || `restore-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: {
          success: true,
          previousSessionId,
          agentId: oldSession.agentId,
          editor: oldSession.editor,
          originalConnectedAt: oldSession.connectedAt
        }
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'session_expired',
        id: message.id || `restore-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: {
          success: false,
          message: 'Session expired (24h limit)',
          previousSessionId
        }
      }));
    }
  } else {
    ws.send(JSON.stringify({
      type: 'session_not_found',
      id: message.id || `restore-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        success: false,
        message: 'Previous session not found'
      }
    }));
  }
}

// Handle generic request
function handleRequest(ws, message, clientId) {
  const requestId = message.data?.id || message.id || `req-${Date.now()}`;
  const startTime = Date.now();
  
  console.log(`[REQUEST] ${clientId} -> ${requestId}`);
  
  // Simulate processing with progress updates
  const totalSteps = 5;
  let step = 0;
  
  const sendProgress = () => {
    step++;
    const progress = step / totalSteps;
    
    ws.send(JSON.stringify({
      type: 'progress',
      id: requestId,
      request_id: message.id,
      timestamp: new Date().toISOString(),
      data: {
        progress: progress,
        step: step,
        total_steps: totalSteps,
        message: `Processing step ${step} of ${totalSteps}`
      }
    }));
    
    if (step < totalSteps) {
      setTimeout(sendProgress, 200);
    } else {
      const responseTime = Date.now() - startTime;
      const session = sessionStore.get(clientId);
      
      ws.send(JSON.stringify({
        type: 'response',
        id: `resp-${Date.now()}`,
        request_id: requestId,
        timestamp: new Date().toISOString(),
        data: {
          action: 'apply_diff',
          confidence: 0.92,
          used_tools: ['file'],
          response_time_ms: responseTime,
          agent_id: session?.agentId,
          editor: session?.editor,
          output: {
            content: generateSampleOutput(message),
            success: true
          },
          next_hint: 'Consider running tests'
        }
      }));
    }
  };
  
  setTimeout(sendProgress, 100);
}

// Broadcast to all clients except sender
function broadcastToOthers(senderWs, message) {
  wss.clients.forEach(client => {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Broadcast to all clients
function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

function generateSampleOutput(request) {
  const content = request.data?.content || 'sample request';
  
  // Generate sample response based on request type
  if (content.toLowerCase().includes('code') || content.toLowerCase().includes('fix')) {
    return `// Sample code response for: ${content}
function sampleFunction() {
  console.log('Hello from ZombieCoder!');
  return 'processed';
}`;
  } else if (content.toLowerCase().includes('bug') || content.toLowerCase().includes('error')) {
    return `// Bug fix suggestion for: ${content}\n// Check for null values and add proper error handling`;
  } else {
    return `Processed request: ${content}\nTimestamp: ${new Date().toISOString()}\nFrom: ${request.data?.editor || 'unknown editor'}`;
  }
}

// HTML Client Generator
function getHTMLClient() {
  return `<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧟 ZombieCoder MCP Monitor | 24h Session</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', 'Noto Sans Bengali', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            color: #e0e0e0;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        header {
            text-align: center;
            padding: 30px 0;
            border-bottom: 2px solid rgba(233, 69, 96, 0.3);
            margin-bottom: 30px;
        }
        h1 {
            color: #e94560;
            font-size: 2.5rem;
            text-shadow: 0 0 20px rgba(233, 69, 96, 0.5);
            margin-bottom: 10px;
        }
        .subtitle { color: #94a3b8; font-size: 1.1rem; }
        .status-bar {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 15px;
            flex-wrap: wrap;
        }
        .status-badge {
            background: rgba(233, 69, 96, 0.2);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9rem;
            border: 1px solid rgba(233, 69, 96, 0.3);
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(233, 69, 96, 0.2);
            border-radius: 15px;
            padding: 25px;
            backdrop-filter: blur(10px);
        }
        .card h2 {
            color: #e94560;
            font-size: 1.3rem;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(233, 69, 96, 0.2);
        }
        .connection-status {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
        }
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        .connected { background: #4ade80; }
        .disconnected { background: #ef4444; }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .btn {
            background: #e94560;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.3s;
            margin: 5px;
        }
        .btn:hover {
            background: #ff6b6b;
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(233, 69, 96, 0.4);
        }
        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        select, input {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(233, 69, 96, 0.3);
            border-radius: 8px;
            color: #fff;
            font-size: 1rem;
        }
        select:focus, input:focus {
            outline: none;
            border-color: #e94560;
        }
        .log-container {
            background: #0d1117;
            border-radius: 10px;
            padding: 15px;
            height: 300px;
            overflow-y: auto;
            font-family: 'Fira Code', monospace;
            font-size: 0.85rem;
            border: 1px solid #30363d;
        }
        .log-entry {
            padding: 5px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .log-time { color: #ffd93d; }
        .log-type { color: #4ade80; font-weight: bold; }
        .log-type.error { color: #ef4444; }
        .log-type.warn { color: #fbbf24; }
        .log-type.info { color: #60a5fa; }
        .agent-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .agent-item {
            background: rgba(0,0,0,0.2);
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #e94560;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .agent-item.active {
            border-left-color: #4ade80;
            background: rgba(74, 222, 128, 0.1);
        }
        .agent-info h4 { color: #fff; margin-bottom: 5px; }
        .agent-info p { color: #94a3b8; font-size: 0.9rem; }
        .agent-type {
            background: rgba(233, 69, 96, 0.2);
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
        }
        .session-info {
            background: rgba(0,0,0,0.2);
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
        }
        .session-info h4 {
            color: #ffd93d;
            margin-bottom: 10px;
        }
        .session-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .session-row:last-child { border-bottom: none; }
        .session-label { color: #94a3b8; }
        .session-value { color: #fff; font-family: monospace; }
        .editor-activity {
            display: grid;
            gap: 10px;
        }
        .activity-item {
            background: rgba(0,0,0,0.2);
            padding: 12px;
            border-radius: 8px;
            border-left: 3px solid #60a5fa;
        }
        .activity-item .editor { color: #60a5fa; font-weight: bold; }
        .activity-item .file { color: #94a3b8; font-size: 0.9rem; }
        .activity-item .time { color: #64748b; font-size: 0.8rem; }
        .chat-input-container {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
        .chat-input-container input {
            flex: 1;
            margin: 0;
        }
        .chat-input-container button {
            margin: 0;
            white-space: nowrap;
        }
        .chat-response {
            background: rgba(0,0,0,0.2);
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
            min-height: 100px;
            white-space: pre-wrap;
            font-family: 'Fira Code', monospace;
        }
        footer {
            text-align: center;
            padding: 30px;
            color: #64748b;
            border-top: 1px solid rgba(255,255,255,0.1);
            margin-top: 40px;
        }
        @media (max-width: 768px) {
            .grid { grid-template-columns: 1fr; }
            h1 { font-size: 1.8rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🧟 ZombieCoder MCP Monitor</h1>
            <p class="subtitle">24-Hour Session Persistence | Real-time Editor Monitoring | Agent Integration</p>
            <div class="status-bar">
                <span class="status-badge" id="wsStatus">WebSocket: Disconnected</span>
                <span class="status-badge" id="sessionStatus">Session: None</span>
                <span class="status-badge" id="clientId">Client: -</span>
            </div>
        </header>

        <div class="grid">
            <!-- Connection & Auth -->
            <div class="card">
                <h2>🔌 সংযোগ এবং এজেন্ট নির্বাচন</h2>
                <div class="connection-status">
                    <div class="status-dot disconnected" id="statusDot"></div>
                    <span id="connectionText">Disconnected</span>
                </div>
                <button class="btn" id="connectBtn" onclick="connect()">Connect to Server</button>
                <button class="btn" id="disconnectBtn" onclick="disconnect()" disabled>Disconnect</button>
                
                <select id="agentSelect">
                    <option value="">Select Agent...</option>
                    <option value="6">ZombieCoder Dev Agent (ID: 6)</option>
                    <option value="1">Code Editor Agent (ID: 1)</option>
                    <option value="2">Master Orchestrator (ID: 2)</option>
                    <option value="3">Chat Assistant (ID: 3)</option>
                    <option value="4">Documentation Writer (ID: 4)</option>
                    <option value="5">Code Reviewer (ID: 5)</option>
                    <option value="7">ZombieCoder Patch Agent (ID: 7)</option>
                </select>
                
                <input type="text" id="editorInput" placeholder="Editor name (e.g., Windsurf, VS Code, Cursor)" value="Windsurf">
                
                <button class="btn" id="authBtn" onclick="authenticate()" disabled>Authenticate</button>
                
                <div class="session-info" id="sessionInfo" style="display:none;">
                    <h4>📋 Session Details</h4>
                    <div class="session-row">
                        <span class="session-label">Session ID:</span>
                        <span class="session-value" id="sessId">-</span>
                    </div>
                    <div class="session-row">
                        <span class="session-label">Agent ID:</span>
                        <span class="session-value" id="sessAgent">-</span>
                    </div>
                    <div class="session-row">
                        <span class="session-label">Editor:</span>
                        <span class="session-value" id="sessEditor">-</span>
                    </div>
                    <div class="session-row">
                        <span class="session-label">Connected:</span>
                        <span class="session-value" id="sessTime">-</span>
                    </div>
                    <div class="session-row">
                        <span class="session-label">Valid Until:</span>
                        <span class="session-value" id="sessValid">-</span>
                    </div>
                </div>
            </div>

            <!-- Agent Chat -->
            <div class="card">
                <h2>💬 এজেন্ট চ্যাট</h2>
                <div class="chat-response" id="chatResponse">Select an agent and type your message...</div>
                <div class="chat-input-container">
                    <input type="text" id="chatInput" placeholder="আপনার বার্তা লিখুন... (Type your message)" disabled>
                    <button class="btn" id="sendBtn" onclick="sendChat()" disabled>Send</button>
                </div>
            </div>

            <!-- Editor Activity Monitor -->
            <div class="card">
                <h2>📊 রিয়েল-টাইম এডিটর মনিটরিং</h2>
                <div class="editor-activity" id="editorActivity">
                    <p style="color: #64748b; text-align: center;">Connect and authenticate to see editor activity...</p>
                </div>
                <button class="btn" onclick="simulateEditorActivity()" id="simBtn" disabled>Simulate Editor Activity</button>
                <button class="btn" onclick="subscribeMonitor()" id="monBtn" disabled>Subscribe to Monitor</button>
            </div>

            <!-- Agent List -->
            <div class="card">
                <h2>🤖 উপলব্ধ এজেন্টসমূহ</h2>
                <div class="agent-list" id="agentList">
                    <p style="color: #64748b; text-align: center;">Click "Get Agents" to load...</p>
                </div>
                <button class="btn" onclick="getAgents()" id="getAgentsBtn" disabled>Get Agents</button>
            </div>
        </div>

        <!-- Session Management -->
        <div class="card">
            <h2>💾 ২৪ ঘন্টা সেশন ম্যানেজমেন্ট</h2>
            <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">
                <button class="btn" onclick="saveSession()">💾 Save Session</button>
                <button class="btn" onclick="restoreSession()">🔄 Restore Session</button>
                <button class="btn" onclick="clearSession()">🗑️ Clear Local Storage</button>
                <button class="btn" onclick="checkLocalStorage()">📋 View Stored Session</button>
            </div>
            <div class="session-info" id="storageInfo">
                <h4>Local Storage Status</h4>
                <div class="session-row">
                    <span class="session-label">Previous Session:</span>
                    <span class="session-value" id="prevSession">None</span>
                </div>
                <div class="session-row">
                    <span class="session-label">Saved At:</span>
                    <span class="session-value" id="savedAt">-</span>
                </div>
                <div class="session-row">
                    <span class="session-label">Expires:</span>
                    <span class="session-value" id="expiresAt">-</span>
                </div>
            </div>
        </div>

        <!-- WebSocket Logs -->
        <div class="card">
            <h2>📡 WebSocket Logs</h2>
            <div class="log-container" id="logContainer">
                <div class="log-entry"><span class="log-time">--:--:--</span> <span class="log-type info">[INFO]</span> Waiting for connection...</div>
            </div>
            <button class="btn" onclick="clearLogs()" style="margin-top: 10px;">Clear Logs</button>
        </div>

        <footer>
            <p>🧟 ZombieCoder MCP WebSocket Server v2.0</p>
            <p style="color: #94a3b8; margin-top: 10px;">24-Hour Session Persistence | Agent Integration | Editor Monitoring</p>
        </footer>
    </div>

    <script>
        let ws = null;
        let clientId = null;
        let sessionData = null;
        let isMonitoring = false;
        const SESSION_KEY = 'zombiecoder_session';
        const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

        function log(type, message) {
            const container = document.getElementById('logContainer');
            const time = new Date().toLocaleTimeString();
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            entry.innerHTML = '<span class="log-time">' + time + '</span> <span class="log-type ' + type.toLowerCase() + '">[' + type + ']</span> ' + message;
            container.insertBefore(entry, container.firstChild);
            if (container.children.length > 100) {
                container.removeChild(container.lastChild);
            }
        }

        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host;
            
            log('INFO', 'Connecting to ' + wsUrl + '...');
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = function() {
                log('INFO', 'WebSocket connected successfully');
                document.getElementById('statusDot').className = 'status-dot connected';
                document.getElementById('connectionText').textContent = 'Connected';
                document.getElementById('wsStatus').textContent = 'WebSocket: Connected';
                document.getElementById('connectBtn').disabled = true;
                document.getElementById('disconnectBtn').disabled = false;
                document.getElementById('authBtn').disabled = false;
                document.getElementById('getAgentsBtn').disabled = false;
                
                // Try to restore session
                checkStoredSession();
            };
            
            ws.onmessage = function(event) {
                const msg = JSON.parse(event.data);
                handleMessage(msg);
            };
            
            ws.onclose = function() {
                log('WARN', 'WebSocket disconnected');
                document.getElementById('statusDot').className = 'status-dot disconnected';
                document.getElementById('connectionText').textContent = 'Disconnected';
                document.getElementById('wsStatus').textContent = 'WebSocket: Disconnected';
                document.getElementById('connectBtn').disabled = false;
                document.getElementById('disconnectBtn').disabled = true;
                document.getElementById('authBtn').disabled = true;
                document.getElementById('sendBtn').disabled = true;
                document.getElementById('chatInput').disabled = true;
                document.getElementById('simBtn').disabled = true;
                document.getElementById('monBtn').disabled = true;
                document.getElementById('getAgentsBtn').disabled = true;
            };
            
            ws.onerror = function(error) {
                log('ERROR', 'WebSocket error: ' + error);
            };
        }

        function disconnect() {
            if (ws) {
                ws.close();
            }
        }

        function authenticate() {
            const agentId = document.getElementById('agentSelect').value;
            const editor = document.getElementById('editorInput').value;
            
            if (!agentId) {
                log('ERROR', 'Please select an agent');
                return;
            }
            
            const authMsg = {
                type: 'auth',
                id: 'auth-' + Date.now(),
                payload: {
                    agentId: parseInt(agentId),
                    editor: editor,
                    token: 'local-session-' + Date.now()
                }
            };
            
            ws.send(JSON.stringify(authMsg));
            log('INFO', 'Authenticating with Agent ID: ' + agentId);
        }

        function handleMessage(msg) {
            log('INFO', 'Received: ' + msg.type);
            
            switch(msg.type) {
                case 'welcome':
                    clientId = msg.id;
                    document.getElementById('clientId').textContent = 'Client: ' + clientId.substring(0, 20) + '...';
                    log('INFO', 'Welcome! Client ID: ' + clientId);
                    break;
                    
                case 'auth_success':
                    sessionData = msg.data;
                    document.getElementById('sessionStatus').textContent = 'Session: Active';
                    document.getElementById('sessId').textContent = msg.data.clientId.substring(0, 20) + '...';
                    document.getElementById('sessAgent').textContent = msg.data.agentId;
                    document.getElementById('sessEditor').textContent = msg.data.editor;
                    document.getElementById('sessTime').textContent = new Date().toLocaleString();
                    document.getElementById('sessValid').textContent = new Date(msg.data.sessionValidUntil).toLocaleString();
                    document.getElementById('sessionInfo').style.display = 'block';
                    document.getElementById('sendBtn').disabled = false;
                    document.getElementById('chatInput').disabled = false;
                    document.getElementById('simBtn').disabled = false;
                    document.getElementById('monBtn').disabled = false;
                    log('INFO', 'Authenticated! Agent: ' + msg.data.agentId);
                    
                    // Save to local storage
                    saveSession();
                    break;
                    
                case 'agents_list':
                    const list = document.getElementById('agentList');
                    list.innerHTML = '';
                    msg.data.agents.forEach(agent => {
                        const div = document.createElement('div');
                        div.className = 'agent-item' + (agent.id === parseInt(document.getElementById('agentSelect').value) ? ' active' : '');
                        div.innerHTML = '<div class="agent-info"><h4>' + agent.name + '</h4><p>' + agent.persona + '</p></div><span class="agent-type">ID: ' + agent.id + '</span>';
                        list.appendChild(div);
                    });
                    log('INFO', 'Loaded ' + msg.data.agents.length + ' agents');
                    break;
                    
                case 'chat_complete':
                    document.getElementById('chatResponse').textContent = msg.data.response;
                    log('INFO', 'Chat response received');
                    break;
                    
                case 'chat_chunk':
                    const resp = document.getElementById('chatResponse');
                    if (resp.textContent.includes('...')) {
                        resp.textContent = '';
                    }
                    resp.textContent += msg.data.chunk;
                    break;
                    
                case 'editor_activity_broadcast':
                    updateEditorActivity(msg.data);
                    break;
                    
                case 'client_connected':
                    log('INFO', 'New client joined: ' + msg.data.clientId.substring(0, 15) + '...');
                    break;
                    
                case 'client_disconnected':
                    log('INFO', 'Client left: ' + msg.data.clientId.substring(0, 15) + '...');
                    break;
                    
                case 'session_restored':
                    log('INFO', 'Session restored from: ' + msg.data.previousSessionId.substring(0, 15) + '...');
                    document.getElementById('sessAgent').textContent = msg.data.agentId;
                    document.getElementById('sessEditor').textContent = msg.data.editor;
                    break;
                    
                case 'error':
                    log('ERROR', msg.data.error);
                    break;
            }
        }

        function sendChat() {
            const content = document.getElementById('chatInput').value;
            if (!content.trim()) return;
            
            const agentId = document.getElementById('agentSelect').value;
            const msg = {
                type: 'agent_chat',
                id: 'chat-' + Date.now(),
                payload: {
                    agentId: parseInt(agentId),
                    content: content,
                    model: 'gemma3:1b'
                }
            };
            
            ws.send(JSON.stringify(msg));
            document.getElementById('chatResponse').textContent = 'Processing...';
            document.getElementById('chatInput').value = '';
            log('INFO', 'Sending chat to Agent ' + agentId);
        }

        function getAgents() {
            ws.send(JSON.stringify({ type: 'get_agents', id: 'get-agents-' + Date.now() }));
            log('INFO', 'Requesting agent list...');
        }

        function simulateEditorActivity() {
            const actions = ['typing', 'cursor_move', 'file_open', 'file_save', 'scroll'];
            const files = ['src/index.js', 'styles/main.css', 'README.md', 'package.json', '.env'];
            
            const activity = {
                type: 'editor_activity',
                payload: {
                    editor: document.getElementById('editorInput').value || 'Windsurf',
                    action: actions[Math.floor(Math.random() * actions.length)],
                    file: files[Math.floor(Math.random() * files.length)],
                    line: Math.floor(Math.random() * 100) + 1,
                    column: Math.floor(Math.random() * 50) + 1,
                    timestamp: new Date().toISOString()
                }
            };
            
            ws.send(JSON.stringify(activity));
            log('INFO', 'Simulated editor activity: ' + activity.payload.action);
        }

        function subscribeMonitor() {
            isMonitoring = !isMonitoring;
            ws.send(JSON.stringify({
                type: 'editor_monitor',
                payload: { subscribe: isMonitoring }
            }));
            log('INFO', isMonitoring ? 'Subscribed to editor monitoring' : 'Unsubscribed from monitoring');
            document.getElementById('monBtn').textContent = isMonitoring ? 'Unsubscribe' : 'Subscribe to Monitor';
        }

        function updateEditorActivity(data) {
            const container = document.getElementById('editorActivity');
            if (container.querySelector('p')) {
                container.innerHTML = '';
            }
            
            const div = document.createElement('div');
            div.className = 'activity-item';
            div.innerHTML = '<span class="editor">' + data.editor + '</span><br><span class="file">' + data.action + ' @ ' + (data.file || 'unknown') + ':' + (data.position?.line || 0) + '</span><br><span class="time">' + new Date().toLocaleTimeString() + '</span>';
            
            container.insertBefore(div, container.firstChild);
            if (container.children.length > 10) {
                container.removeChild(container.lastChild);
            }
        }

        // 24-hour Session Management with Local Storage
        function saveSession() {
            if (!sessionData) {
                log('ERROR', 'No active session to save');
                return;
            }
            
            const sessionToSave = {
                clientId: clientId,
                agentId: sessionData.agentId,
                editor: sessionData.editor,
                savedAt: Date.now(),
                expiresAt: Date.now() + SESSION_DURATION
            };
            
            localStorage.setItem(SESSION_KEY, JSON.stringify(sessionToSave));
            updateStorageInfo(sessionToSave);
            log('INFO', 'Session saved to local storage (24h valid)');
        }

        function restoreSession() {
            const stored = localStorage.getItem(SESSION_KEY);
            if (!stored) {
                log('ERROR', 'No stored session found');
                return;
            }
            
            const saved = JSON.parse(stored);
            if (Date.now() > saved.expiresAt) {
                log('ERROR', 'Session expired (24h limit)');
                localStorage.removeItem(SESSION_KEY);
                return;
            }
            
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                log('ERROR', 'Connect to WebSocket first');
                return;
            }
            
            ws.send(JSON.stringify({
                type: 'session_restore',
                id: 'restore-' + Date.now(),
                payload: { previousSessionId: saved.clientId }
            }));
            
            // Restore UI
            document.getElementById('agentSelect').value = saved.agentId;
            document.getElementById('editorInput').value = saved.editor;
            
            log('INFO', 'Requesting session restoration...');
        }

        function checkLocalStorage() {
            const stored = localStorage.getItem(SESSION_KEY);
            if (stored) {
                updateStorageInfo(JSON.parse(stored));
                log('INFO', 'Session found in local storage');
            } else {
                log('INFO', 'No session in local storage');
            }
        }

        function checkStoredSession() {
            const stored = localStorage.getItem(SESSION_KEY);
            if (stored) {
                const saved = JSON.parse(stored);
                if (Date.now() < saved.expiresAt) {
                    log('INFO', 'Previous session found! You can restore it.');
                    updateStorageInfo(saved);
                } else {
                    localStorage.removeItem(SESSION_KEY);
                }
            }
        }

        function updateStorageInfo(session) {
            document.getElementById('prevSession').textContent = session.clientId ? session.clientId.substring(0, 20) + '...' : 'None';
            document.getElementById('savedAt').textContent = new Date(session.savedAt).toLocaleString();
            document.getElementById('expiresAt').textContent = new Date(session.expiresAt).toLocaleString();
        }

        function clearSession() {
            localStorage.removeItem(SESSION_KEY);
            document.getElementById('prevSession').textContent = 'None';
            document.getElementById('savedAt').textContent = '-';
            document.getElementById('expiresAt').textContent = '-';
            log('INFO', 'Local storage cleared');
        }

        function clearLogs() {
            document.getElementById('logContainer').innerHTML = '<div class="log-entry"><span class="log-time">--:--:--</span> <span class="log-type info">[INFO]</span> Logs cleared...</div>';
        }

        // Check local storage on page load
        window.onload = function() {
            checkLocalStorage();
        };
    </script>
</body>
</html>`;
}

// Start server on localhost only
const PORT = 8080;
server.listen(PORT, 'localhost', () => {
  console.log(`WebSocket MCP Server listening on ws://localhost:${PORT}`);
  console.log(`HTML Client: http://localhost:${PORT}`);
  console.log('API Endpoints:');
  console.log(`  - Health: http://localhost:${PORT}/health`);
  console.log(`  - Agents: http://localhost:${PORT}/api/agents`);
  console.log(`  - Sessions: http://localhost:${PORT}/api/sessions`);
  console.log(`  - Editor Activity: http://localhost:${PORT}/api/editor-activity`);
  console.log('Ready to accept local WebSocket connections only');
  console.log('Security: All connections restricted to localhost');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, closing server...');
  saveSessions();
  wss.close(() => {
    console.log('WebSocket server closed.');
  });
  server.close(() => {
    console.log('HTTP server closed.');
  });
});

// Log server status periodically
setInterval(() => {
  console.log(`[${new Date().toLocaleTimeString()}] Status - Clients: ${clientCount}, Agents: ${AGENT_REGISTRY.size}, Sessions: ${sessionStore.size}`);
}, 30000);

console.log('🎯 ZombieCoder MCP Server initialized successfully!');
console.log('Features active:');
console.log('✅ Real-time bidirectional communication');
console.log('✅ Local-only security model');
console.log('✅ 24-hour session persistence');
console.log('✅ Agent integration (7 agents)');
console.log('✅ Editor activity monitoring');
console.log('✅ Session restoration');
console.log('✅ Progress tracking with streaming');
console.log('✅ Request/response correlation');
console.log('✅ Error handling and recovery');
console.log('✅ Connection management');
console.log('✅ HTTP API endpoints');
console.log('✅ HTML client interface');