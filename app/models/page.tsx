"use client"

import { useEffect, useState } from "react"
import { Server, Loader2, Play, Square, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Model {
  id: string
  name: string
  version: string
  status: "running" | "stopped" | "error" | "pending" | "loading"
  cpu?: number
  memory?: number
  port?: number
  provider_name?: string
  provider_type?: string
  requests_handled?: number
  last_response_time?: number
  total_tokens_used?: number
  created_at?: string
  updated_at?: string
  size?: number
  modified?: string
  digest?: string
  details?: {
    format: string
    family: string
    parameterSize: string
    quantizationLevel: string
  }
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [defaultModel, setDefaultModel] = useState<string | null>(null)
  const [settingDefault, setSettingDefault] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncingSource, setSyncingSource] = useState<string | null>(null)

  const toNumberOrUndefined = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return undefined
  }

  const fetchDefaultModel = async () => {
    try {
      const response = await fetch("/api/proxy/settings/default-model")
      if (!response.ok) {
        setDefaultModel(null)
        return
      }
      const data = await response.json().catch(() => null)
      const dm = data?.defaultModel
      setDefaultModel(typeof dm === "string" && dm.trim() ? dm.trim() : null)
    } catch {
      setDefaultModel(null)
    }
  }

  const fetchModels = async () => {
    try {
      const response = await fetch("/api/proxy/models")
      if (response.ok) {
        const data = await response.json()
        // Handle both database and Ollama API responses
        if (data.success && Array.isArray(data.data)) {
          setModels(data.data.map((model: any) => ({
            id: model.id || model.name,
            name: model.model_name || model.name || model.model,
            version: model.model_version || model.details?.parameterSize || 'N/A',
            status: model.status || 'stopped',
            cpu: toNumberOrUndefined(model.cpu_usage),
            memory: toNumberOrUndefined(model.memory_usage),
            requests_handled: model.requests_handled || undefined,
            total_tokens_used: model.total_tokens_used || undefined,
            provider_name: model.provider_name,
            provider_type: model.provider_type,
            created_at: model.created_at,
            updated_at: model.updated_at,
            size: model.size,
            modified: model.modified,
            details: model.details
          })))
        } else if (Array.isArray(data)) {
          // Handle legacy array response
          setModels(data.map((model: any) => ({
            id: model.id || model.name,
            name: model.model_name || model.name || model.model,
            version: model.model_version || model.details?.parameterSize || 'N/A',
            status: model.status || 'stopped',
            cpu: toNumberOrUndefined(model.cpu_usage),
            memory: toNumberOrUndefined(model.memory_usage),
            requests_handled: model.requests_handled || undefined,
            total_tokens_used: model.total_tokens_used || undefined,
            provider_name: model.provider_name,
            provider_type: model.provider_type,
            created_at: model.created_at,
            updated_at: model.updated_at,
            size: model.size,
            modified: model.modified,
            details: model.details
          })))
        } else {
          setModels([])
        }
      } else {
        setModels([])
      }
    } catch (error) {
      console.log("[v0] Failed to fetch models:", error)
      setModels([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchModels()
    fetchDefaultModel()
    const interval = setInterval(fetchModels, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchModels()
    fetchDefaultModel()
  }

  const handleSyncFromOllama = async () => {
    setSyncing(true)
    setSyncingSource("ollama")
    try {
      const response = await fetch("/api/proxy/models/sync", { method: "POST" })
      if (!response.ok) return
      await fetchModels()
      await fetchDefaultModel()
    } finally {
      setSyncing(false)
      setSyncingSource(null)
    }
  }

  const findFirstModelByProviderType = (providerTypes: string[]) => {
    for (const m of models) {
      const t = String(m.provider_type || "").trim().toLowerCase()
      if (providerTypes.includes(t)) return m
    }
    return null
  }

  const maybeAutoSetDefault = async (providerTypes: string[]) => {
    if (defaultModel) return
    const candidate = findFirstModelByProviderType(providerTypes)
    if (!candidate) return
    await handleSetDefaultModel(candidate.name)
  }

  const handleSyncFromLlamaCpp = async () => {
    setSyncing(true)
    setSyncingSource("llama_cpp")
    try {
      const response = await fetch("/api/proxy/models/llama-cpp/sync", { method: "POST" })
      if (!response.ok) return
      await fetchModels()
      await fetchDefaultModel()
      await maybeAutoSetDefault(["llama_cpp", "llama-cpp", "llama.cpp"])
    } finally {
      setSyncing(false)
      setSyncingSource(null)
    }
  }

  const handleSyncFromGoogle = async () => {
    setSyncing(true)
    setSyncingSource("google")
    try {
      const providersResp = await fetch("/api/proxy/providers", { cache: "no-store" })
      if (!providersResp.ok) return
      const providersPayload = await providersResp.json().catch(() => null)
      const providers = Array.isArray(providersPayload?.providers) ? providersPayload.providers : []
      const googleProvider = providers.find((p: any) => {
        const t = String(p?.type || "").trim().toLowerCase()
        return t === "google" || t === "gemini"
      })
      if (!googleProvider?.id) return

      const response = await fetch(`/api/proxy/providers/${googleProvider.id}/sync-models`, { method: "POST" })
      if (!response.ok) return
      await fetchModels()
      await fetchDefaultModel()
      await maybeAutoSetDefault(["google", "gemini"])
    } finally {
      setSyncing(false)
      setSyncingSource(null)
    }
  }

  const handleSetDefaultModel = async (modelName: string) => {
    setSettingDefault(modelName)
    try {
      const response = await fetch("/api/proxy/settings/default-model", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      })

      if (!response.ok) return
      await fetchDefaultModel()
    } finally {
      setSettingDefault(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "text-success"
      case "stopped":
        return "text-muted-foreground"
      case "error":
        return "text-destructive"
      default:
        return "text-muted-foreground"
    }
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    switch (status) {
      case "running":
        return `${baseClasses} bg-success/10 text-success`
      case "stopped":
        return `${baseClasses} bg-muted text-muted-foreground`
      case "error":
        return `${baseClasses} bg-destructive/10 text-destructive`
      default:
        return `${baseClasses} bg-muted text-muted-foreground`
    }
  }

  return (
    <div className="p-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Models</h1>
            <p className="text-muted-foreground">Manage your AI models and monitor performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSyncFromOllama} disabled={syncing} className="bg-transparent">
              <Loader2 className={`mr-2 h-4 w-4 ${syncingSource === "ollama" ? "animate-spin" : ""}`} />
              Sync from Ollama
            </Button>
            <Button variant="outline" onClick={handleSyncFromGoogle} disabled={syncing} className="bg-transparent">
              <Loader2 className={`mr-2 h-4 w-4 ${syncingSource === "google" ? "animate-spin" : ""}`} />
              Sync from Google
            </Button>
            <Button variant="outline" onClick={handleSyncFromLlamaCpp} disabled={syncing} className="bg-transparent">
              <Loader2 className={`mr-2 h-4 w-4 ${syncingSource === "llama_cpp" ? "animate-spin" : ""}`} />
              Sync from llama.cpp
            </Button>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing} className="bg-transparent">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading models...</p>
          </div>
        ) : models.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center">
            <Server className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No models found</h3>
            <p className="mt-2 text-sm text-muted-foreground">Make sure your UAS backend is running and models are configured</p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {models.map((model) => (
              <div key={model.id} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-primary/10 p-2">
                      <Server className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{model.name}</h3>
                        {defaultModel && model.name === defaultModel && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Default</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {model.provider_name ? `${model.provider_name} (${model.provider_type})` : model.version}
                      </p>
                    </div>
                  </div>
                  <span className={getStatusBadge(model.status)}>{model.status}</span>
                </div>

                {(model.status === "running" || model.cpu !== undefined) && (
                  <div className="mt-4 space-y-2">
                    {model.cpu !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">CPU</span>
                        <span className={`font-medium ${getStatusColor(model.status)}`}>{model.cpu.toFixed(1)}%</span>
                      </div>
                    )}
                    {model.memory !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Memory</span>
                        <span className="font-medium">{model.memory.toFixed(1)}%</span>
                      </div>
                    )}
                    {model.requests_handled !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Requests</span>
                        <span className="font-medium">{model.requests_handled}</span>
                      </div>
                    )}
                    {model.total_tokens_used !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Tokens</span>
                        <span className="font-mono text-xs">{model.total_tokens_used}</span>
                      </div>
                    )}
                    {model.size !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Size</span>
                        <span className="font-mono text-xs">{(model.size / (1024 * 1024 * 1024)).toFixed(1)} GB</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  {model.status === "running" ? (
                    <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                      <Square className="mr-2 h-3 w-3" />
                      Stop
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                      <Play className="mr-2 h-3 w-3" />
                      Start
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-transparent"
                    disabled={settingDefault === model.name || model.name === defaultModel}
                    onClick={() => handleSetDefaultModel(model.name)}
                  >
                    {settingDefault === model.name ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                    Set Default
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
