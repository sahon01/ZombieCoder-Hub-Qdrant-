"use client"

import { useState } from "react"
import { Smartphone, Save, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface MobileEditorConfig {
  apiUrl: string
  enabled: boolean
  autoSync: boolean
  theme: string
  fontSize: number
}

export default function MobileEditorPage() {
  const [config, setConfig] = useState<MobileEditorConfig>({
    apiUrl: "http://localhost:8004",
    enabled: false,
    autoSync: true,
    theme: "dark",
    fontSize: 14,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)

    try {
      const response = await fetch("/api/proxy/mobile-editor/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })

      if (response.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (error) {
      console.log("[v0] Failed to save config:", error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Mobile Editor</h1>
        <p className="mt-2 text-sm text-muted-foreground">Configure mobile app editor API settings</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-6 flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Mobile Editor Configuration</h3>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Mobile Editor</Label>
                  <p className="text-sm text-muted-foreground">Allow mobile devices to connect to the editor API</p>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto Sync</Label>
                  <p className="text-sm text-muted-foreground">Automatically sync changes across devices</p>
                </div>
                <Switch
                  checked={config.autoSync}
                  onCheckedChange={(checked) => setConfig({ ...config, autoSync: checked })}
                />
              </div>

              <div>
                <Label htmlFor="apiUrl">API URL</Label>
                <Input
                  id="apiUrl"
                  value={config.apiUrl}
                  onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                  placeholder="http://localhost:8004"
                  className="mt-2"
                />
                <p className="mt-1 text-xs text-muted-foreground">The URL where the mobile editor API is running</p>
              </div>

              <div>
                <Label htmlFor="theme">Theme</Label>
                <Input
                  id="theme"
                  value={config.theme}
                  onChange={(e) => setConfig({ ...config, theme: e.target.value })}
                  placeholder="dark"
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="fontSize">Font Size</Label>
                <Input
                  id="fontSize"
                  type="number"
                  value={config.fontSize}
                  onChange={(e) => setConfig({ ...config, fontSize: Number.parseInt(e.target.value) })}
                  placeholder="14"
                  className="mt-2"
                />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </Button>

              {saved && (
                <div className="rounded-md bg-success/10 p-4 text-success">Configuration saved successfully</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-4 font-medium">Connection Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className={config.enabled ? "text-success" : "text-muted-foreground"}>
                  {config.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">API Endpoint</span>
                <span className="font-mono text-xs">{config.apiUrl}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Auto Sync</span>
                <span className={config.autoSync ? "text-success" : "text-muted-foreground"}>
                  {config.autoSync ? "On" : "Off"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-2 font-medium">Quick Setup</h3>
            <p className="text-sm text-muted-foreground">
              To use the mobile editor, ensure the mobile editor API is running and accessible from your mobile device.
            </p>
            <div className="mt-4 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-transparent"
                onClick={() => setConfig({ ...config, apiUrl: "http://localhost:8004", enabled: true })}
              >
                Use Local API
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-transparent"
                onClick={() => setConfig({ ...config, theme: "dark", fontSize: 14 })}
              >
                Reset Defaults
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
