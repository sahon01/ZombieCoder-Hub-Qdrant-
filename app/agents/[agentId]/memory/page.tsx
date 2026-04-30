"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Database, Loader2, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

type AgentMemory = {
  id?: number
  agent_id?: string
  session_id?: string
  content?: string
  metadata?: any
  created_at?: string
  updated_at?: string
  relevance_score?: number
}

export default function AgentMemoryPage() {
  const params = useParams()
  const agentId = String((params as any)?.agentId || "").trim()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [error, setError] = useState<string | null>(null)

  const [limit] = useState(50)
  const [sessionId, setSessionId] = useState("")

  const [searchQuery, setSearchQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<AgentMemory[] | null>(null)

  const showing = useMemo(() => {
    if (searchResults) return searchResults
    return memories
  }, [memories, searchResults])

  const fetchMemories = async () => {
    if (!agentId) return
    setError(null)
    setRefreshing(true)
    try {
      const qs = new URLSearchParams({ limit: String(limit) })
      if (sessionId.trim()) qs.set("sessionId", sessionId.trim())
      const resp = await fetch(`/api/proxy/memory-new/agent/${encodeURIComponent(agentId)}?${qs.toString()}`, { cache: "no-store" })
      const payload = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(payload?.message || payload?.error || `Failed to load agent memory (${resp.status})`)
        setMemories([])
        setSearchResults(null)
        return
      }

      const items = Array.isArray(payload?.memories) ? payload.memories : Array.isArray(payload) ? payload : []
      setMemories(items)
      setSearchResults(null)
    } catch (e) {
      console.error("[v0] agent memory fetch failed", e)
      setError("Connection failed")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const runSearch = async () => {
    if (!agentId || !searchQuery.trim()) return
    setSearching(true)
    setError(null)
    try {
      const resp = await fetch(`/api/proxy/memory-new/search/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), agentId, limit: 20, threshold: 0.7 }),
      })
      const payload = await resp.json().catch(() => null)
      if (!resp.ok) {
        setError(payload?.message || payload?.error || `Search failed (${resp.status})`)
        return
      }
      const items = Array.isArray(payload?.memories) ? payload.memories : []
      setSearchResults(items)
    } catch (e) {
      console.error("[v0] agent memory search failed", e)
      setError("Search failed")
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    fetchMemories()
    const t = setInterval(fetchMemories, 30000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, sessionId])

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Agent Memory</h1>
          <p className="mt-2 text-sm text-muted-foreground">Agent: {agentId || "-"}</p>
        </div>
        <Button onClick={fetchMemories} disabled={refreshing} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-medium">Filter</div>
          <div className="mt-3 space-y-2">
            <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Session ID (optional)" />
            <p className="text-xs text-muted-foreground">Leave blank to show all sessions.</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
          <div className="text-sm font-medium">Search (semantic)</div>
          <div className="mt-3 flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search agent memories..."
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch()
              }}
            />
            <Button onClick={runSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Search
            </Button>
            <Button
              variant="outline"
              className="bg-transparent"
              onClick={() => {
                setSearchQuery("")
                setSearchResults(null)
              }}
              disabled={searching}
            >
              Clear
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading agent memories...</span>
          </div>
        </div>
      ) : showing.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Database className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No memories found</h3>
          <p className="mt-2 text-sm text-muted-foreground">Once the agent stores memory, it will appear here.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4 text-sm text-muted-foreground">
            Showing {showing.length}{searchResults ? " search results" : " memories"}
          </div>
          <ScrollArea className="h-[680px]">
            <div className="space-y-3 p-4">
              {showing.map((m, idx) => (
                <div key={String(m.id ?? idx)} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs text-muted-foreground">
                      {m.created_at ? new Date(m.created_at).toLocaleString() : "-"}
                    </div>
                    {m.session_id ? (
                      <div className="font-mono text-xs text-muted-foreground truncate max-w-[50%]">session: {m.session_id}</div>
                    ) : null}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{String(m.content || "")}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
