"use client"

import { cn } from "@/lib/utils"

import { useEffect, useState } from "react"
import { Activity, AlertCircle, CheckCircle, XCircle } from "lucide-react"

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown"

interface HealthData {
  status: HealthStatus
  uptime: number
  timestamp: number
}

export function ServerHealthCard() {
  const [health, setHealth] = useState<HealthData>({
    status: "unknown",
    uptime: 0,
    timestamp: Date.now(),
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch("/api/proxy/health")
        if (response.ok) {
          const data = await response.json()
          setHealth({
            status: data.status || "healthy",
            uptime: data.uptime || 0,
            timestamp: Date.now(),
          })
        } else {
          setHealth({ status: "unhealthy", uptime: 0, timestamp: Date.now() })
        }
      } catch (error) {
        console.log("[v0] Health check failed:", error)
        setHealth({ status: "unhealthy", uptime: 0, timestamp: Date.now() })
      } finally {
        setLoading(false)
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000) // Check every 30s

    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = () => {
    switch (health.status) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-success" />
      case "degraded":
        return <AlertCircle className="h-5 w-5 text-warning" />
      case "unhealthy":
        return <XCircle className="h-5 w-5 text-destructive" />
      default:
        return <Activity className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getStatusColor = () => {
    switch (health.status) {
      case "healthy":
        return "text-success"
      case "degraded":
        return "text-warning"
      case "unhealthy":
        return "text-destructive"
      default:
        return "text-muted-foreground"
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) return `${days}d ${hours}h`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Server Health</h3>
        {getStatusIcon()}
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-2xl font-semibold text-muted-foreground">Checking...</div>
        ) : (
          <>
            <div className={cn("text-2xl font-semibold capitalize", getStatusColor())}>{health.status}</div>
            {health.uptime > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">Uptime: {formatUptime(health.uptime)}</p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        Last checked: {new Date(health.timestamp).toLocaleTimeString()}
      </div>
    </div>
  )
}
