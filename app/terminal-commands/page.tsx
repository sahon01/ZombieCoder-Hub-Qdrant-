"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Copy, Plus, Edit, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

interface Command {
  id: number
  category: string
  command: string
  description: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

const categories = ["All", "System", "Network", "Database", "Security", "Docker", "Git", "Node.js", "Other"]

export default function TerminalCommandsPage() {
  const [commands, setCommands] = useState<Command[]>([])
  const [filteredCommands, setFilteredCommands] = useState<Command[]>([])
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [searchQuery, setSearchQuery] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingCommand, setEditingCommand] = useState<Command | null>(null)
  const [formData, setFormData] = useState({
    category: "System",
    command: "",
    description: "",
  })

  useEffect(() => {
    fetchCommands()
  }, [])

  useEffect(() => {
    filterCommands()
  }, [commands, selectedCategory, searchQuery])

  const fetchCommands = async () => {
    try {
      const response = await fetch("/api/proxy/terminal-commands")
      const data = await response.json()
      setCommands(data.commands || [])
    } catch (error) {
      console.error("[v0] Failed to fetch commands:", error)
      toast.error("Failed to load commands")
    }
  }

  const filterCommands = () => {
    let filtered = commands

    if (selectedCategory !== "All") {
      filtered = filtered.filter((cmd) => cmd.category === selectedCategory)
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (cmd) =>
          cmd.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cmd.description.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    }

    setFilteredCommands(filtered)
  }

  const handleCopyCommand = async (command: Command) => {
    try {
      await navigator.clipboard.writeText(command.command)
      await fetch(`/api/proxy/terminal-commands/${command.id}/use`, {
        method: "POST",
      })
      toast.success("Command copied to clipboard")
      fetchCommands()
    } catch (error) {
      console.error("[v0] Failed to copy command:", error)
      toast.error("Failed to copy command")
    }
  }

  const handleAddCommand = async () => {
    try {
      const response = await fetch("/api/proxy/terminal-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast.success("Command added successfully")
        setIsAddDialogOpen(false)
        setFormData({ category: "System", command: "", description: "" })
        fetchCommands()
      }
    } catch (error) {
      console.error("[v0] Failed to add command:", error)
      toast.error("Failed to add command")
    }
  }

  const handleEditCommand = async () => {
    if (!editingCommand) return

    try {
      const response = await fetch(`/api/proxy/terminal-commands/${editingCommand.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast.success("Command updated successfully")
        setIsEditDialogOpen(false)
        setEditingCommand(null)
        setFormData({ category: "System", command: "", description: "" })
        fetchCommands()
      }
    } catch (error) {
      console.error("[v0] Failed to update command:", error)
      toast.error("Failed to update command")
    }
  }

  const handleDeleteCommand = async (id: number) => {
    if (!confirm("Are you sure you want to delete this command?")) return

    try {
      const response = await fetch(`/api/proxy/terminal-commands/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Command deleted successfully")
        fetchCommands()
      }
    } catch (error) {
      console.error("[v0] Failed to delete command:", error)
      toast.error("Failed to delete command")
    }
  }

  const openEditDialog = (command: Command) => {
    setEditingCommand(command)
    setFormData({
      category: command.category,
      command: command.command,
      description: command.description,
    })
    setIsEditDialogOpen(true)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Terminal Commands</h1>
          <p className="text-muted-foreground">Manage and organize your terminal commands</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Command
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4">
        {filteredCommands.map((command) => (
          <Card key={command.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">{command.category}</span>
                  <span className="text-xs text-muted-foreground">Used {command.usageCount} times</span>
                </div>
                <code className="block rounded-md bg-muted p-3 font-mono text-sm">{command.command}</code>
                <p className="mt-2 text-sm text-muted-foreground">{command.description}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleCopyCommand(command)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEditDialog(command)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDeleteCommand(command.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {filteredCommands.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No commands found</p>
          </Card>
        )}
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Terminal Command</DialogTitle>
            <DialogDescription>Add a new command to your collection</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.slice(1).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="command">Command</Label>
              <Input
                id="command"
                value={formData.command}
                onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                placeholder="ls -la"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="List all files with details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCommand}>Add Command</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Terminal Command</DialogTitle>
            <DialogDescription>Update the command details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.slice(1).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-command">Command</Label>
              <Input
                id="edit-command"
                value={formData.command}
                onChange={(e) => setFormData({ ...formData, command: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditCommand}>Update Command</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
