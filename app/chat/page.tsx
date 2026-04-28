"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Mic, Send, Pause, Play, Settings, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Message {
  id: number
  role: "user" | "assistant"
  content: string
  timestamp: string
  audioUrl?: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string>("")
  const [isRecording, setIsRecording] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [playingAudio, setPlayingAudio] = useState<number | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string>("")
  const [agents, setAgents] = useState<any[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [settings, setSettings] = useState({
    voice: "alloy",
    speed: 1.0,
    audioEnabled: false,
  })

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    loadChatHistory()
    loadAgents()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }

  const loadAgents = async () => {
    try {
      const response = await fetch("/api/proxy/agents")
      const data = await response.json()
      setAgents(data.agents || [])
      if (data.agents?.length > 0 && !selectedAgent) {
        setSelectedAgent(data.agents[0].id.toString())
      }
    } catch (error) {
      console.error("[v0] Failed to load agents:", error)
    }
  }

  const loadChatHistory = async () => {
    try {
      const response = await fetch("/api/proxy/chat/history")
      const data = await response.json()
      setMessages(data.messages || [])
      setConversationId(data.conversationId || `conv-${Date.now()}`)
    } catch (error) {
      console.error("[v0] Failed to load chat history:", error)
      setConversationId(`conv-${Date.now()}`)
    }
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: inputMessage,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputMessage("")
    setIsLoading(true)

    try {
      const assistantId = Date.now() + 1
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      const response = await fetch("/api/proxy/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: inputMessage,
          model: undefined,
          agent_id: selectedAgent ? parseInt(selectedAgent) : undefined,
          conversation_id: conversationId,
        }),
      })

      if (!response.ok || !response.body) {
        const fallback = await fetch("/api/proxy/chat/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: inputMessage,
            agent_id: selectedAgent ? parseInt(selectedAgent) : undefined,
            conversationId,
            audioEnabled: settings.audioEnabled,
          }),
        })

        const data = await fallback.json().catch(() => null)
        const text =
          typeof data?.response === "string"
            ? data.response
            : typeof data?.response?.message === "string"
              ? data.response.message
              : ""

        if (data?.success && text) {
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m)))
        } else {
          toast.error("Failed to get response")
        }
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const evt of events) {
          const line = evt
            .split("\n")
            .find((l) => l.startsWith("data:"))
          if (!line) continue

          const raw = line.replace(/^data:\s*/, "").trim()
          if (!raw) continue

          try {
            const payload = JSON.parse(raw)
            if (payload?.type === "chunk" && typeof payload?.content === "string") {
              const chunk = payload.content
              setIsTyping(true)
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content || "") + chunk } : m))
              )
            } else if (payload?.type === "end") {
              setIsTyping(false)
            }
          } catch {
            // ignore invalid event payload
          }
        }
      }
    } catch (error) {
      console.error("[v0] Failed to send message:", error)
      toast.error("Failed to send message")
    } finally {
      setIsLoading(false)
      setIsTyping(false)
    }
  }

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      const audioChunks: Blob[] = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" })
        await processAudioInput(audioBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
      toast.success("Recording started")
    } catch (error) {
      console.error("[v0] Failed to start recording:", error)
      toast.error("Failed to access microphone")
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      toast.success("Recording stopped")
    }
  }

  const processAudioInput = async (audioBlob: Blob) => {
    try {
      const formData = new FormData()
      formData.append("audio", audioBlob)

      const response = await fetch("/api/proxy/chat/speech-to-text", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (data.success && data.text) {
        setInputMessage(data.text)
        toast.success("Audio transcribed")
      }
    } catch (error) {
      console.error("[v0] Failed to process audio:", error)
      toast.error("Failed to transcribe audio")
    }
  }

  const playAudio = (audioUrl: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(audioUrl)
    audio.playbackRate = settings.speed
    audio.play()
    audioRef.current = audio

    audio.onended = () => {
      setPlayingAudio(null)
    }
  }

  const handlePlayAudio = (messageId: number, audioUrl: string) => {
    if (playingAudio === messageId) {
      audioRef.current?.pause()
      setPlayingAudio(null)
    } else {
      playAudio(audioUrl)
      setPlayingAudio(messageId)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">AI Assistant Chat</h1>
          <p className="text-muted-foreground">Chat with AI assistant with voice capabilities</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 min-w-[340px] justify-end">
          <div className="w-[240px]">
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={agents.length ? "Select Agent" : "Loading agents..."} />
              </SelectTrigger>
              <SelectContent>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id.toString()}>
                    <div className="flex items-center gap-2">
                      <span>{agent.name}</span>
                      <span className="text-xs text-muted-foreground">({agent.type})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="whitespace-nowrap" variant="outline" onClick={() => setIsSettingsOpen(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
          <div className="flex flex-col gap-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                >
                  <p className="whitespace-pre-wrap text-balance">{message.content}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs opacity-70">{new Date(message.timestamp).toLocaleTimeString()}</span>
                    {message.audioUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => handlePlayAudio(message.id, message.audioUrl!)}
                      >
                        {playingAudio === message.id ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {(isLoading || isTyping) && (
              <div className="flex justify-start">
                <div className="max-w-[70%] rounded-lg bg-muted p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      {isTyping ? "Typing..." : "Thinking..."}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className={isRecording ? "bg-red-500 text-white hover:bg-red-600" : ""}
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Input
              placeholder="Type your message..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <Button onClick={handleSendMessage} disabled={isLoading || !inputMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voice Settings</DialogTitle>
            <DialogDescription>Configure audio and voice preferences</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="voice">Voice</Label>
              <Select value={settings.voice} onValueChange={(value) => setSettings({ ...settings, voice: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alloy">Alloy</SelectItem>
                  <SelectItem value="echo">Echo</SelectItem>
                  <SelectItem value="fable">Fable</SelectItem>
                  <SelectItem value="onyx">Onyx</SelectItem>
                  <SelectItem value="nova">Nova</SelectItem>
                  <SelectItem value="shimmer">Shimmer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="speed">Speed: {settings.speed.toFixed(1)}x</Label>
              <Slider
                id="speed"
                min={0.5}
                max={2.0}
                step={0.1}
                value={[settings.speed]}
                onValueChange={(value) => setSettings({ ...settings, speed: value[0] })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="audioEnabled">Enable Audio Responses</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettings({ ...settings, audioEnabled: !settings.audioEnabled })}
              >
                {settings.audioEnabled ? "Enabled" : "Disabled"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
