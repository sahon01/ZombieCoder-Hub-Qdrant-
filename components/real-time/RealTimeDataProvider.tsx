"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { useWebSocket } from "@/hooks/useRealTimeData"

interface RealTimeData {
  agents: any[]
  models: any[]
  providers: any[]
  conversations: any[]
  servers: any[]
  lastUpdate: Date | null
  connected: boolean
}

interface RealTimeContextType {
  data: RealTimeData
  refreshData: () => void
  loading: boolean
  error: string | null
}

const RealTimeContext = createContext<RealTimeContextType | undefined>(undefined)

interface RealTimeDataProviderProps {
  children: ReactNode
  apiUrl?: string
  wsUrl?: string
}

export function RealTimeDataProvider({ 
  children, 
  apiUrl = "http://localhost:8000",
  wsUrl = "ws://localhost:8000/ws" 
}: RealTimeDataProviderProps) {
  const [data, setData] = useState<RealTimeData>({
    agents: [],
    models: [],
    providers: [],
    conversations: [],
    servers: [],
    lastUpdate: null,
    connected: false
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { connected, lastMessage } = useWebSocket(wsUrl)

  const refreshData = async () => {
    setLoading(true)
    setError(null)

    try {
      const endpoints = [
        '/api/proxy/agents',
        '/api/proxy/models', 
        '/api/proxy/providers',
        '/api/proxy/memory/conversations',
        '/api/proxy/servers'
      ]

      const responses = await Promise.allSettled(
        endpoints.map(endpoint => fetch(endpoint))
      )

      const results = await Promise.allSettled(
        responses.map(async (response, index) => {
          if (response.status === 'fulfilled' && response.value.ok) {
            const data = await response.value.json()
            return { endpoint: endpoints[index], data }
          }
          throw new Error(`Failed to fetch ${endpoints[index]}`)
        })
      )

      const newData: Partial<RealTimeData> = {
        lastUpdate: new Date(),
        connected: true
      }

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const endpoint = result.value.endpoint
          const responseData = result.value.data

          switch (endpoint) {
            case '/api/proxy/agents':
              newData.agents = responseData.agents || []
              break
            case '/api/proxy/models':
              newData.models = responseData.data || []
              break
            case '/api/proxy/providers':
              newData.providers = responseData.providers || responseData.data || []
              break
            case '/api/proxy/memory/conversations':
              newData.conversations = responseData.conversations || responseData
              break
            case '/api/proxy/servers':
              newData.servers = responseData.data || []
              break
          }
        }
      })

      setData(prev => ({ ...prev, ...newData }))
    } catch (err) {
      console.error('[RealTimeDataProvider] Error refreshing data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setData(prev => ({ ...prev, connected: false }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, [])

  useEffect(() => {
    if (lastMessage) {
      // Handle WebSocket messages for real-time updates
      switch (lastMessage.type) {
        case 'agent_update':
          setData(prev => ({
            ...prev,
            agents: prev.agents.map(agent => 
              agent.id === lastMessage.data.id 
                ? { ...agent, ...lastMessage.data }
                : agent
            )
          }))
          break
        case 'model_update':
          setData(prev => ({
            ...prev,
            models: prev.models.map(model => 
              model.id === lastMessage.data.id 
                ? { ...model, ...lastMessage.data }
                : model
            )
          }))
          break
        case 'provider_update':
          setData(prev => ({
            ...prev,
            providers: prev.providers.map(provider => 
              provider.id === lastMessage.data.id 
                ? { ...provider, ...lastMessage.data }
                : provider
            )
          }))
          break
        case 'server_update':
          setData(prev => ({
            ...prev,
            servers: prev.servers.map(server => 
              server.id === lastMessage.data.id 
                ? { ...server, ...lastMessage.data }
                : server
            )
          }))
          break
      }
    }
  }, [lastMessage])

  useEffect(() => {
    setData(prev => ({ ...prev, connected }))
  }, [connected])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refreshData, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <RealTimeContext.Provider value={{ data, refreshData, loading, error }}>
      {children}
    </RealTimeContext.Provider>
  )
}

export function useRealTimeData() {
  const context = useContext(RealTimeContext)
  if (context === undefined) {
    throw new Error('useRealTimeData must be used within a RealTimeDataProvider')
  }
  return context
}
