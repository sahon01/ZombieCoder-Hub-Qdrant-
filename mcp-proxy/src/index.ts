import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { rmSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

// Remove resources folder to disable widget mounting
const resourcesDir = fileURLToPath(new URL('../resources', import.meta.url))
if (existsSync(resourcesDir)) {
  try { rmSync(resourcesDir, { recursive: true, force: true }) } catch {}
}

function envBool(key: string, fallback = false): boolean {
  const raw = String(process.env[key] ?? '').trim().toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

const requireApiKey = envBool('MCP_PROXY_REQUIRE_API_KEY', true)

const uasBaseUrl = normalizeBaseUrl(
  String(process.env.UAS_BASE_URL || 'http://127.0.0.1:8000').trim()
)

const mcpBaseUrl = normalizeBaseUrl(
  String(process.env.MCP_PROXY_BASE_URL || 'http://127.0.0.1:5000').trim()
)

const uasApiKey = String(process.env.UAS_API_KEY || '').trim()

const server = new McpServer({
  name: 'zombiecoder-mcp-proxy',
  version: '0.1.0',
})

// Health check endpoint - will be set up separately with HTTP transport

async function uasFetch(path: string, init?: RequestInit): Promise<Response> {
  if (requireApiKey && !uasApiKey) {
    throw new Error('UAS_API_KEY is missing but MCP_PROXY_REQUIRE_API_KEY=true')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers ? Object.fromEntries(new Headers(init.headers) as any) : {}),
  }

  if (requireApiKey) headers['X-API-Key'] = uasApiKey

  const url = `${uasBaseUrl}${path.startsWith('/') ? '' : '/'}${path}`
  return await fetch(url, {
    ...init,
    headers,
  })
}

server.registerTool(
  'uas_health',
  {
    title: 'UAS Health Check',
    description: 'Check UAS backend health',
    inputSchema: z.object({}),
  },
  async () => {
    const res = await uasFetch('/health', { method: 'GET' })
    const body = await res.text()
    return {
      content: [{ type: 'text', text: body }]
    }
  }
)

server.registerTool(
  'uas_status',
  {
    title: 'UAS Status',
    description: 'Get UAS backend status',
    inputSchema: z.object({}),
  },
  async () => {
    const res = await uasFetch('/status', { method: 'GET' })
    const body = await res.text()
    return {
      content: [{ type: 'text', text: body }]
    }
  }
)

server.registerTool(
  'uas_agents_list',
  {
    title: 'List UAS Agents',
    description: 'List all agents from UAS backend',
    inputSchema: z.object({}),
  },
  async () => {
    const res = await uasFetch('/agents', { method: 'GET' })
    const body = await res.text()
    return {
      content: [{ type: 'text', text: body }]
    }
  }
)

server.registerTool(
  'uas_agent_call',
  {
    title: 'Call UAS Agent',
    description: 'Call a specific agent action on UAS backend',
    inputSchema: z.object({
      agentId: z.number().int().positive().default(1).describe('Agent ID (e.g., 1 for ZombieCoder Dev Agent)'),
      action: z.enum(['chat', 'execute', 'patch']).describe('Action type: chat, execute, or patch'),
      payload: z.unknown().optional().describe('Optional payload for the action'),
    }),
  },
  async ({ agentId = 1, action, payload }) => {
    const res = await uasFetch(`/agents/${agentId}/call`, {
      method: 'POST',
      body: JSON.stringify({ action, payload: payload ?? {} }),
    })

    const body = await res.text()
    return {
      content: [{ type: 'text', text: body }]
    }
  }
)

// Start server with stdio transport for MCP
const transport = new StdioServerTransport()
await server.connect(transport)
console.log(`[mcp-proxy] MCP server running -> proxying to ${uasBaseUrl}`)
