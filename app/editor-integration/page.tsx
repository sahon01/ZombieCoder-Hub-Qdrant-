"use client"

import { useState } from "react"
import { Code2, Send, FileCode, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function EditorIntegrationPage() {
  const [filePath, setFilePath] = useState("")
  const [content, setContent] = useState("")
  const [action, setAction] = useState<"open" | "save" | "insert">("open")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<"Connected" | "Not Connected">("Not Connected")

  const handleSend = async () => {
    if (!filePath.trim()) return

    setSending(true)
    setResult(null)
    setConnectionStatus("Not Connected")

    try {
      const response = await fetch("/api/proxy/editor/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          content,
          action,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setConnectionStatus("Connected")
        setResult({
          success: true,
          message: data.message || "Successfully sent to VS Code",
        })
        if (action === "save" || action === "insert") {
          setContent("")
        }
      } else {
        setResult({
          success: false,
          message: "Failed to send to VS Code",
        })
      }
    } catch (error) {
      console.log("[v0] Editor send error:", error)
      setResult({
        success: false,
        message: "Connection error",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Editor Integration</h1>
        <p className="mt-2 text-sm text-muted-foreground">Send files and configurations to your local VS Code editor</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-6 flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Send to VS Code</h3>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="action">Action</Label>
                <Select value={action} onValueChange={(value: any) => setAction(value)}>
                  <SelectTrigger id="action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open File</SelectItem>
                    <SelectItem value="save">Save Content</SelectItem>
                    <SelectItem value="insert">Insert at Cursor</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {action === "open" && "Open the specified file in VS Code"}
                  {action === "save" && "Save the content to the specified file"}
                  {action === "insert" && "Insert content at the current cursor position"}
                </p>
              </div>

              <div>
                <Label htmlFor="filePath">File Path</Label>
                <Input
                  id="filePath"
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="/path/to/file.ts"
                />
              </div>

              {(action === "save" || action === "insert") && (
                <div>
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter content to send..."
                    rows={12}
                  />
                </div>
              )}

              <Button onClick={handleSend} disabled={!filePath.trim() || sending} className="w-full">
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send to VS Code
                  </>
                )}
              </Button>

              {result && (
                <div
                  className={`rounded-md p-4 ${
                    result.success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {result.message}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <FileCode className="h-5 w-5 text-primary" />
              <h3 className="font-medium">Quick Actions</h3>
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-transparent"
                onClick={() => {
                  setAction("open")
                  setFilePath("src/app/page.tsx")
                }}
              >
                Open Main Page
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-transparent"
                onClick={() => {
                  setAction("open")
                  setFilePath("src/components/")
                }}
              >
                Open Components
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-transparent"
                onClick={() => {
                  setAction("open")
                  setFilePath(".env.local")
                }}
              >
                Open Environment
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="mb-2 font-medium">Configuration</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">VS Code API</span>
                <span className="font-mono text-xs">localhost:8000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={`font-medium ${connectionStatus === "Connected" ? "text-success" : "text-warning"}`}>
                  {connectionStatus}
                </span>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Configure VS Code integration in your environment variables
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
