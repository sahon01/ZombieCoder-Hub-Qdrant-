import { useEffect, useState } from 'react'

interface UseRealTimeDataOptions {
  endpoint: string
  refreshInterval?: number
  enabled?: boolean
}

export function useRealTimeData<T>({ 
  endpoint, 
  refreshInterval = 30000, 
  enabled = true 
}: UseRealTimeDataOptions) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = async () => {
    if (!enabled) return
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      console.error(`[useRealTimeData] Error fetching ${endpoint}:`, err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!enabled) return

    fetchData()
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [endpoint, refreshInterval, enabled])

  return { 
    data, 
    loading, 
    error, 
    lastUpdated, 
    refetch: fetchData 
  }
}

export function useWebSocket(url: string) {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<any>(null)

  useEffect(() => {
    const wsUrl = url.replace('http', 'ws')
    const websocket = new WebSocket(wsUrl)

    websocket.onopen = () => {
      setConnected(true)
      setWs(websocket)
    }

    websocket.onclose = () => {
      setConnected(false)
      setWs(null)
    }

    websocket.onerror = (error) => {
      console.error('[useWebSocket] Error:', error)
      setConnected(false)
    }

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        setLastMessage(message)
      } catch (err) {
        console.error('[useWebSocket] Failed to parse message:', err)
      }
    }

    return () => {
      websocket.close()
    }
  }, [url])

  const sendMessage = (message: any) => {
    if (ws && connected) {
      ws.send(JSON.stringify(message))
    }
  }

  return { ws, connected, lastMessage, sendMessage }
}
