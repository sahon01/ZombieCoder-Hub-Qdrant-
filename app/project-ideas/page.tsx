"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sparkles, Download, Volume2, Loader2, FileText, Code, Layers } from "lucide-react"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ProjectIdea {
  title: string
  description: string
  features: string[]
  techStack: string[]
  audioUrl?: string
}

export default function ProjectIdeasPage() {
  const [input, setInput] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [projectIdea, setProjectIdea] = useState<ProjectIdea | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [exportFormat, setExportFormat] = useState<"pdf" | "markdown" | "json">("pdf")
  const [audioEnabled, setAudioEnabled] = useState(false)

  const templates = [
    {
      name: "Web Application",
      description: "A full-stack web application with user authentication and database",
    },
    {
      name: "Mobile App",
      description: "A cross-platform mobile application with native features",
    },
    {
      name: "API Service",
      description: "A RESTful API service with documentation and testing",
    },
    {
      name: "Chrome Extension",
      description: "A browser extension with background scripts and popup UI",
    },
    {
      name: "CLI Tool",
      description: "A command-line tool with interactive prompts and configuration",
    },
  ]

  const handleGenerate = async () => {
    if (!input.trim()) {
      toast.error("Please enter a project idea")
      return
    }

    setIsGenerating(true)

    try {
      const response = await fetch("/api/proxy/project-ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: input,
          includeAudio: audioEnabled,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setProjectIdea(data.idea)
        toast.success("Project idea generated successfully")

        if (audioEnabled && data.idea.audioUrl) {
          playAudio(data.idea.audioUrl)
        }
      } else {
        toast.error("Failed to generate project idea")
      }
    } catch (error) {
      console.error("[v0] Failed to generate project idea:", error)
      toast.error("Failed to generate project idea")
    } finally {
      setIsGenerating(false)
    }
  }

  const playAudio = (audioUrl: string) => {
    const audio = new Audio(audioUrl)
    setIsPlayingAudio(true)

    audio.onended = () => {
      setIsPlayingAudio(false)
    }

    audio.play()
  }

  const handleExport = async () => {
    if (!projectIdea) {
      toast.error("No project idea to export")
      return
    }

    try {
      const response = await fetch("/api/proxy/project-ideas/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: projectIdea,
          format: exportFormat,
        }),
      })

      const data = await response.json()

      if (data.success) {
        window.open(data.downloadUrl, "_blank")
        toast.success(`Exported as ${exportFormat.toUpperCase()}`)
      } else {
        toast.error("Failed to export project idea")
      }
    } catch (error) {
      console.error("[v0] Failed to export project idea:", error)
      toast.error("Failed to export project idea")
    }
  }

  const useTemplate = (template: { name: string; description: string }) => {
    setInput(`I want to build a ${template.name.toLowerCase()}: ${template.description}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Project Ideas & Documentation</h1>
        <p className="text-muted-foreground">Generate project ideas with AI assistance and export documentation</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="input">Describe Your Project Idea</Label>
              <Textarea
                id="input"
                placeholder="I want to build a task management app with AI-powered prioritization..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="mt-2 min-h-[200px]"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label htmlFor="audioEnabled">Enable Audio Output</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAudioEnabled(!audioEnabled)}
                  className={audioEnabled ? "bg-primary text-primary-foreground" : ""}
                >
                  {audioEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
            </div>

            <Button onClick={handleGenerate} disabled={isGenerating} className="w-full">
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Project Idea
                </>
              )}
            </Button>

            <div className="border-t pt-4">
              <Label className="mb-3 block">Quick Templates</Label>
              <div className="grid gap-2">
                {templates.map((template) => (
                  <Button
                    key={template.name}
                    variant="outline"
                    className="justify-start text-left bg-transparent"
                    onClick={() =>
                      setInput(`I want to build a ${template.name.toLowerCase()}: ${template.description}`)
                    }
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.description}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          {projectIdea ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">{projectIdea.title}</h2>
                {projectIdea.audioUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => playAudio(projectIdea.audioUrl!)}
                    disabled={isPlayingAudio}
                  >
                    <Volume2 className="mr-2 h-4 w-4" />
                    {isPlayingAudio ? "Playing..." : "Listen"}
                  </Button>
                )}
              </div>

              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">
                    <FileText className="mr-2 h-4 w-4" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="features">
                    <Layers className="mr-2 h-4 w-4" />
                    Features
                  </TabsTrigger>
                  <TabsTrigger value="tech">
                    <Code className="mr-2 h-4 w-4" />
                    Tech Stack
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4">
                  <ScrollArea className="h-[400px]">
                    <div className="pr-4">
                      <p className="whitespace-pre-wrap text-balance leading-relaxed">{projectIdea.description}</p>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="features" className="mt-4">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2 pr-4">
                      {projectIdea.features.map((feature, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
                          <p className="flex-1 text-balance">{feature}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="tech" className="mt-4">
                  <ScrollArea className="h-[400px]">
                    <div className="flex flex-wrap gap-2 pr-4">
                      {projectIdea.techStack.map((tech, index) => (
                        <div key={index} className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium">
                          {tech}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>

              <div className="border-t pt-4">
                <Label className="mb-2 block">Export Documentation</Label>
                <div className="flex gap-2">
                  <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF Document</SelectItem>
                      <SelectItem value="markdown">Markdown</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleExport} className="flex-1">
                    <Download className="mr-2 h-4 w-4" />
                    Export as {exportFormat.toUpperCase()}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[600px] items-center justify-center text-center">
              <div>
                <Sparkles className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-lg font-medium">No project idea generated yet</p>
                <p className="text-sm text-muted-foreground">Enter your idea and click generate to get started</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
