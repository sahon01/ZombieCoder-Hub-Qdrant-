"use client"

import { useState, useRef, useEffect } from "react"
import { Terminal, Send, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface CommandOutput {
  id: string
  command: string
  output: string
  timestamp: Date
  status: "success" | "error" | "running"
}

type RegisteredCommand = {
  id: number
  name: string
  description?: string | null
  command: string
  argsJson?: string | null
  workingDirectory?: string | null
  timeoutMs?: number | null
  isActive?: number | boolean
}

export default function CLIAgentPage() {
  const [commands, setCommands] = useState<RegisteredCommand[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [history, setHistory] = useState<CommandOutput[]>([])
  const [sending, setSending] = useState(false)
  const [loadingCommands, setLoadingCommands] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadCommands = async () => {
    setLoadingCommands(true)
    try {
      const response = await fetch("/api/proxy/cli-agent/commands", { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setCommands([])
        return
      }
      const rows = Array.isArray(data?.data) ? data.data : []
      setCommands(rows)
      if (!selectedId && rows.length > 0) {
        setSelectedId(String(rows[0].id))
      }
    } catch {
      setCommands([])
    } finally {
      setLoadingCommands(false)
    }
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [history])

  useEffect(() => {
    loadCommands()
  }, [])

  const handleSendCommand = async () => {
    if (!selectedId || sending) return

    const selected = commands.find((c) => String(c.id) === String(selectedId))
    if (!selected) return

    const commandId = Date.now().toString()
    const newCommand: CommandOutput = {
      id: commandId,
      command: selected.name,
      output: "",
      timestamp: new Date(),
      status: "running",
    }

    setHistory((prev) => [...prev, newCommand])
    setSending(true)

    try {
      const response = await fetch("/api/proxy/cli-agent/execute-registered", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(selected.id) }),
      })

      if (response.ok) {
        const data = await response.json()
        setHistory((prev) =>
          prev.map((item) =>
            item.id === commandId
              ? {
                ...item,
                output: (data.output || data.error || "Command executed") + (data.executionTime ? `\n\n(${data.executionTime}ms)` : ""),
                status: data?.success ? "success" : "error",
              }
              : item,
          ),
        )
      } else {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === commandId
              ? {
                ...item,
                output: "Failed to execute command",
                status: "error",
              }
              : item,
          ),
        )
      }
    } catch (error) {
      console.log("[v0] Command execution error:", error)
      setHistory((prev) =>
        prev.map((item) =>
          item.id === commandId
            ? {
              ...item,
              output: "Connection error",
              status: "error",
            }
            : item,
        ),
      )
    } finally {
      setSending(false)
    }
  }

  const handleClearHistory = () => {
    setHistory([])
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">CLI Agent</h1>
          <p className="mt-2 text-sm text-muted-foreground">Execute commands through the CLI agent interface</p>
        </div>
        <Button onClick={handleClearHistory} variant="outline" size="sm" disabled={history.length === 0}>
          <Trash2 className="mr-2 h-4 w-4" />
          Clear History
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Terminal Output</h3>
          </div>
        </div>

        <ScrollArea className="h-[500px]" ref={scrollRef}>
          <div className="space-y-4 p-4 font-mono text-sm">
            {history.length === 0 ? (
              <div className="flex h-[450px] items-center justify-center text-muted-foreground">
                Enter a command to get started
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-primary">$</span>
                    <span className="text-foreground">{item.command}</span>
                    {item.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </div>
                  {item.output && (
                    <div
                      className={`ml-4 whitespace-pre-wrap rounded-md p-3 ${item.status === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                        }`}
                    >
                      {item.output}
                    </div>
                  )}
                  <div className="ml-4 text-xs text-muted-foreground">{item.timestamp.toLocaleTimeString()}</div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
              <span className="text-primary">$</span>
              <div className="flex-1">
                <Select value={selectedId} onValueChange={setSelectedId} disabled={sending || loadingCommands || commands.length === 0}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder={loadingCommands ? "Loading commands..." : "Select a command"} />
                  </SelectTrigger>
                  <SelectContent>
                    {commands.map((c) => (
                      <SelectItem key={String(c.id)} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleSendCommand} disabled={!selectedId || sending || commands.length === 0} size="icon">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
            <Button onClick={loadCommands} variant="outline" disabled={sending || loadingCommands}>
              Refresh
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
