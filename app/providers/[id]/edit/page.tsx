"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

type Provider = {
  id: number
  name: string
  type?: string
  endpoint: string
  status: "active" | "inactive" | "degraded"
  createdAt: string
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

export default function ProviderEditPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()

  const providerId = params?.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const [form, setForm] = useState({
    name: "",
    type: "llama_cpp",
    endpoint: "",
    isActive: true,
    configJson: "{}",
  })

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

      const p: Provider | null = data.provider || null
      setProvider(p)

      if (p) {
        const cfg = (data.provider as any)?.config
        setForm({
          name: p.name,
          type: p.type || "llama_cpp",
          endpoint: p.endpoint,
          isActive: p.status === "active",
          configJson: (() => {
            try {
              return JSON.stringify(typeof cfg === "object" && cfg ? cfg : {}, null, 2)
            } catch {
              return "{}"
            }
          })(),
        })
      }
    } catch (e) {
      console.error("[v0] Failed to fetch provider:", e)
      setStatusMessage({ type: "error", message: "Failed to load provider" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProvider()
  }, [providerId])

  const handleSave = async () => {
    if (!providerId) return

    if (!form.name.trim() || !form.type.trim() || !form.endpoint.trim()) {
      setStatusMessage({ type: "error", message: "Name, type, and endpoint are required" })
      return
    }

    let config: any = {}
    try {
      config = form.configJson.trim() ? JSON.parse(form.configJson) : {}
    } catch {
      setStatusMessage({ type: "error", message: "Config JSON is invalid" })
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/proxy/providers/${providerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type.trim(),
          endpoint: form.endpoint.trim(),
          isActive: form.isActive,
          config,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        setStatusMessage({ type: "error", message: err?.error || "Failed to update provider" })
        return
      }

      setStatusMessage({ type: "success", message: "Provider updated" })
      router.push(`/providers/${providerId}`)
      router.refresh()
    } catch (e) {
      console.error("[v0] Failed to update provider:", e)
      setStatusMessage({ type: "error", message: "Failed to update provider" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">Edit Provider</h1>
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
            <h1 className="text-3xl font-bold">Edit Provider</h1>
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
          <h1 className="text-3xl font-bold">Edit Provider</h1>
          <p className="text-muted-foreground">Update provider configuration</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/providers/${providerId}`}>Cancel</Link>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Provider Name</Label>
            <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="type">Provider Type</Label>
            <Input id="type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endpoint">API Endpoint</Label>
            <Input
              id="endpoint"
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="http://127.0.0.1:8080"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="config">Config (JSON)</Label>
            <textarea
              id="config"
              className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={form.configJson}
              onChange={(e) => setForm({ ...form, configJson: e.target.value })}
              spellCheck={false}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
