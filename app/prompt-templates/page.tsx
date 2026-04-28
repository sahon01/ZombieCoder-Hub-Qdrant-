"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { FileCode, Loader2, Plus, Edit, Trash2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface PromptTemplate {
  id: string
  name: string
  description?: string
  template: string
  variables?: string[]
  createdAt?: string
  updatedAt?: string
}

export default function PromptTemplatesPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [testTemplate, setTestTemplate] = useState<PromptTemplate | null>(null)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const response = await fetch("/api/proxy/prompt-templates")
      if (response.ok) {
        const data = await response.json()
        setTemplates(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.log("[v0] Failed to fetch templates:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (template: Partial<PromptTemplate>) => {
    try {
      const url = editingTemplate ? `/api/proxy/prompt-templates/${editingTemplate.id}` : "/api/proxy/prompt-templates"

      const response = await fetch(url, {
        method: editingTemplate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      })

      if (response.ok) {
        fetchTemplates()
        setIsDialogOpen(false)
        setEditingTemplate(null)
      }
    } catch (error) {
      console.log("[v0] Failed to save template:", error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/proxy/prompt-templates/${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        fetchTemplates()
      }
    } catch (error) {
      console.log("[v0] Failed to delete template:", error)
    }
  }

  const openEditDialog = (template?: PromptTemplate) => {
    setEditingTemplate(template || null)
    setIsDialogOpen(true)
  }

  const openTestDialog = (template: PromptTemplate) => {
    setTestTemplate(template)
    setTestDialogOpen(true)
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Prompt Templates</h1>
          <p className="mt-2 text-sm text-muted-foreground">Create and manage prompt templates</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openEditDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? "Edit Template" : "New Template"}</DialogTitle>
            </DialogHeader>
            <TemplateForm template={editingTemplate} onSave={handleSave} onCancel={() => setIsDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card p-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading templates...</span>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <FileCode className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No templates found</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create your first prompt template to get started</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-primary/10 p-2">
                    <FileCode className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{template.name}</h3>
                    {template.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mb-4 rounded-md bg-muted p-3">
                <p className="line-clamp-3 text-sm font-mono">{template.template}</p>
              </div>

              {template.variables && template.variables.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs text-muted-foreground">Variables:</p>
                  <div className="flex flex-wrap gap-1">
                    {template.variables.map((variable) => (
                      <span key={variable} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 bg-transparent"
                  onClick={() => openTestDialog(template)}
                >
                  <Play className="mr-2 h-3 w-3" />
                  Test
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEditDialog(template)}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(template.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Template</DialogTitle>
          </DialogHeader>
          {testTemplate && (
            <div className="space-y-4">
              <div>
                <Label>Template</Label>
                <div className="mt-2 rounded-md bg-muted p-3">
                  <p className="text-sm font-mono">{testTemplate.template}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Template testing will be available when connected to the UAS backend
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateForm({
  template,
  onSave,
  onCancel,
}: {
  template: PromptTemplate | null
  onSave: (template: Partial<PromptTemplate>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(template?.name || "")
  const [description, setDescription] = useState(template?.description || "")
  const [templateText, setTemplateText] = useState(template?.template || "")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name,
      description,
      template: templateText,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" required />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description"
        />
      </div>
      <div>
        <Label htmlFor="template">Template</Label>
        <Textarea
          id="template"
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          placeholder="Enter your prompt template..."
          rows={8}
          required
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
