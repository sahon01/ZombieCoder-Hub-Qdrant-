"use client"

import { useEffect, useState } from "react"
import { Database, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type RagStatus = any

export default function VectorDbPage() {
  const [data, setData] = useState<RagStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="font-medium">Backend</h3>
              <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                {JSON.stringify(
                  {
                    enabled: data.enabled,
                    vectorBackend: data.vectorBackend,
                    timestamp: data.timestamp,
                    storage: data.storage,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <h3 className="font-medium">Services</h3>
              <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                {JSON.stringify(
                  {
                    qdrantManager: data.qdrantManager,
                    chromaManager: data.chromaManager,
                    autoIndexer: data.autoIndexer,
                    metrics: data.metrics,
                  },
                  null,
                  2,
                )}
              </pre>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 md:col-span-2">
              <h3 className="font-medium">Full diagnostics</h3>
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-md border border-border bg-background p-3 text-xs">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
