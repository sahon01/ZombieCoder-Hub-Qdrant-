"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type Provider = {
  id: number
  name: string
  type?: string
  endpoint: string
  status: "active" | "inactive" | "degraded"
  createdAt: string
  config?: any
  fallbackConfig: {
    enabled: boolean
    fallbackTo?: string | null
  }
  cacheSettings: {
    enabled: boolean
    ttl: number
  }
  costTracking: {
    totalCost: number
    requestCount: number
  }
}

export default function ProviderViewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [providerModels, setProviderModels] = useState<any[]>([])

  const providerId = params?.id

  const fetchProvider = async () => {
    if (!providerId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/proxy/providers/${providerId}`)
      const data = await response.json()
      if (!response.ok) {
        setStatusMessage({ type: "error", message: data?.error || "Failed to load provider" })
        setProvider(null)
        return
      }
      setProvider(data.provider || null)
    } catch (e) {
      console.error("[v0] Failed to fetch provider:", e)
      setStatusMessage({ type: "error", message: "Failed to load provider" })
    } finally {
      setLoading(false)
    }
  }

  const fetchProviderModels = async () => {
    if (!providerId) return
    setModelsLoading(true)
    try {
      const response = await fetch(`/api/proxy/providers/${providerId}/models`)
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setProviderModels([])
        return
      }
      setProviderModels(Array.isArray(data?.data) ? data.data : [])
    } catch {
      setProviderModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  useEffect(() => {
    fetchProvider()
    fetchProviderModels()
  }, [providerId])

  const handleTest = async () => {
    if (!providerId) return
    setTesting(true)
    try {
      const response = await fetch(`/api/proxy/providers/${providerId}/test`, { method: "POST" })
      const data = await response.json()
      if (data?.success) {
        setStatusMessage({ type: "success", message: `Provider is healthy (${data.responseTime}ms)` })
      } else {
        const msg = data?.message || data?.error || "Provider test failed"
        setStatusMessage({ type: "error", message: String(msg) })
      }
    } catch (e) {
      console.error("[v0] Provider test failed:", e)
      setStatusMessage({ type: "error", message: "Provider test failed" })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">Provider</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>

        {statusMessage && (
          <div
            className={`rounded-lg border p-4 text-sm ${statusMessage.type === "success"
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>{statusMessage.message}</div>
              <Button variant="outline" size="sm" className="bg-transparent" onClick={() => setStatusMessage(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (!provider) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Provider</h1>
            <p className="text-muted-foreground">Not found</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/providers">Back</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{provider.name}</h1>
          <p className="text-muted-foreground">Provider details</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/providers">Back</Link>
          </Button>
          <Button onClick={handleTest} variant="outline" disabled={testing}>
            Test
          </Button>
          <Button asChild>
            <Link href={`/providers/${provider.id}/edit`}>Edit</Link>
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">ID:</span>
            <code className="rounded bg-muted px-2 py-1">{provider.id}</code>
          </div>
          {provider.type && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Type:</span>
              <code className="rounded bg-muted px-2 py-1">{provider.type}</code>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Endpoint:</span>
            <code className="rounded bg-muted px-2 py-1">{provider.endpoint}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status:</span>
            <code className="rounded bg-muted px-2 py-1">{provider.status}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Created At:</span>
            <code className="rounded bg-muted px-2 py-1">{provider.createdAt}</code>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Provider Models</div>
          <Button variant="outline" size="sm" className="bg-transparent" onClick={fetchProviderModels} disabled={modelsLoading}>
            Refresh
          </Button>
        </div>

        {modelsLoading ? (
          <div className="mt-4 text-sm text-muted-foreground">Loading...</div>
        ) : providerModels.length === 0 ? (
          <div className="mt-4 text-sm text-muted-foreground">No models found for this provider</div>
        ) : (
          <div className="mt-4 grid gap-2">
            {providerModels.slice(0, 50).map((m: any) => (
              <div key={String(m?.id || m?.name)} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{String(m?.displayName || m?.name || m?.id || "")}</div>
                  <div className="truncate text-xs text-muted-foreground">{String(m?.name || m?.id || "")}</div>
                </div>
                <div className="text-xs text-muted-foreground">{String(m?.type || "")}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="text-sm font-medium">Cache Settings</div>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Enabled:</span>
            <code className="rounded bg-muted px-2 py-1">{String(provider.cacheSettings.enabled)}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">TTL (seconds):</span>
            <code className="rounded bg-muted px-2 py-1">{provider.cacheSettings.ttl}</code>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-sm font-medium">Fallback Configuration</div>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Enabled:</span>
            <code className="rounded bg-muted px-2 py-1">{String(provider.fallbackConfig.enabled)}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Fallback To:</span>
            <code className="rounded bg-muted px-2 py-1">{provider.fallbackConfig.fallbackTo || ""}</code>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-sm font-medium">Cost Tracking</div>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total Cost:</span>
            <code className="rounded bg-muted px-2 py-1">${provider.costTracking.totalCost.toFixed(2)}</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Request Count:</span>
            <code className="rounded bg-muted px-2 py-1">{provider.costTracking.requestCount}</code>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            router.refresh()
            fetchProvider()
            fetchProviderModels()
          }}
        >
          Refresh
        </Button>
      </div>
    </div>
  )
}
