"use client"

import { useEffect, useState } from "react"
import { Bot, Loader2, Terminal, RefreshCw, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface Agent {
  id: string
  name: string
  status: "active" | "inactive" | "error" | "busy"
  host?: string
  port?: number
  type?: string
  persona_name?: string | null
  system_prompt?: string | null
  config?: any
  requestCount?: number
  activeSessions?: number
  capabilities?: string[]
  endpoint?: string
  priority?: number
  metrics?: {
    requestCount: number
    avgResponseTime: number
    errorRate: number
  }
  createdAt?: string
  updatedAt?: string
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [command, setCommand] = useState("")
  const [sending, setSending] = useState(false)

  const [personaDialogOpen, setPersonaDialogOpen] = useState(false)
  const [personaName, setPersonaName] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [savingPersona, setSavingPersona] = useState(false)

  const fetchAgents = async () => {
    try {
      const response = await fetch("/api/proxy/agents")
      if (response.ok) {
        const data = await response.json()
        // Handle both database and fallback API responses
        if (data.success && Array.isArray(data.agents)) {
          setAgents(data.agents.map((agent: any) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            type: agent.type,
            persona_name: agent.persona_name ?? null,
            system_prompt: agent.system_prompt ?? null,
            host: agent.endpoint || agent.host,
            config: agent.config || agent.configuration,
            requestCount: agent.requestCount || agent.request_count,
            activeSessions: agent.activeSessions || agent.active_sessions,
            capabilities: agent.capabilities,
            endpoint: agent.endpoint,
            priority: agent.priority,
            metrics: agent.metrics,
            createdAt: agent.createdAt || agent.created_at,
            updatedAt: agent.updatedAt || agent.updated_at
          })))
        } else if (Array.isArray(data)) {
          // Handle legacy array response
          setAgents(data.map((agent: any) => ({
            id: agent.id,
            name: agent.name,
            status: agent.status,
            type: agent.type,
            persona_name: agent.persona_name ?? null,
            system_prompt: agent.system_prompt ?? null,
            host: agent.endpoint || agent.host,
            config: agent.config || agent.configuration,
            requestCount: agent.requestCount || agent.request_count,
            activeSessions: agent.activeSessions || agent.active_sessions,
            capabilities: agent.capabilities,
            endpoint: agent.endpoint,
            priority: agent.priority,
            metrics: agent.metrics,
            createdAt: agent.createdAt || agent.created_at,
            updatedAt: agent.updatedAt || agent.updated_at
          })))
        } else {
          setAgents([])
        }
      } else {
        setAgents([])
      }
    } catch (error) {
      console.log("[v0] Failed to fetch agents:", error)
      setAgents([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const selected = selectedAgent ? agents.find((a) => a.id === selectedAgent) : null
  const isDbAgent = Boolean(selected && !Number.isNaN(Number(selected.id)))

  const openPersonaEditor = () => {
    if (!selected) return
    setPersonaName(selected.persona_name || "")
    setSystemPrompt(selected.system_prompt || "")
    setPersonaDialogOpen(true)
  }

  const savePersona = async () => {
    if (!selected || !isDbAgent) return
    setSavingPersona(true)
    try {
      const res = await fetch(`/api/proxy/settings/agents/${selected.id}/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona_name: personaName,
          system_prompt: systemPrompt,
        }),
      })

      if (res.ok) {
        setPersonaDialogOpen(false)
        await fetchAgents()
      }
    } catch (error) {
      console.log("[v0] Failed to save persona:", error)
    } finally {
      setSavingPersona(false)
    }
  }

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAgents()
  }

  const handleSendCommand = async () => {
    if (!selectedAgent || !command.trim()) return

    setSending(true)
    try {
      const response = await fetch(`/api/proxy/agents/${selectedAgent}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: command }),
      })

      if (response.ok) {
        setCommand("")
      }
    } catch (error) {
      console.log("[v0] Failed to send command:", error)
    } finally {
      setSending(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
    switch (status) {
      case "active":
        return `${baseClasses} bg-success/10 text-success`
      case "inactive":
        return `${baseClasses} bg-muted text-muted-foreground`
      case "error":
        return `${baseClasses} bg-destructive/10 text-destructive`
      default:
        return `${baseClasses} bg-muted text-muted-foreground`
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Agents</h1>
          <p className="mt-2 text-sm text-muted-foreground">View and control your agent instances</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading agents...</span>
          </div>
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No agents found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Make sure your UAS backend is running and agents are configured
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="grid gap-4 md:grid-cols-2">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`cursor-pointer rounded-lg border bg-card p-6 transition-colors ${selectedAgent === agent.id ? "border-primary" : "border-border hover:border-primary/50"
                    }`}
                  onClick={() => setSelectedAgent(agent.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-md bg-primary/10 p-2">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{agent.name}</h3>
                        {agent.type && <p className="text-sm text-muted-foreground">{agent.type}</p>}
                      </div>
                    </div>
                    <span className={getStatusBadge(agent.status)}>{agent.status}</span>
                  </div>

                  <div className="mt-4 space-y-1">
                    {agent.endpoint && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Endpoint</span>
                        <span className="font-mono text-xs truncate max-w-[120px]" title={agent.endpoint}>{agent.endpoint}</span>
                      </div>
                    )}
                    {agent.requestCount !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Requests</span>
                        <span className="font-medium">{agent.requestCount}</span>
                      </div>
                    )}
                    {agent.activeSessions !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Active Sessions</span>
                        <span className="font-medium">{agent.activeSessions}</span>
                      </div>
                    )}
                    {agent.priority !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Priority</span>
                        <span className="font-medium">{agent.priority}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Send Command</h3>
            </div>

            {selectedAgent ? (
              <div className="space-y-4">
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm text-muted-foreground">Selected Agent</p>
                  <p className="mt-1 font-medium">{agents.find((a) => a.id === selectedAgent)?.name}</p>
                </div>

                <div className="flex justify-end">
                  <Dialog open={personaDialogOpen} onOpenChange={setPersonaDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="bg-transparent" onClick={openPersonaEditor} disabled={!isDbAgent}>
                        Edit Persona
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Edit Persona</DialogTitle>
                      </DialogHeader>

                      {!isDbAgent ? (
                        <div className="text-sm text-muted-foreground">Persona editing is available for database agents only.</div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Persona Name</Label>
                            <Input value={personaName} onChange={(e) => setPersonaName(e.target.value)} placeholder="Persona name" />
                          </div>

                          <div className="space-y-2">
                            <Label>System Prompt</Label>
                            <Textarea
                              value={systemPrompt}
                              onChange={(e) => setSystemPrompt(e.target.value)}
                              rows={10}
                              placeholder="Enter system prompt..."
                            />
                            <p className="text-xs text-muted-foreground">
                              Identity + ethical guardrails will be automatically applied on save.
                            </p>
                          </div>

                          <div className="flex justify-end gap-2">
                            <Button variant="outline" className="bg-transparent" onClick={() => setPersonaDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button onClick={savePersona} disabled={savingPersona}>
                              {savingPersona ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Enter command..."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !sending) {
                        handleSendCommand()
                      }
                    }}
                    disabled={sending}
                  />
                  <Button onClick={handleSendCommand} disabled={!command.trim() || sending} size="icon">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Commands will be sent to the selected agent for execution
                </p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">Select an agent to send commands</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
