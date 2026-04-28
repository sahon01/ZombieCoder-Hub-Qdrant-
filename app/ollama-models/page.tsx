"use client";

import { useEffect, useState } from "react";
import { Server, Loader2, Play, Square, RefreshCw, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

export default function OllamaModelsPage() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullModelName, setPullModelName] = useState("");

  const fetchModels = async () => {
    try {
      const response = await fetch("/api/proxy/ollama/models");
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setModels(data.data);
        } else if (Array.isArray(data)) {
          setModels(data);
        } else {
          setModels([]);
        }
      } else {
        setModels([]);
      }
    } catch (error) {
      console.log("[v0] Failed to fetch Ollama models:", error);
      setModels([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchModels();
    const interval = setInterval(fetchModels, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchModels();
  };

  const handlePullModel = async () => {
    if (!pullModelName.trim()) return;

    setPulling(true);
    try {
      const response = await fetch("/api/proxy/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName: pullModelName.trim() }),
      });

      if (response.ok) {
        setPullModelName("");
        fetchModels(); // Refresh the list after pulling
      }
    } catch (error) {
      console.log("[v0] Failed to pull model:", error);
    } finally {
      setPulling(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "text-success";
      case "stopped":
        return "text-muted-foreground";
      case "error":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
    switch (status) {
      case "running":
        return `${baseClasses} bg-success/10 text-success`;
      case "stopped":
        return `${baseClasses} bg-muted text-muted-foreground`;
      case "error":
        return `${baseClasses} bg-destructive/10 text-destructive`;
      default:
        return `${baseClasses} bg-muted text-muted-foreground`;
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Ollama Models</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage and monitor your Ollama models</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Pull New Model Section */}
      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-medium">Pull New Model</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter model name (e.g., llama2:7b, mistral:latest)"
            value={pullModelName}
            onChange={(e) => setPullModelName(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={pulling}
          />
          <Button onClick={handlePullModel} disabled={!pullModelName.trim() || pulling}>
            {pulling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pulling...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Pull
              </>
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Enter a model name from Ollama Library (e.g., llama2:7b, mistral:latest, neural-chat:7b)
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading models...</span>
          </div>
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Server className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No models found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Pull a model from the Ollama library to get started
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <div key={model.digest} className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <Server className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{model.name}</h3>
                    <p className="text-sm text-muted-foreground">{model.details?.family || ""}</p>
                  </div>
                </div>
                <span className={getStatusBadge("stopped")}>available</span>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Size</span>
                  <span className="font-medium">{formatBytes(model.size)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Parameters</span>
                  <span className="font-medium">{model.details?.parameter_size || ""}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Quantization</span>
                  <span className="font-mono text-xs">{model.details?.quantization_level || ""}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Modified</span>
                  <span className="font-mono text-xs">
                    {new Date(model.modified_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                  <Play className="mr-2 h-3 w-3" />
                  Run
                </Button>
                <Button variant="outline" size="sm" className="bg-transparent">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}