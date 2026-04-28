"use client"

import { useEffect, useState } from "react"
import { Server, Loader2 } from "lucide-react"

interface SystemStatus {
  models: number
  agents: number
  activeConnections: number
}

export function SystemStatusCard() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/proxy/status")
        if (response.ok) {
          const data = await response.json()
          setStatus({
            models: data.models?.length || 0,
            agents: data.agents?.length || 0,
            activeConnections: data.stats?.activeConnections || 0,
          })
        }
      } catch (error) {
        console.log("[v0] Status fetch failed:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">System Status</h3>
        <Server className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : status ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Models</span>
              <span className="text-lg font-semibold">{status.models}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Agents</span>
              <span className="text-lg font-semibold">{status.agents}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Connections</span>
              <span className="text-lg font-semibold">{status.activeConnections}</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to fetch status</p>
        )}
      </div>
    </div>
  )
}
