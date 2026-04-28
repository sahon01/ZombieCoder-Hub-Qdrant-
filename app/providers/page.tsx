"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Plus, Edit, Trash2, TestTube, AlertCircle, CheckCircle, Clock, Eye } from "lucide-react"

interface Provider {
  id: number
  name: string
  endpoint: string
  type?: string
  status: "active" | "inactive" | "degraded"
  config?: any
  fallbackConfig: {
    enabled: boolean
    fallbackTo?: string
  }
  cacheSettings: {
    enabled: boolean
    ttl: number
  }
  costTracking: {
    totalCost: number
    requestCount: number
  }
  createdAt: string
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [testingProvider, setTestingProvider] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Record<number, boolean>>({})

  useEffect(() => {
    fetchProviders()
  }, [])

  const fetchProviders = async () => {
    try {
      const response = await fetch("/api/proxy/providers")
      const data = await response.json()
      setProviders(data.providers || [])
    } catch (error) {
      console.error("[v0] Failed to fetch providers:", error)
      setStatusMessage({ type: "error", message: "Failed to load providers" })
    }
  }

  const handleDeleteProvider = async (id: number) => {
    try {
      const response = await fetch(`/api/proxy/providers/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setStatusMessage({ type: "success", message: "Provider deleted successfully" })
        setConfirmDelete((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        fetchProviders()
      }
    } catch (error) {
      console.error("[v0] Failed to delete provider:", error)
      setStatusMessage({ type: "error", message: "Failed to delete provider" })
    }
  }

  const handleTestProvider = async (id: number) => {
    setTestingProvider(id)
    try {
      const response = await fetch(`/api/proxy/providers/${id}/test`, {
        method: "POST",
      })

      const data = await response.json()

      if (data.success) {
        setStatusMessage({ type: "success", message: `Provider is healthy (${data.responseTime}ms)` })
      } else {
        setStatusMessage({ type: "error", message: data?.message ? String(data.message) : "Provider test failed" })
      }
    } catch (error) {
      console.error("[v0] Failed to test provider:", error)
      setStatusMessage({ type: "error", message: "Failed to test provider" })
    } finally {
      setTestingProvider(null)
    }
  }

  const handleToggleStatus = async (provider: Provider) => {
    const newStatus = provider.status === "active" ? "inactive" : "active"

    try {
      const response = await fetch(`/api/proxy/providers/${provider.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: newStatus === "active" }),
      })

      if (response.ok) {
        setStatusMessage({ type: "success", message: `Provider ${newStatus === "active" ? "enabled" : "disabled"}` })
        fetchProviders()
      }
    } catch (error) {
      console.error("[v0] Failed to toggle provider status:", error)
      setStatusMessage({ type: "error", message: "Failed to update provider status" })
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "degraded":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case "inactive":
        return <Clock className="h-4 w-4 text-muted-foreground" />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cloud Providers</h1>
          <p className="text-muted-foreground">Manage AI service providers and configurations</p>
        </div>
        <Button asChild>
          <Link href="/providers/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Provider
          </Link>
        </Button>
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

      <div className="grid gap-4 md:grid-cols-2">
        {providers.map((provider) => (
          <Card key={provider.id} className="p-6">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-3">
                <h3 className="truncate text-xl font-semibold">{provider.name}</h3>
                <div className="flex items-center gap-2">
                  {getStatusIcon(provider.status)}
                  <span className="text-sm capitalize text-muted-foreground">{provider.status}</span>
                </div>
              </div>

              <div className="grid gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-medium">{provider.type || ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Endpoint:</span>
                  <code className="truncate rounded bg-muted px-2 py-1">{provider.endpoint}</code>
                </div>

                {provider.config?.apiKeyEnvVar ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">API Key Env:</span>
                    <code className="truncate rounded bg-muted px-2 py-1">{String(provider.config.apiKeyEnvVar)}</code>
                  </div>
                ) : null}

                {provider.config?.rateLimitPerMinute ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Rate Limit:</span>
                    <span className="font-medium">{Number(provider.config.rateLimitPerMinute)}/min</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTestProvider(provider.id)}
                  disabled={testingProvider === provider.id}
                  className="w-full bg-transparent"
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Test
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleToggleStatus(provider)}
                  className="w-full bg-transparent"
                >
                  {provider.status === "active" ? "Disable" : "Enable"}
                </Button>

                <Button asChild size="sm" variant="outline" className="w-full bg-transparent">
                  <Link href={`/providers/${provider.id}`}>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Link>
                </Button>

                <Button asChild size="sm" variant="outline" className="w-full bg-transparent">
                  <Link href={`/providers/${provider.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </Button>

                {!confirmDelete[provider.id] ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full bg-transparent"
                    onClick={() => setConfirmDelete((prev) => ({ ...prev, [provider.id]: true }))}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                ) : (
                  <div className="grid gap-2">
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteProvider(provider.id)}>
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-transparent"
                      onClick={() =>
                        setConfirmDelete((prev) => {
                          const next = { ...prev }
                          delete next[provider.id]
                          return next
                        })
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}

        {providers.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No providers configured</p>
          </Card>
        )}
      </div>
    </div>
  )
}
