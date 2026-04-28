"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Range = "today" | "7d" | "30d"

interface MetricsSummaryResponse {
  success?: boolean
  range?: Range
  summary?: {
    total_requests: number
    total_errors: number
    avg_response_time_ms: number
  }
}

export function MetricsCards() {
  const [range, setRange] = useState<Range>("today")
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MetricsSummaryResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/proxy/metrics/summary?range=${encodeURIComponent(range)}`)
        const json = (await res.json()) as MetricsSummaryResponse
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [range])

  const totalRequests = data?.summary?.total_requests ?? 0
  const totalErrors = data?.summary?.total_errors ?? 0
  const avgMs = data?.summary?.avg_response_time_ms ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Metrics</h2>
        <div className="w-[140px]">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger>
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">7d</SelectItem>
              <SelectItem value="30d">30d</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : totalRequests}</div>
            <p className="text-xs text-muted-foreground">Range: {range}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : totalErrors}</div>
            <p className="text-xs text-muted-foreground">HTTP 4xx/5xx</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "..." : `${Math.round(avgMs)}ms`}</div>
            <p className="text-xs text-muted-foreground">Server-side latency</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
