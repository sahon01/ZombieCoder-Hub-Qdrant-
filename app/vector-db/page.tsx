"use client"

import { useEffect, useState } from "react"
import { Database, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type RagStatus = any

export default function VectorDbPage() {
  const [data, setData] = useState<RagStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyAction, setBusyAction] = useState<null | "auto_start" | "auto_stop" | "ingest_metadata">(null)
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [watchPath, setWatchPath] = useState("")

  const fetchStatus = async () => {
    setRefreshing(true)
    try {
      const resp = await fetch("/api/proxy/status/rag", { cache: "no-store" })
      const payload = await resp.json().catch(() => null)
      setData(payload)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const runAction = async (action: "auto_indexer_start" | "auto_indexer_stop" | "ingest_metadata") => {
    setActionMessage(null)
    setBusyAction(action === "auto_indexer_start" ? "auto_start" : action === "auto_indexer_stop" ? "auto_stop" : "ingest_metadata")
    try {
      const body = action === "auto_indexer_start" && watchPath.trim() ? { watchPath: watchPath.trim() } : {}
      const resp = await fetch(`/api/proxy/status/rag?action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const payload = await resp.json().catch(() => null)
      if (!resp.ok) {
        setActionMessage({
          type: "error",
          message: payload?.message || payload?.error || `Action failed (${resp.status})`,
        })
        return
      }
      setActionMessage({ type: "success", message: payload?.message || "Action completed" })
      await fetchStatus()
    } catch (e) {
      console.error("[v0] Vector DB action failed", e)
      setActionMessage({ type: "error", message: "Action failed" })
    } finally {
      setBusyAction(null)
    }
  }

  useEffect(() => {
    fetchStatus()
    const t = setInterval(fetchStatus, 15000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Vector DB / RAG</h1>
            <p className="text-muted-foreground">Qdrant status, indexing progress, and RAG diagnostics</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchStatus} disabled={refreshing} className="bg-transparent">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {actionMessage && (
          <div
            className={`rounded-lg border p-4 text-sm ${actionMessage.type === "success"
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
          >
            {actionMessage.message}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading status...</p>
          </div>
        ) : !data ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Database className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No data</h3>
            <p className="mt-2 text-sm text-muted-foreground">Backend did not return diagnostics</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-medium">Controls</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Indexer ingest endpoints require server-side API key and may be gated by RAG_ALLOW_STATUS_INGEST.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={watchPath}
                    onChange={(e) => setWatchPath(e.target.value)}
                    placeholder={data.autoIndexer?.watchPath || "Watch path (relative to server cwd)"}
                    className="w-full md:w-[360px]"
                  />
                  <Button
                    variant="outline"
                    onClick={() => runAction("auto_indexer_start")}
                    disabled={busyAction !== null}
                    className="bg-transparent"
                  >
                    {busyAction === "auto_start" ? "Starting..." : "Start Auto-Indexer"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runAction("auto_indexer_stop")}
                    disabled={busyAction !== null}
                    className="bg-transparent"
                  >
                    {busyAction === "auto_stop" ? "Stopping..." : "Stop Auto-Indexer"}
                  </Button>
                  <Button onClick={() => runAction("ingest_metadata")}
                    disabled={busyAction !== null}
                  >
                    {busyAction === "ingest_metadata" ? "Indexing..." : "Ingest metadata.md"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-medium">Storage</div>
                <div className="mt-2 text-sm text-muted-foreground space-y-1">
                  <div>Backend: {String(data.vectorBackend || data.metrics?.vectorBackend || "-")}</div>
                  <div>Collection: {String(data.storage?.collectionName || "-")}</div>
                  <div>Qdrant URL: {String(data.storage?.qdrantUrl || "-")}</div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-medium">Usage</div>
                <div className="mt-2 text-sm text-muted-foreground space-y-1">
                  <div>Ingest Ops: {data.metrics?.totalIngestOperations ?? "-"}</div>
                  <div>Ingested Chunks: {data.metrics?.totalIngestedChunks ?? "-"}</div>
                  <div>Retrieve Queries: {data.metrics?.totalRetrieveQueries ?? "-"}</div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-medium">Auto Indexer</div>
                <div className="mt-2 text-sm text-muted-foreground space-y-1">
                  <div>Enabled: {String(data.autoIndexer?.enabled ?? false)}</div>
                  <div>Watching: {String(data.autoIndexer?.isWatching ?? false)}</div>
                  <div>Events: {data.autoIndexer?.indexedEvents ?? "-"}</div>
                  <div>Watch Path: {String(data.autoIndexer?.watchPath || "-")}</div>
                  {data.autoIndexer?.lastError ? (
                    <div className="text-destructive">Last Error: {String(data.autoIndexer.lastError)}</div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Embedding</div>
                  <div className="mt-1 text-xs text-muted-foreground">This model is used to generate vectors for ingestion + search.</div>
                </div>
                <div className="font-mono text-xs text-muted-foreground">{String(data.embedding?.model || "-")}</div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Recently Indexed Files</div>
                <div className="text-xs text-muted-foreground">{data.metrics?.recentIndexedFiles?.length ?? 0}</div>
              </div>
              <div className="mt-3">
                {Array.isArray(data.metrics?.recentIndexedFiles) && data.metrics.recentIndexedFiles.length ? (
                  <div className="space-y-2">
                    {data.metrics.recentIndexedFiles.slice(0, 12).map((f: any) => (
                      <div
                        key={`${String(f.path)}-${String(f.at)}`}
                        className="flex items-center justify-between rounded border border-border px-2 py-1 text-xs"
                      >
                        <span className="truncate max-w-[70%]">{String(f.path)}</span>
                        <span className="text-muted-foreground">{Number(f.chunks) || 0} chunks</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No indexed files yet</div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Diagnostics</div>
                  <div className="mt-1 text-xs text-muted-foreground">Use raw diagnostics only for debugging.</div>
                </div>
                <Button variant="outline" className="bg-transparent" onClick={() => setShowRaw((v) => !v)}>
                  {showRaw ? "Hide raw" : "Show raw"}
                </Button>
              </div>
              {showRaw ? (
                <pre className="mt-3 max-h-[520px] overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                  {JSON.stringify(data, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
