import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function nowIso() {
  return new Date().toISOString();
}

function env(name, fallback) {
  const v = process.env[name];
  return (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
}

async function httpJson(url, { method = 'GET', headers = {}, body } = {}) {
  const started = performance.now();
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    body,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _nonJsonBody: text };
  }

  const ended = performance.now();
  return {
    ok: res.ok,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    json,
    latency_ms: Math.round((ended - started) * 100) / 100,
  };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '..');
  const baseUrl = env('UAS_BASE_URL', 'http://localhost:8000');
  const apiKey = env('UAS_API_KEY', '');

  const runId = `${Date.now()}`;
  const startedAt = nowIso();

  const report = {
    runId,
    startedAt,
    repoRoot,
    baseUrl,
    apiKeyPresent: Boolean(apiKey),
    health: null,
    metrics: {
      before: null,
      after: null,
      agents: null,
    },
    agents: [],
    notes: [
      'This test calls /agents then /agents/:agentId/call for each agent.',
      'It also uses /memory/store + /memory/retrieve and (optionally) /mcp/* if UAS_API_KEY is set.',
      'API auditing evidence is fetched from /metrics/summary and /metrics/agents (api_audit_logs).',
    ],
    finishedAt: null,
  };

  report.metrics.before = await httpJson(`${baseUrl}/metrics/summary?range=today`);
  report.health = await httpJson(`${baseUrl}/health`);

  const agentsRes = await httpJson(`${baseUrl}/agents`);
  if (!agentsRes.ok) {
    report.finishedAt = nowIso();
    console.log(JSON.stringify({ success: false, report }, null, 2));
    process.exit(1);
  }

  const agents = Array.isArray(agentsRes.json?.agents) ? agentsRes.json.agents : [];

  for (const a of agents) {
    const agentId = Number(a.id);
    if (!Number.isFinite(agentId)) continue;

    const sessionId = `proof-${runId}-agent-${agentId}`;

    const prompt = [
      `You are agent ${a.name} (id=${agentId}).`,
      'Task: Create a single-file HTML page.',
      'Requirements:',
      '- Title: "Zombie Dance - Agent Proof"',
      '- Body: a short heading plus 3 bullet points describing what you did',
      '- Include a small inline <script> that logs "agentId=<id>" to console',
      '- Keep it short and valid HTML5',
      'Return ONLY the HTML (no markdown fences).',
    ].join('\n');

    const agentCall = await httpJson(`${baseUrl}/agents/${agentId}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate',
        payload: {
          prompt,
          sessionId,
        },
      }),
    });

    const memoryKey = `toolcheck:agent:${agentId}:session:${runId}`;
    const memoryStore = await httpJson(`${baseUrl}/memory/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        key: memoryKey,
        value: {
          agentId,
          agentName: a.name,
          sessionId,
          storedAt: nowIso(),
        },
        ttl: 3600,
      }),
    });

    const memoryRetrieve = await httpJson(`${baseUrl}/memory/retrieve/${encodeURIComponent(memoryKey)}`);

    let mcpTools = null;
    let mcpExec = null;

    if (apiKey) {
      mcpTools = await httpJson(`${baseUrl}/mcp/tools?agentId=${agentId}`);

      const isCodeExecutionActive = Array.isArray(mcpTools.json?.tools)
        ? mcpTools.json.tools.some((t) => t?.name === 'code_execution' && t?.isActive)
        : false;

      if (isCodeExecutionActive) {
        mcpExec = await httpJson(`${baseUrl}/mcp/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify({
            agentId,
            toolName: 'code_execution',
            input: {
              language: 'javascript',
              code: `${agentId} + 1`,
            },
          }),
        });
      }
    }

    report.agents.push({
      agent: {
        id: agentId,
        name: a.name ?? null,
        type: a.type ?? null,
        status: a.status ?? null,
        persona_name: a.persona_name ?? null,
        description: a.description ?? null,
        system_prompt: a.system_prompt ?? null,
        config: a.config ?? null,
      },
      sessionId,
      agentCall,
      memory: {
        key: memoryKey,
        store: memoryStore,
        retrieve: memoryRetrieve,
      },
      mcp: {
        tools: mcpTools,
        exec: mcpExec,
      },
    });
  }

  report.metrics.after = await httpJson(`${baseUrl}/metrics/summary?range=today`);
  report.metrics.agents = await httpJson(`${baseUrl}/metrics/agents?range=today`);
  report.finishedAt = nowIso();

  const outDir = path.join(repoRoot, 'work', 'Tool check');
  const outPath = path.join(outDir, `agent-proof-report-${runId}.json`);
  await writeFile(outPath, JSON.stringify({ success: true, report }, null, 2), 'utf-8');

  console.log(JSON.stringify({ success: true, outPath, report }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ success: false, error: String(err?.message || err), stack: String(err?.stack || '') }, null, 2));
  process.exit(1);
});
