"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function NewProviderPage() {
  const router = useRouter()

  const [submitting, setSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    type: "llama_cpp",
    endpoint: "",
    isActive: true,
    configJson: "{}",
  })

  const setProviderType = (type: string) => {
    const trimmed = String(type || "").trim()
    const nextConfig = (() => {
      if (trimmed === "ollama_cloud") {
        return JSON.stringify({ apiKeyEnvVar: "OLLAMA_CLOUD_API_KEY" }, null, 2)
      }
      if (trimmed === "google" || trimmed === "gemini") {
        return JSON.stringify({ apiKeyEnvVar: "GOOGLE_GEMINI_API_KEY", base_url: "https://generativelanguage.googleapis.com" }, null, 2)
      }
      return formData.configJson
    })()

    const nextEndpoint = (() => {
      if (trimmed === "llama_cpp") return "http://127.0.0.1:15000"
      return formData.endpoint
    })()

    setFormData((prev) => ({ ...prev, type: trimmed, endpoint: nextEndpoint, configJson: nextConfig }))
  }

  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.type.trim() || !formData.endpoint.trim()) {
      setStatusMessage({ type: "error", message: "Name, type, and endpoint are required" })
      return
    }

    let config: any = {}
    try {
      config = formData.configJson.trim() ? JSON.parse(formData.configJson) : {}
    } catch {
      setStatusMessage({ type: "error", message: "Config JSON is invalid" })
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/proxy/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          type: formData.type.trim(),
          endpoint: formData.endpoint.trim(),
          isActive: formData.isActive,
          config,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        const msg =
          (err?.error ? String(err.error) : "Failed to create provider") +
          (err?.message ? `: ${String(err.message)}` : "")
        setStatusMessage({ type: "error", message: msg })
        return
      }

      setStatusMessage({ type: "success", message: "Provider created" })
      router.push("/providers")
      router.refresh()
    } catch (e) {
      console.error("[v0] Failed to create provider:", e)
      setStatusMessage({ type: "error", message: "Failed to create provider" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Add Provider</h1>
          <p className="text-muted-foreground">Create a new AI provider configuration</p>
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
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/providers">Cancel</Link>
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            Create
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Provider Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My llama.cpp"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="type">Provider Type</Label>
            <Select value={formData.type} onValueChange={setProviderType}>
              <SelectTrigger id="type">
                <SelectValue placeholder="Select provider type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="llama_cpp">llama_cpp (OpenAI-compatible)</SelectItem>
                <SelectItem value="ollama">ollama (local)</SelectItem>
                <SelectItem value="ollama_cloud">ollama_cloud</SelectItem>
                <SelectItem value="google">google (Gemini)</SelectItem>
                <SelectItem value="custom">custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endpoint">API Endpoint</Label>
            <Input
              id="endpoint"
              value={formData.endpoint}
              onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
              placeholder="http://127.0.0.1:8080"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="config">Config (JSON)</Label>
            <textarea
              id="config"
              className="min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={formData.configJson}
              onChange={(e) => setFormData({ ...formData, configJson: e.target.value })}
              spellCheck={false}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
