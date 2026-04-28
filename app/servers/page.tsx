"use client";

import { useEffect, useState } from "react";
import { 
  Server, 
  Loader2, 
  RefreshCw, 
  Plus, 
  Search, 
  Filter,
  Activity,
  HardDrive,
  Clock,
  MapPin,
  Wifi,
  WifiOff,
  AlertTriangle,
  Wrench,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Server {
  id: number;
  name: string;
  hostname: string;
  ip_address: string;
  location: string;
  status: "online" | "offline" | "maintenance" | "degraded";
  cpu_load: number;
  memory_usage: number;
  disk_usage: number;
  uptime_seconds: number;
  last_heartbeat: string;
  provider_id: number | null;
  provider_name: string | null;
  provider_type: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

interface ServerStats {
  total_servers: number;
  online_servers: number;
  offline_servers: number;
  maintenance_servers: number;
  degraded_servers: number;
  avg_cpu_load: number;
  avg_memory_usage: number;
  avg_disk_usage: number;
}

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchServers = async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "12"
      });
      
      if (searchTerm) {
        params.append("hostname", searchTerm);
      }
      
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const response = await fetch(`/api/proxy/servers?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setServers(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
        } else {
          setServers([]);
        }
      } else {
        setServers([]);
      }
    } catch (error) {
      console.log("[v0] Failed to fetch servers:", error);
      setServers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/proxy/servers/stats/summary");
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data.overall);
        }
      }
    } catch (error) {
      console.log("[v0] Failed to fetch server stats:", error);
    }
  };

  useEffect(() => {
    fetchServers();
    fetchStats();
    const interval = setInterval(() => {
      fetchServers();
      fetchStats();
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [currentPage, searchTerm, statusFilter]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchServers();
    fetchStats();
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "online":
        return <Wifi className="h-4 w-4 text-green-500" />;
      case "offline":
        return <WifiOff className="h-4 w-4 text-red-500" />;
      case "maintenance":
        return <Wrench className="h-4 w-4 text-yellow-500" />;
      case "degraded":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <WifiOff className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";
    switch (status) {
      case "online":
        return `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`;
      case "offline":
        return `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`;
      case "maintenance":
        return `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200`;
      case "degraded":
        return `${baseClasses} bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200`;
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         server.hostname.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         server.ip_address?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || server.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Server Management</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Monitor and manage all your infrastructure servers
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Servers</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_servers}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Online</CardTitle>
              <Wifi className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.online_servers}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Offline</CardTitle>
              <WifiOff className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.offline_servers}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg CPU Load</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avg_cpu_load?.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search servers by name, hostname, or IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="degraded">Degraded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Server Grid */}
      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading servers...</span>
          </div>
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Server className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No servers found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {searchTerm || statusFilter !== "all" 
              ? "Try adjusting your search or filter criteria" 
              : "Add your first server to get started"}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredServers.map((server) => (
            <Card key={server.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-primary/10 p-2">
                      <Server className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">{server.name}</CardTitle>
                      <CardDescription className="text-sm font-mono">
                        {server.hostname}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      <DropdownMenuItem>Edit Server</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        Delete Server
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={getStatusBadge(server.status)}>
                    {getStatusIcon(server.status)}
                    {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
                  </span>
                  {server.location && (
                    <Badge variant="secondary" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {server.location}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-3">
                {server.ip_address && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">IP Address</span>
                    <span className="font-mono text-xs">{server.ip_address}</span>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">CPU Load</span>
                    <span className="text-sm font-medium">{server.cpu_load.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div 
                      className={`h-2 rounded-full ${
                        server.cpu_load > 80 ? 'bg-red-500' : 
                        server.cpu_load > 60 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(server.cpu_load, 100)}%` }}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Memory</span>
                    <span className="text-sm font-medium">{server.memory_usage.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div 
                      className={`h-2 rounded-full ${
                        server.memory_usage > 80 ? 'bg-red-500' : 
                        server.memory_usage > 60 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(server.memory_usage, 100)}%` }}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Disk</span>
                    <span className="text-sm font-medium">{server.disk_usage.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div 
                      className={`h-2 rounded-full ${
                        server.disk_usage > 90 ? 'bg-red-500' : 
                        server.disk_usage > 75 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(server.disk_usage, 100)}%` }}
                    />
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-2 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Uptime</span>
                  </div>
                  <span className="font-medium">{formatUptime(server.uptime_seconds)}</span>
                </div>
                
                {server.provider_name && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Provider</span>
                    <Badge variant="outline">{server.provider_name}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}