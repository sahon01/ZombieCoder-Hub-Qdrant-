"use client"

import { useState, useRef } from "react"
import { Mic, Square, Play, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export default function AudioTestPage() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [transcript, setTranscript] = useState("")
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ transcript?: string; result?: string } | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        setAudioBlob(audioBlob)
        stream.getTracks().forEach((track) => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.log("[v0] Failed to start recording:", error)
      alert("Failed to access microphone. Please check permissions.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleProcess = async () => {
    if (!audioBlob) return

    setProcessing(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("audio", audioBlob, "recording.webm")

      const response = await fetch("/api/proxy/audio/process", {
        method: "POST",
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setResult(data)
        if (data.transcript) {
          setTranscript(data.transcript)
        }
      } else {
        alert("Failed to process audio")
      }
    } catch (error) {
      console.log("[v0] Audio processing error:", error)
      alert("Connection error")
    } finally {
      setProcessing(false)
    }
  }

  const playAudio = () => {
    if (audioBlob) {
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audio.play()
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold">Audio Test</h1>
        <p className="mt-2 text-sm text-muted-foreground">Test audio chat functionality</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-6 flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            <h3 className="font-medium">Audio Recording</h3>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/50 p-12">
              {isRecording ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 animate-pulse">
                    <Mic className="h-10 w-10 text-destructive" />
                  </div>
                  <p className="text-sm font-medium">Recording...</p>
                  <p className="mt-1 text-xs text-muted-foreground">Click stop when finished</p>
                </div>
              ) : audioBlob ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
                    <Mic className="h-10 w-10 text-success" />
                  </div>
                  <p className="text-sm font-medium">Recording Ready</p>
                  <p className="mt-1 text-xs text-muted-foreground">Play or process your recording</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                    <Mic className="h-10 w-10 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Ready to Record</p>
                  <p className="mt-1 text-xs text-muted-foreground">Click the button below to start</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {!isRecording && !audioBlob && (
                <Button onClick={startRecording} className="flex-1">
                  <Mic className="mr-2 h-4 w-4" />
                  Start Recording
                </Button>
              )}
              {isRecording && (
                <Button onClick={stopRecording} variant="destructive" className="flex-1">
                  <Square className="mr-2 h-4 w-4" />
                  Stop Recording
                </Button>
              )}
              {!isRecording && audioBlob && (
                <>
                  <Button onClick={playAudio} variant="outline" className="flex-1 bg-transparent">
                    <Play className="mr-2 h-4 w-4" />
                    Play
                  </Button>
                  <Button onClick={handleProcess} disabled={processing} className="flex-1">
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Process
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      setAudioBlob(null)
                      setResult(null)
                      setTranscript("")
                    }}
                    variant="outline"
                  >
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-6">
            <h3 className="font-medium">Transcript & Results</h3>
            <p className="mt-1 text-sm text-muted-foreground">Audio processing output will appear here</p>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Transcript</Label>
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Transcript will appear here after processing..."
                rows={6}
                className="mt-2"
              />
            </div>

            {result && (
              <div className="rounded-md bg-muted p-4">
                <h4 className="mb-2 text-sm font-medium">Processing Result</h4>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}

            {!result && !audioBlob && (
              <div className="rounded-md border border-dashed border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Record audio to see results</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
