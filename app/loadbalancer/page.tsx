"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Scale, Loader2, Play, Square, RefreshCw, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface LoadBalancerInstance {
  id: string
  model: string
  host: string
  port: number
  cpu?: number
  mem?: number
  weight: number
  status: "active" | "inactive" | "error"
  maxConnections?: number
  currentConnections?: number
}

export default function LoadBalancerPage() {
  const [instances, setInstances] = useState<LoadBalancerInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [strategy, setStrategy] = useState<string>("round-robin")

  useEffect(() => {
    fetchInstances()
  }, [])

  const fetchInstances = async () => {
    try {
      const response = await fetch("/api/proxy/loadbalancer/instances")
      if (response.ok) {
        const data = await response.json()
        setInstances(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.log("[v0] Failed to fetch instances:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchInstances()
  }

  const handleToggleInstance = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active"
    try {
      await fetch(`/api/proxy/loadbalancer/instances/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      fetchInstances()
    } catch (error) {
      console.log("[v0] Failed to toggle instance:", error)
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
          <h1 className="text-3xl font-semibold">Load Balancer</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage model instance load balancing</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Instance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Load Balancer Instance</DialogTitle>
              </DialogHeader>
              <AddInstanceForm onSuccess={fetchInstances} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Load Balancing Strategy</h3>
            <p className="mt-1 text-sm text-muted-foreground">Select how requests are distributed across instances</p>
          </div>
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round-robin">Round Robin</SelectItem>
              <SelectItem value="weighted">Weighted</SelectItem>
              <SelectItem value="least-connections">Least Connections</SelectItem>
              <SelectItem value="response-time">Response Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading instances...</span>
          </div>
        </div>
      ) : instances.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Scale className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No instances configured</h3>
          <p className="mt-2 text-sm text-muted-foreground">Add your first load balancer instance to get started</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {instances.map((instance) => (
            <div key={instance.id} className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Scale className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{instance.model}</h3>
                    <p className="text-sm text-muted-foreground">
                      {instance.host}:{instance.port}
                    </p>
                  </div>
                </div>
                <span className={getStatusBadge(instance.status)}>{instance.status}</span>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Weight</span>
                  <span className="font-medium">{instance.weight}</span>
                </div>
                {instance.cpu !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">CPU</span>
                    <span className="font-medium">{instance.cpu.toFixed(1)}%</span>
                  </div>
                )}
                {instance.mem !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-medium">{instance.mem.toFixed(1)}%</span>
                  </div>
                )}
                {instance.currentConnections !== undefined && instance.maxConnections !== undefined && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Connections</span>
                    <span className="font-medium">
                      {instance.currentConnections}/{instance.maxConnections}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-transparent"
                  onClick={() => handleToggleInstance(instance.id, instance.status)}
                >
                  {instance.status === "active" ? (
                    <>
                      <Square className="mr-2 h-3 w-3" />
                      Deactivate
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-3 w-3" />
                      Activate
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddInstanceForm({ onSuccess }: { onSuccess: () => void }) {
  const [model, setModel] = useState("")
  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState("")
  const [weight, setWeight] = useState("1")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch("/api/proxy/loadbalancer/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          host,
          port: Number.parseInt(port),
          weight: Number.parseInt(weight),
        }),
      })
      if (response.ok) {
        onSuccess()
      }
    } catch (error) {
      console.log("[v0] Failed to add instance:", error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="model">Model Name</Label>
        <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4" required />
      </div>
      <div>
        <Label htmlFor="host">Host</Label>
        <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="localhost" required />
      </div>
      <div>
        <Label htmlFor="port">Port</Label>
        <Input
          id="port"
          type="number"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="5000"
          required
        />
      </div>
      <div>
        <Label htmlFor="weight">Weight</Label>
        <Input
          id="weight"
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="1"
          required
        />
      </div>
      <Button type="submit" className="w-full">
        Add Instance
      </Button>
    </form>
  )
}
