"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Play, RefreshCw, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"

type ToolItem = {
  name: string
  category: string
  description: string
  isActive?: boolean
  config?: Record<string, any>
  source?: string
  agentId?: number
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [agentId, setAgentId] = useState<string>("1")

  const [runningTool, setRunningTool] = useState<string | null>(null)
  const [toolInput, setToolInput] = useState<Record<string, string>>({})
  const [toolOutput, setToolOutput] = useState<Record<string, string>>({})

  const effectiveAgentId = useMemo(() => {
    const n = Number.parseInt(String(agentId || ""), 10)
    return Number.isFinite(n) && n > 0 ? String(n) : ""
  }, [agentId])

  const fetchTools = async () => {
    setRefreshing(true)
    try {
      const qs = effectiveAgentId ? `?agentId=${encodeURIComponent(effectiveAgentId)}` : ""
      const resp = await fetch(`/api/proxy/mcp/tools${qs}`, { cache: "no-store" })
      if (!resp.ok) {
        setTools([])
        return
      }
      const data = await resp.json().catch(() => null)
      const list = Array.isArray(data?.tools) ? data.tools : []
      setTools(
        list.map((t: any) => ({
          name: String(t?.name || ""),
          category: String(t?.category || ""),
          description: String(t?.description || ""),
          isActive: typeof t?.isActive === "boolean" ? t.isActive : undefined,
          config: typeof t?.config === "object" && t?.config ? t.config : undefined,
          source: typeof t?.source === "string" ? t.source : undefined,
          agentId: typeof t?.agentId === "number" ? t.agentId : undefined,
        })),
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchTools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRunTool = async (toolName: string) => {
    setRunningTool(toolName)
    try {
      const input = toolInput[toolName] ?? ""
      const resp = await fetch("/api/proxy/mcp/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: Number(effectiveAgentId || 1), toolName, input }),
      })
      const data = await resp.json().catch(() => null)
      const out = resp.ok ? String(data?.output ?? "") : String(data?.message || data?.error || "Tool execution failed")
      setToolOutput((prev) => ({ ...prev, [toolName]: out }))
    } finally {
      setRunningTool(null)
    }
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Tools</h1>
            <p className="text-muted-foreground">List and test available agent tools (MCP tool registry)</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="h-10 w-24 rounded-md border border-border bg-background px-3 text-sm"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agentId"
            />
            <Button variant="outline" onClick={fetchTools} disabled={refreshing} className="bg-transparent">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading tools...</p>
          </div>
        ) : tools.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Wrench className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No tools found</h3>
            <p className="mt-2 text-sm text-muted-foreground">Make sure the backend is running and your agent has tools enabled</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => (
              <div key={t.name} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{t.name}</h3>
                    <p className="text-sm text-muted-foreground">{t.category}</p>
                    <p className="mt-2 text-sm">{t.description}</p>
                    {typeof t.isActive === "boolean" && (
                      <p className="mt-2 text-xs text-muted-foreground">Active: {String(t.isActive)}</p>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <textarea
                    className="min-h-[72px] w-full rounded-md border border-border bg-background p-2 text-sm"
                    placeholder="Tool input (string)"
                    value={toolInput[t.name] ?? ""}
                    onChange={(e) => setToolInput((prev) => ({ ...prev, [t.name]: e.target.value }))}
                  />

                  <Button
                    variant="outline"
                    className="w-full bg-transparent"
                    disabled={!effectiveAgentId || runningTool === t.name}
                    onClick={() => handleRunTool(t.name)}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {runningTool === t.name ? "Running..." : "Run"}
                  </Button>

                  {toolOutput[t.name] && (
                    <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-2 text-xs">
                      {toolOutput[t.name]}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
