"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, Clock, Wifi, WifiOff, AlertCircle } from "lucide-react"

interface RealTimeStatusProps {
  title: string
  endpoint: string
  refreshInterval?: number
}

export function RealTimeStatus({ title, endpoint, refreshInterval = 30000 }: RealTimeStatusProps) {
  const [status, setStatus] = useState<'loading' | 'online' | 'offline' | 'error'>('loading')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [responseTime, setResponseTime] = useState<number | null>(null)

  const checkStatus = async () => {
    try {
      const startTime = Date.now()
      const response = await fetch(endpoint, { 
        method: 'HEAD',
        cache: 'no-store' 
      })
      const endTime = Date.now()
      
      setResponseTime(endTime - startTime)
      setLastUpdate(new Date())
      
      if (response.ok) {
        setStatus('online')
      } else {
        setStatus('error')
      }
    } catch (error) {
      setStatus('offline')
      setLastUpdate(new Date())
    }
  }

  useEffect(() => {
    checkStatus()
    
    if (refreshInterval > 0) {
      const interval = setInterval(checkStatus, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [endpoint, refreshInterval])

  const getStatusIcon = () => {
    switch (status) {
      case 'online':
        return <Wifi className="h-4 w-4 text-green-500" />
      case 'offline':
        return <WifiOff className="h-4 w-4 text-red-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500 animate-pulse" />
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return 'bg-green-500'
      case 'offline':
        return 'bg-red-500'
      case 'error':
        return 'bg-yellow-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'online':
        return 'Connected'
      case 'offline':
        return 'Disconnected'
      case 'error':
        return 'Error'
      default:
        return 'Checking...'
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {getStatusIcon()}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Badge variant={status === 'online' ? 'default' : 'secondary'} className={getStatusColor()}>
            {getStatusText()}
          </Badge>
          {responseTime && (
            <span className="text-xs text-muted-foreground">
              {responseTime}ms
            </span>
          )}
        </div>
        {lastUpdate && (
          <div className="flex items-center text-xs text-muted-foreground mt-1">
            <Clock className="h-3 w-3 mr-1" />
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
